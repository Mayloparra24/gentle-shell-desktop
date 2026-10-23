import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { LineSplitter } from "../domain/rpc/codec";
import type { ProcessSpawner, SpawnedProcess } from "../ports";

export interface NodeProcessSpawnerOptions {
  /** child_process.spawn replacement, for tests. */
  readonly spawn?: typeof spawn;
  /** Platform override, for testing the win32 behavior anywhere. */
  readonly platform?: NodeJS.Platform;
}

// Same rule as gentle-shell's own launcher (lib/gentle-shell-launcher.ts):
// quote a token when it is empty or holds whitespace or any of `"&|<>^%()`,
// and escape an inner `"` as `\"`. `%VAR%` still expands inside quotes in
// cmd.exe; accepted, as upstream does, since paths with `%` are rare.
const CMD_EXE_SPECIAL_CHARS = /[\s"&|<>^%()]/;

function quoteForCmdExe(token: string): string {
  if (token.length > 0 && !CMD_EXE_SPECIAL_CHARS.test(token)) return token;
  return `"${token.replace(/"/g, '\\"')}"`;
}

/**
 * child_process.spawn-backed ProcessSpawner, line-splitting stdout/stderr through the domain LineSplitter.
 *
 * On win32 a `.cmd`/`.bat` shim (how an npm-installed `gentle-shell` lands on
 * PATH) cannot be spawned directly: current Node fails with EINVAL/EFTYPE.
 * It is routed through the shell as one quoted command line instead, and the
 * console window is hidden so no cmd window opens per chat.
 */
export function createNodeProcessSpawner(options: NodeProcessSpawnerOptions = {}): ProcessSpawner {
  const spawnFn = options.spawn ?? spawn;
  const platform = options.platform ?? process.platform;

  return {
    spawn(command, args, env, cwd): SpawnedProcess {
      const isBatch = platform === "win32" && /\.(cmd|bat)$/i.test(command);
      const child = isBatch
        ? spawnFn([command, ...args].map(quoteForCmdExe).join(" "), [], {
            env,
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            shell: true,
          })
        : spawnFn(command, [...args], { env, cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

      const stdoutLineHandlers: Array<(line: string) => void> = [];
      const stderrLineHandlers: Array<(line: string) => void> = [];
      const errorHandlers: Array<(error: Error) => void> = [];

      wireLineStream(child.stdout, stdoutLineHandlers);
      wireLineStream(child.stderr, stderrLineHandlers);

      child.on("error", (error: Error) => {
        for (const handler of errorHandlers) handler(error);
      });
      // No 'error' listener on stdin would otherwise crash the Electron
      // main process on a write after the stream ends (e.g. EPIPE after
      // the child died, or a write during stop()'s grace window).
      child.stdin?.on("error", (error: Error) => {
        for (const handler of errorHandlers) handler(error);
      });

      // 'close' fires after both a normal exit AND a spawn failure (Node
      // always emits 'close' after 'exit' or 'error'); 'exit' alone never
      // fires when the child never started, which left `exited` unsettled
      // forever. Also resolve on 'error' as a belt-and-suspenders guard.
      let settled = false;
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
        const settle = (result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        child.on("close", (code, signal) => settle({ code, signal }));
        child.on("error", (error: Error) => settle({ code: null, signal: null, error }));
      });

      let stdinEnded = false;

      return {
        exited,
        writeStdin(text: string) {
          if (stdinEnded || !child.stdin || child.stdin.destroyed) return;
          child.stdin.write(text);
        },
        endStdin() {
          if (stdinEnded || !child.stdin) return;
          stdinEnded = true;
          child.stdin.end();
        },
        onStdoutLine(handler) {
          stdoutLineHandlers.push(handler);
        },
        onStderrLine(handler) {
          stderrLineHandlers.push(handler);
        },
        onError(handler) {
          errorHandlers.push(handler);
        },
        kill(signal) {
          child.kill(signal);
        },
      };
    },
  };
}

function wireLineStream(stream: Readable | null, handlers: Array<(line: string) => void>): void {
  if (!stream) return;
  const splitter = new LineSplitter();
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    for (const line of splitter.push(chunk)) {
      for (const handler of handlers) handler(line);
    }
  });
  stream.on("end", () => {
    for (const line of splitter.flush()) {
      for (const handler of handlers) handler(line);
    }
  });
}

import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createNodeProcessSpawner } from "./nodeProcessSpawner";

type SpawnCall = { command: string; args: readonly string[]; options: Record<string, unknown> };

/** A spawn replacement that records its call and returns an inert child. */
function fakeSpawn(): { spawn: typeof spawn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const fake = (command: string, args: readonly string[], options: Record<string, unknown>) => {
    calls.push({ command, args, options });
    return Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
    });
  };
  return { spawn: fake as unknown as typeof spawn, calls };
}

const ENV = { PATH: "x" };

function only(calls: SpawnCall[]): SpawnCall {
  const call = calls[0];
  if (!call) throw new Error("spawn was not called");
  return call;
}

describe("createNodeProcessSpawner", () => {
  it("spawns a plain executable directly with its args, as before", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "linux" }).spawn("/usr/bin/gentle-shell", ["--mode", "rpc"], ENV, "/work");

    expect(calls).toHaveLength(1);
    expect(only(calls).command).toBe("/usr/bin/gentle-shell");
    expect(only(calls).args).toEqual(["--mode", "rpc"]);
    expect(only(calls).options).toMatchObject({ env: ENV, cwd: "/work", stdio: ["pipe", "pipe", "pipe"] });
    expect(only(calls).options.shell).toBeUndefined();
  });

  it("routes a win32 .cmd shim through the shell as one command line", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn("C:\\npm\\gentle-shell.cmd", ["--mode", "rpc"], ENV);

    expect(only(calls).command).toBe("C:\\npm\\gentle-shell.cmd --mode rpc");
    expect(only(calls).args).toEqual([]);
    expect(only(calls).options.shell).toBe(true);
  });

  it("quotes a .cmd path and arguments that contain spaces", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn(
      "C:\\Users\\Ana Maria\\npm\\gentle-shell.cmd",
      ["--session", "C:\\Users\\Ana Maria\\s.jsonl"],
      ENV,
    );

    expect(only(calls).command).toBe(
      '"C:\\Users\\Ana Maria\\npm\\gentle-shell.cmd" --session "C:\\Users\\Ana Maria\\s.jsonl"',
    );
  });

  it("quotes safe ampersands and empty arguments", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn("C:\\a\\x.bat", ["a&b", ""], ENV);

    expect(only(calls).command).toBe('C:\\a\\x.bat "a&b" ""');
  });

  for (const ext of ["cmd", "bat"]) {
    for (const token of ['x" & echo SP_SAFE_MARKER & rem "', "%SP_PROBE_WORD%", "a!b", "a^b", "a\rb", "a\nb"]) {
      for (const location of ["command", "argument"]) {
        it(`rejects unsafe ${location} ${JSON.stringify(token)} for .${ext} before spawn`, () => {
          const { spawn, calls } = fakeSpawn();
          const command = location === "command" ? `C:\\${token}\\run.${ext}` : `C:\\run.${ext}`;
          expect(() => createNodeProcessSpawner({ spawn, platform: "win32" }).spawn(
            command, location === "argument" ? [token, "after"] : [], ENV,
          )).toThrow("Unsafe Windows batch token; use GENTLE_SHELL_BIN with a supported .mjs entry instead.");
          expect(calls).toEqual([]);
        });
      }
    }
  }

  it.each([
    ["win32", "C:\\run.exe"], ["win32", "C:\\entry.mjs"],
    ["linux", "/tmp/run.cmd"], ["darwin", "/tmp/run.bat"],
  ] as const)("preserves unrestricted tokens on %s direct route %s", (platform, command) => {
    const { spawn, calls } = fakeSpawn();
    const args = ['say "hi"', "%SP_PROBE_WORD%", "a!b^c\n", "C:\\Folder Space\\", "after"];
    createNodeProcessSpawner({ spawn, platform }).spawn(command, args, ENV);
    expect(calls).toHaveLength(1);
    expect(only(calls)).toMatchObject({ command, args });
    expect(only(calls).options.shell).toBeUndefined();
  });

  it("does not use the shell for a win32 .exe", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn("C:\\bin\\gentle-shell.exe", ["--mode", "rpc"], ENV);

    expect(only(calls).command).toBe("C:\\bin\\gentle-shell.exe");
    expect(only(calls).args).toEqual(["--mode", "rpc"]);
    expect(only(calls).options.shell).toBeUndefined();
  });

  it("never uses the shell off win32, even for a .cmd name", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "linux" }).spawn("/tmp/run.cmd", ["a b"], ENV);

    expect(only(calls).command).toBe("/tmp/run.cmd");
    expect(only(calls).args).toEqual(["a b"]);
    expect(only(calls).options.shell).toBeUndefined();
  });

  it("hides the console window so no cmd window opens per chat", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn("C:\\bin\\gentle-shell.exe", [], ENV);

    expect(only(calls).options.windowsHide).toBe(true);
  });
});

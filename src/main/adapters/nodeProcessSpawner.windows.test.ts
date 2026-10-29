import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeProcessSpawner } from "./nodeProcessSpawner";
import type { SpawnedProcess } from "../ports";

// Real cmd.exe + Node argv parsing, not a second implementation of quoting.
describe.skipIf(process.platform !== "win32")("Windows batch ProcessSpawner", () => {
  for (const ext of ["cmd", "bat"]) {
    it(`preserves argv/stdin/stdout/stderr/exit through .${ext} in a space & directory`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "spawner space & fixture-"));
      let child: SpawnedProcess | undefined;
      try {
        const fixture = path.join(dir, "fixture.cjs");
        writeFileSync(fixture, `
const timer = setTimeout(() => process.exit(9), 3000);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(timer);
  console.log(JSON.stringify({ args: process.argv.slice(2), stdin: input }));
  console.error('fixture stderr');
  process.exitCode = 7;
});
`);
        const shim = path.join(dir, `run.${ext}`);
        writeFileSync(shim, '@echo off\r\n"%SP_NODE%" "%SP_FIXTURE%" %*\r\n@exit /b %errorlevel%\r\n');
        const args = ["ordinary", "a b", "", "a&b", "C:\\Folder Space\\", "after", "C:\\Folder Space\\\\", "last"];
        child = createNodeProcessSpawner().spawn(shim, args, {
          ...process.env, SP_NODE: process.execPath, SP_FIXTURE: fixture,
        }, dir);
        const stdout: string[] = [];
        const stderr: string[] = [];
        const errors: Error[] = [];
        child.onStdoutLine(line => stdout.push(line));
        child.onStderrLine(line => stderr.push(line));
        child.onError(error => errors.push(error));
        child.writeStdin("fixture input\n");
        child.endStdin();
        expect(await child.exited).toEqual({ code: 7, signal: null });
        expect(errors).toEqual([]);
        expect(stdout).toEqual([JSON.stringify({ args, stdin: "fixture input\n" })]);
        expect(stderr).toEqual(["fixture stderr"]);
        expect(stdout.join("\n") + stderr.join("\n")).not.toContain("SP_SAFE_MARKER");
      } finally {
        child?.endStdin();
        if (child) await child.exited;
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`launches .${ext} from a directory with parentheses`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "spawner (parens) -"));
      let child: SpawnedProcess | undefined;
      try {
        const fixture = path.join(dir, "fixture.cjs");
        writeFileSync(fixture, "console.log(JSON.stringify(process.argv.slice(2)));\n");
        const shim = path.join(dir, `run.${ext}`);
        writeFileSync(shim, '@echo off\r\n"%SP_NODE%" "%SP_FIXTURE%" %*\r\n@exit /b %errorlevel%\r\n');
        const args = ["C:\\Folder Space\\", "after"];
        child = createNodeProcessSpawner().spawn(shim, args, { ...process.env, SP_NODE: process.execPath, SP_FIXTURE: fixture }, dir);
        const stdout: string[] = [];
        child.onStdoutLine(line => stdout.push(line));
        child.endStdin();
        expect(await child.exited).toEqual({ code: 0, signal: null });
        expect(stdout).toEqual([JSON.stringify(args)]);
      } finally {
        child?.endStdin();
        if (child) await child.exited;
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`kill() ends the whole process tree behind .${ext}, not just cmd.exe`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "spawner-kill-"));
      let grandchild = 0;
      try {
        const pidFile = path.join(dir, "pid.txt");
        const fixture = path.join(dir, "fixture.cjs");
        writeFileSync(fixture, "require('node:fs').writeFileSync(process.env.SP_PID_FILE, String(process.pid)); setTimeout(() => {}, 60000);\n");
        const shim = path.join(dir, `run.${ext}`);
        writeFileSync(shim, '@echo off\r\n"%SP_NODE%" "%SP_FIXTURE%" %*\r\n');
        const child = createNodeProcessSpawner().spawn(shim, [], { ...process.env, SP_NODE: process.execPath, SP_FIXTURE: fixture, SP_PID_FILE: pidFile }, dir);
        for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise(resolve => setTimeout(resolve, 50));
        grandchild = Number(readFileSync(pidFile, "utf8"));
        expect(grandchild).toBeGreaterThan(0);
        child.kill();
        await child.exited;
        const alive = () => { try { process.kill(grandchild, 0); return true; } catch { return false; } };
        for (let i = 0; i < 60 && alive(); i++) await new Promise(resolve => setTimeout(resolve, 50));
        expect(alive()).toBe(false);
      } finally {
        // Only the fixture this test started; never a PID from anywhere else.
        if (grandchild > 0) { try { process.kill(grandchild); } catch { /* already gone */ } }
        rmSync(dir, { recursive: true, force: true });
      }
    }, 10000);

    it(`rejects dangerous .${ext} tokens without creating a child`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "spawner-reject-"));
      try {
        const created = path.join(dir, "child-created");
        const fixture = path.join(dir, "fixture.cjs");
        writeFileSync(fixture, "require('node:fs').writeFileSync(process.env.SP_CREATED, 'created');\n");
        const shim = path.join(dir, `run.${ext}`);
        writeFileSync(shim, '@echo off\r\n"%SP_NODE%" "%SP_FIXTURE%" %*\r\n');
        const env = { ...process.env, SP_NODE: process.execPath, SP_FIXTURE: fixture, SP_CREATED: created, SP_PROBE_WORD: "expanded" };
        for (const token of ['x" & echo SP_SAFE_MARKER & rem "', "%SP_PROBE_WORD%", "a!b", "a^b", "a\rb", "a\nb"]) {
          let error: unknown;
          let child: SpawnedProcess | undefined;
          const stdout: string[] = [];
          const stderr: string[] = [];
          try { child = createNodeProcessSpawner().spawn(shim, [token, "after"], env, dir); }
          catch (caught) { error = caught; }
          // Settle even on RED: the harmless fixture exits without waiting for stdin.
          if (child) {
            child.onStdoutLine(line => stdout.push(line));
            child.onStderrLine(line => stderr.push(line));
            child.endStdin();
            await child.exited;
          }
          expect(error).toEqual(new Error("Unsafe Windows batch token; use GENTLE_SHELL_BIN with a supported .mjs entry instead."));
          expect(child).toBeUndefined();
          expect(stdout).toEqual([]);
          expect(stderr).toEqual([]);
          expect(existsSync(created)).toBe(false);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

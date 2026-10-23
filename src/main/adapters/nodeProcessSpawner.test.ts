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

  it("quotes cmd.exe metacharacters and escapes inner double quotes", () => {
    const { spawn, calls } = fakeSpawn();
    createNodeProcessSpawner({ spawn, platform: "win32" }).spawn("C:\\a\\x.bat", ["a&b", 'say "hi"', ""], ENV);

    expect(only(calls).command).toBe('C:\\a\\x.bat "a&b" "say \\"hi\\"" ""');
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

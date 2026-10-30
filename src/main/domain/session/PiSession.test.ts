import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeProcessSpawner } from "../../adapters/nodeProcessSpawner";
import { createLauncherLocator } from "../../adapters/launcherLocator";
import { PiSession } from "./PiSession";
import type { ChatState } from "../rpc/chatReducer";
import type { LauncherLocator, ProcessSpawner, SpawnedProcess } from "../../ports";

/**
 * A tiny fake `gentle-shell --mode rpc` script: reads JSON lines on stdin,
 * replies with a scripted event sequence. On `prompt` it streams
 * "hello world" as two text_delta events then settles; on the special
 * prompt text "ask" it opens a select dialog and waits for the matching
 * extension_ui_response before streaming its reply; on `abort` it settles
 * immediately.
 */
const FAKE_RPC_SCRIPT = `
process.stdin.setEncoding("utf8");
let buffer = "";
const pendingDialogs = new Map();

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (line.trim().length > 0) handleLine(line);
  }
});
process.stdin.on("end", () => process.exit(0));

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\\n");
}

function zeroUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

function streamReply(text) {
  write({ type: "message_start", message: { role: "assistant", content: [] } });
  write({ type: "message_update", usage: zeroUsage(), assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  for (const word of text.split(" ")) {
    write({ type: "message_update", usage: zeroUsage(), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: word + " " } });
  }
  write({ type: "message_update", usage: zeroUsage(), assistantMessageEvent: { type: "text_end", contentIndex: 0, content: text } });
  write({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }] } });
  write({ type: "agent_settled" });
}

function handleLine(line) {
  const cmd = JSON.parse(line);

  if (cmd.type === "prompt" && cmd.message === "/fake:hang") {
    return;
  }

  if (cmd.type === "prompt" && cmd.message.startsWith("/fake:")) {
    write({ type: "extension_ui_request", id: "n-" + cmd.id, method: "notify", message: "fake: on (decided by test)", notifyType: "info" });
    write({ id: cmd.id, type: "response", command: "prompt", success: true, data: { disposition: "handled" } });
    return;
  }

  if (cmd.type === "prompt" && cmd.message === "ask") {
    write({ type: "agent_start" });
    write({ type: "extension_ui_request", id: "dlg-1", method: "select", title: "Pick one", options: ["A", "B"] });
    pendingDialogs.set("dlg-1", (value) => streamReply("you picked " + value));
    return;
  }

  if (cmd.type === "prompt" && cmd.message === "crash") {
    process.exit(1);
  }

  if (cmd.type === "prompt") {
    write({ type: "agent_start" });
    streamReply("hello world");
    return;
  }

  if (cmd.type === "abort") {
    write({ type: "agent_settled" });
    return;
  }

  if (cmd.type === "get_commands") {
    if (process.env.FAKE_COMMANDS_FAIL === "1") {
      write({ type: "response", id: cmd.id, command: "get_commands", success: false, error: "no commands" });
      return;
    }
    write({
      type: "response",
      id: cmd.id,
      command: "get_commands",
      success: true,
      data: {
        commands: [
          { name: "gentle-status", description: "Show status", source: "extension", sourceInfo: {} },
          { name: "skill:review", source: "skill", sourceInfo: {} },
        ],
      },
    });
    return;
  }

  if (cmd.type === "get_messages") {
    write({
      type: "response",
      id: cmd.id,
      command: "get_messages",
      success: true,
      data: {
        messages: [
          { role: "user", content: "What is 2+2?", timestamp: 0 },
          { role: "assistant", content: [{ type: "text", text: "4" }], timestamp: 0 },
        ],
      },
    });
    return;
  }

  if (cmd.type === "extension_ui_response") {
    const resolve = pendingDialogs.get(cmd.id);
    pendingDialogs.delete(cmd.id);
    if (resolve) resolve(cmd.value ?? (cmd.cancelled ? "cancelled" : "unknown"));
  }
}
`;

function waitFor(session: PiSession, predicate: (state: ChatState) => boolean, timeoutMs = 5000): Promise<ChatState> {
  return new Promise((resolve, reject) => {
    const current = session.getState();
    if (predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      session.off("state", onState);
      reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function onState(state: ChatState) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      session.off("state", onState);
      resolve(state);
    }

    session.on("state", onState);
  });
}

describe("PiSession", () => {
  let tmpDir: string | undefined;

  function createSession(env: NodeJS.ProcessEnv, options: { sessionPath?: string } = {}): PiSession {
    return new PiSession({
      spawner: createNodeProcessSpawner(),
      locator: createLauncherLocator(env),
      env,
      sessionPath: options.sessionPath,
    });
  }

  function writeFakeScript(): string {
    tmpDir = mkdtempSync(path.join(tmpdir(), "pi-session-test-"));
    const scriptPath = path.join(tmpDir, "fake-gentle-shell.mjs");
    writeFileSync(scriptPath, FAKE_RPC_SCRIPT);
    return scriptPath;
  }

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("start + prompt streams the assistant's text into state", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    session.prompt("hi");

    const settled = await waitFor(
      session,
      (state) => state.messages.some((message) => message.role === "assistant" && message.streaming === false),
    );

    expect(settled.messages).toHaveLength(2);
    expect(settled.messages[0]).toMatchObject({ role: "user", text: "hi" });
    // message_end.message is authoritative (see chatReducer's extractAssistantText),
    // so the final text is the un-spaced-joined content block, not the raw deltas.
    expect(settled.messages[1]).toMatchObject({ role: "assistant", text: "hello world", streaming: false });

    await session.stop();
  });

  it("listCommands resolves the commands pi reports, keeping only the fields the UI needs", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    const commands = await session.listCommands();

    expect(commands).toEqual([
      { name: "gentle-status", description: "Show status", source: "extension" },
      { name: "skill:review", source: "skill" },
    ]);

    await session.stop();
  });

  it("listCommands rejects with pi's error when get_commands fails", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath, FAKE_COMMANDS_FAIL: "1" });

    session.start();

    await expect(session.listCommands()).rejects.toThrow("no commands");

    await session.stop();
  });

  it("listCommands rejects instead of hanging when no process is active", async () => {
    const session = createSession({ GENTLE_SHELL_BIN: writeFakeScript() });

    await expect(session.listCommands()).rejects.toThrow("no active process");
  });

  it("runSilent returns what a command printed without adding anything to the chat", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    const printed = await session.runSilent("/fake:status");

    expect(printed).toEqual(["fake: on (decided by test)"]);
    expect(session.getState().messages).toEqual([]);

    await session.stop();
  });

  it("runSilent keeps its notifications out of the thread even right after the user ran a slash command", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    session.prompt("/fake:typed");
    await waitFor(session, (state) => state.messages.length >= 2);
    const before = session.getState().messages.length;

    await session.runSilent("/fake:status");

    expect(session.getState().messages).toHaveLength(before);
    await session.stop();
  });

  it("runSilent rejects instead of hanging when gentle-shell never answers", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();

    await expect(session.runSilent("/fake:hang", 300)).rejects.toThrow("Timed out waiting for gentle-shell");
    await session.stop();
  });

  it("runSilent rejects when there is no active process or while the agent is working", async () => {
    const idle = createSession({ GENTLE_SHELL_BIN: writeFakeScript() });
    await expect(idle.runSilent("/fake:status")).rejects.toThrow("no active process");

    const session = createSession({ GENTLE_SHELL_BIN: writeFakeScript() });
    session.start();
    session.prompt("ask");
    await waitFor(session, (state) => state.working);
    await expect(session.runSilent("/fake:status")).rejects.toThrow("still working");
    await session.stop();
  });

  it("seeds ChatState.messages from get_messages history when started with a sessionPath", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath }, { sessionPath: "/fake/session.jsonl" });

    session.start();

    const withHistory = await waitFor(session, (state) => state.messages.length === 2);

    expect(withHistory.messages[0]).toMatchObject({ id: "msg-0", role: "user", text: "What is 2+2?" });
    expect(withHistory.messages[1]).toMatchObject({ id: "msg-1", role: "assistant", text: "4", streaming: false });

    await session.stop();
  });

  it("round-trips a select dialog: pending dialog appears, the answer reaches pi, and the reply streams back", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    session.prompt("ask");

    const withDialog = await waitFor(session, (state) => state.pendingDialogs.length > 0);
    expect(withDialog.pendingDialogs[0]).toMatchObject({ id: "dlg-1", method: "select", options: ["A", "B"] });

    session.answerDialog("dlg-1", { value: "A" });

    const answered = await waitFor(session, (state) => !state.working && state.pendingDialogs.length === 0 && state.messages.some((m) => m.role === "assistant"));
    const assistantMessage = answered.messages.find((m) => m.role === "assistant");
    expect(assistantMessage?.text).toBe("you picked A");
  });

  it("abort sends the abort command and the session settles", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });
    const events: string[] = [];
    session.on("event", (event) => events.push(event.type));

    session.start();
    session.abort();

    await waitFor(session, () => events.includes("agent_settled"));
    expect(events).toContain("agent_settled");

    await session.stop();
  });

  it("stop() closes stdin and the child exits; a second stop() is a safe no-op", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    await session.stop();
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it("surfaces a locator failure as lastError and an error event instead of throwing", () => {
    const session = createSession({ PATH: "" });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));

    expect(() => session.start()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/GENTLE_SHELL_BIN/);
    expect(session.getState().lastError).toMatch(/GENTLE_SHELL_BIN/);
  });

  it("a spawn failure (missing executable) surfaces an error event and stop() still resolves", async () => {
    const missingBin = path.join(tmpdir(), `gentle-shell-desktop-missing-${Date.now()}`);
    const session = createSession({ GENTLE_SHELL_BIN: missingBin });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));

    session.start();

    await waitFor(session, (state) => state.lastError !== undefined);
    expect(errors.length).toBeGreaterThan(0);

    await session.stop();
  }, 6000);

  it("prompt() after the child exits unexpectedly does not throw or crash the process", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
    const onUncaughtException = (error: unknown) => unhandled.push(error);
    process.on("unhandledRejection", onUnhandledRejection);
    process.on("uncaughtException", onUncaughtException);

    try {
      session.start();
      session.prompt("crash");
      await waitFor(session, (state) => state.lastError !== undefined);

      expect(() => session.prompt("hi")).not.toThrow();
      expect(session.getState().lastError).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
      process.off("uncaughtException", onUncaughtException);
    }
  });

  it("prompt() called right after stop() begins does not throw (write-after-end guard)", async () => {
    const scriptPath = writeFakeScript();
    const session = createSession({ GENTLE_SHELL_BIN: scriptPath });

    session.start();
    const stopPromise = session.stop();

    expect(() => session.prompt("hi")).not.toThrow();
    expect(session.getState().lastError).toMatch(/no active process/);

    await stopPromise;
  });
});

/**
 * A controllable fake ProcessSpawner (no real child process) for the
 * Electron-host follow-up tests below: stderr-to-log routing, unexpected
 * exit cleanup, the double-start guard, prompt()-while-working, and env
 * merging. These need precise control over stdout/stderr timing and the
 * spawned env, which the real fake-RPC-script tests above cannot give
 * without racing real process I/O.
 */
interface FakeProcessHandle {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly writes: string[];
  killed: boolean;
  emitStdout(line: string): void;
  emitStderr(line: string): void;
  resolveExited(result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }): void;
}

function createFakeSpawner(): { spawner: ProcessSpawner; handles: FakeProcessHandle[] } {
  const handles: FakeProcessHandle[] = [];

  const spawner: ProcessSpawner = {
    spawn(command, args, env): SpawnedProcess {
      const stdoutHandlers: Array<(line: string) => void> = [];
      const stderrHandlers: Array<(line: string) => void> = [];
      const errorHandlers: Array<(error: Error) => void> = [];
      const writes: string[] = [];

      let resolveExitedFn: (result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }) => void = () => undefined;
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
        resolveExitedFn = resolve;
      });

      const handle: FakeProcessHandle = {
        command,
        args,
        env,
        writes,
        killed: false,
        emitStdout(line) {
          for (const handler of stdoutHandlers) handler(line);
        },
        emitStderr(line) {
          for (const handler of stderrHandlers) handler(line);
        },
        resolveExited(result) {
          resolveExitedFn(result);
        },
      };
      handles.push(handle);

      return {
        exited,
        writeStdin(text: string) {
          writes.push(text);
        },
        endStdin() {},
        onStdoutLine(handler) {
          stdoutHandlers.push(handler);
        },
        onStderrLine(handler) {
          stderrHandlers.push(handler);
        },
        onError(handler) {
          errorHandlers.push(handler);
        },
        kill() {
          handle.killed = true;
        },
      };
    },
  };

  return { spawner, handles };
}

const fakeLocator: LauncherLocator = { locate: () => ({ command: "fake-gentle-shell", args: [] }) };

/** Flush the microtask queue so `proc.exited.then(...)` handlers inside PiSession run. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PiSession: Electron host follow-ups", () => {
  it("reports idle after a requested stop even when the last agent state was working", async () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    session.start();
    session.prompt("hello");
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_start" }));
    expect(session.isBusy()).toBe(true);
    const stopping = session.stop();
    handles[0]!.resolveExited({ code: 0, signal: null });
    await stopping;
    expect(session.isBusy()).toBe(false);
  });

  it("tracks queued prompts without changing idle state or clearing a later request on an earlier terminal event", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    session.start();
    expect(session.isBusy()).toBe(false);
    expect(session.prompt("first")).toEqual({ queued: true });
    expect(session.prompt("second")).toEqual({ queued: true });
    expect(session.getState().working).toBe(false);
    expect(session.getState().messages.map(message => message.text)).toEqual(["first", "second"]);
    expect(session.isBusy()).toBe(true);
    const handle = handles[0]!;
    const prompts = handle.writes.map(line => JSON.parse(line)).filter(command => command.type === "prompt");
    expect(prompts).toMatchObject([{ message: "first" }, { message: "second" }]);
    expect(prompts[0].id).not.toBe(prompts[1].id);
    handle.emitStdout(JSON.stringify({ type: "agent_start" }));
    handle.emitStdout(JSON.stringify({ type: "agent_end" }));
    handle.emitStdout(JSON.stringify({ type: "agent_settled" }));
    expect(session.isBusy()).toBe(true);
    handle.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: prompts[1].id, success: false, error: "Not accepted" }));
    expect(session.isBusy()).toBe(false);
    expect(session.getState().messages).toHaveLength(2);
  });

  it("does not guess completion of unstarted prompts from an uncorrelated abort settlement", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    session.start();
    session.prompt("before abort");
    const earlier = JSON.parse(handles[0]!.writes.at(-1)!);
    session.abort();
    expect(JSON.parse(handles[0]!.writes.at(-1)!)).toEqual({ type: "abort" });
    expect(session.isBusy()).toBe(true);
    session.prompt("after abort");
    const later = JSON.parse(handles[0]!.writes.at(-1)!);
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_settled" }));
    expect(session.isBusy()).toBe(true);
    handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: later.id, success: true, data: { disposition: "handled" } }));
    expect(session.isBusy()).toBe(true);
    handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: earlier.id, success: false, error: "Aborted" }));
    expect(session.isBusy()).toBe(false);
  });

  it("tracks queued silent runs through handled success and rejection without changing the thread", async () => {
    vi.useFakeTimers();
    try {
      const { spawner, handles } = createFakeSpawner();
      const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
      session.start();
      const first = session.runSilent("/first");
      const second = session.runSilent("/second");
      const rejected = expect(second).rejects.toThrow("Rejected");
      expect(session.isBusy()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      const one = JSON.parse(handles[0]!.writes.at(-1)!);
      expect(one.message).toBe("/first");
      handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: one.id, success: true, data: { disposition: "handled" } }));
      expect(session.isBusy()).toBe(true);
      await vi.advanceTimersByTimeAsync(150);
      expect(await first).toEqual([]);
      const two = JSON.parse(handles[0]!.writes.at(-1)!);
      expect(two.message).toBe("/second");
      expect(session.isBusy()).toBe(true);
      handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: two.id, success: false, error: "Rejected" }));
      await rejected;
      expect(session.isBusy()).toBe(false);
      expect(session.getState().working).toBe(false);
      expect(session.getState().messages).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it.each([0, 1])("clears uncertain silent activity on confirmed process exit (code=%s)", async (code) => {
    vi.useFakeTimers();
    try {
      const { spawner, handles } = createFakeSpawner();
      const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
      session.start();
      const command = session.runSilent("/hang", 10);
      const rejected = expect(command).rejects.toThrow("Timed out");
      await vi.advanceTimersByTimeAsync(10);
      await rejected;
      expect(session.isBusy()).toBe(true);
      handles[0]!.resolveExited({ code, signal: null });
      await flushMicrotasks();
      expect(session.isBusy()).toBe(false);
      expect(session.getState().working).toBe(false);
      expect(session.getState().pendingDialogs).toEqual([]);
      // A prompt declined by the dead transport must not create phantom activity.
      expect(session.prompt("after exit")).toEqual({ queued: true });
      expect(session.isBusy()).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("fetches correlated session facts on open and finished turns, silently retaining them on failure or timeout", () => {
    vi.useFakeTimers();
    try {
      const { spawner, handles } = createFakeSpawner();
      const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
      const errors = vi.fn();
      session.on("error", errors);
      session.start();
      const handle = handles[0]!;
      const requests = () => handle.writes.map(line => JSON.parse(line));
      expect(requests().map(request => request.type)).toEqual(["get_state", "get_session_stats"]);
      const reply = (request: { type: string; id: string }, data: unknown, success = true) => handle.emitStdout(JSON.stringify({ type: "response", command: request.type, id: request.id, success, data, error: "unavailable" }));
      reply({ ...requests()[0], id: "unrelated" }, { model: { id: "wrong" } });
      expect(session.getState().session).toBeUndefined();
      reply(requests()[0], { model: { id: "real-model" }, thinkingLevel: "high" });
      reply(requests()[1], { contextUsage: { percent: 62, tokens: 124000, contextWindow: 200000 } });
      const facts = { model: "real-model", effort: "high", context: { percent: 62, tokens: 124000, window: 200000 } };
      expect(session.getState().session).toEqual(facts);
      expect(session.isBusy()).toBe(false);
      for (const type of ["agent_end", "agent_settled"]) {
        handle.emitStdout(JSON.stringify({ type }));
        expect(requests().slice(-2).map(request => request.type)).toEqual(["get_state", "get_session_stats"]);
        reply(requests().at(-2), undefined, false);
        reply(requests().at(-1), undefined, false);
        expect(session.getState().session).toEqual(facts);
      }
      handle.emitStdout(JSON.stringify({ type: "agent_settled" }));
      vi.advanceTimersByTime(16000);
      reply(requests().at(-2), { model: { id: "late" } });
      expect(session.getState().session).toEqual(facts);
      handle.emitStdout(JSON.stringify({ type: "agent_settled" }));
      reply(requests().at(-1), { contextUsage: { percent: null, tokens: null, contextWindow: 200000 } });
      expect(session.getState().session?.context).toEqual({ percent: null, tokens: null, window: 200000 });
      reply(requests().at(-2), { model: { id: "changed-model" } });
      expect(session.getState().session?.model).toBe("changed-model");
      expect(session.getState().session?.effort).toBeUndefined();
      handle.emitStdout(JSON.stringify({ type: "agent_settled" }));
      reply(requests().at(-2), {});
      reply(requests().at(-1), {});
      expect(session.getState().session).toEqual({ model: undefined, effort: undefined, context: undefined });
      expect(session.getState().lastError).toBeUndefined();
      expect(errors).not.toHaveBeenCalled();
      expect(session.prompt("still usable")).toEqual({ queued: true });
      const fresh = new PiSession({ spawner, locator: fakeLocator, env: {} });
      expect(fresh.getState().session).toBeUndefined();
      expect(fresh.getState().memory).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it("pushes state only when an event changed it (the audit measured full-state IPC sends for no-op events)", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    session.start();
    const states = vi.fn();
    const events = vi.fn();
    session.on("state", states);
    session.on("event", events);
    const handle = handles[0]!;
    handle.emitStdout(JSON.stringify({ type: "response", command: "get_state", id: "unrelated", success: true, data: { model: { id: "x" } } }));
    expect(events).toHaveBeenCalledTimes(1);
    expect(states).not.toHaveBeenCalled();
    handle.emitStdout(JSON.stringify({ type: "agent_start" }));
    expect(events).toHaveBeenCalledTimes(2);
    expect(states).toHaveBeenCalledTimes(1);
    expect(session.getState().working).toBe(true);
  });
  it("listCommands waits for a real home to load its extensions (pi answered after 4.3s there)", async () => {
    vi.useFakeTimers();
    try {
      const { spawner, handles } = createFakeSpawner();
      const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
      session.start();

      const commands = session.listCommands();
      await vi.advanceTimersByTimeAsync(4400);
      handles[0]?.emitStdout(
        JSON.stringify({ type: "response", id: "commands-0", command: "get_commands", success: true, data: { commands: [] } }),
      );

      await expect(commands).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes stderr lines to the injectable onLog callback instead of surfacing them as lastError", () => {
    const { spawner, handles } = createFakeSpawner();
    const logLines: string[] = [];
    const session = new PiSession({ spawner, locator: fakeLocator, env: {}, onLog: (line) => logLines.push(line) });

    session.start();
    handles[0]?.emitStderr("some diagnostic output");

    expect(logLines).toEqual(["some diagnostic output"]);
    expect(session.getState().lastError).toBeUndefined();
  });

  it("resets working and clears pending dialogs on an unexpected exit, surfacing exactly one error", async () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));

    session.start();
    handles[0]?.emitStdout(JSON.stringify({ type: "agent_start" }));
    handles[0]?.emitStdout(
      JSON.stringify({ type: "extension_ui_request", id: "dlg-1", method: "select", title: "Pick", options: ["A"] }),
    );

    expect(session.getState().working).toBe(true);
    expect(session.getState().pendingDialogs).toHaveLength(1);

    handles[0]?.resolveExited({ code: 1, signal: null });
    await flushMicrotasks();

    expect(session.getState().working).toBe(false);
    expect(session.getState().pendingDialogs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/exited unexpectedly/);
  });

  it("resets working and clears pending dialogs on a clean self-exit too (code 0, not via stop()), without surfacing an error", async () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));

    session.start();
    handles[0]?.emitStdout(JSON.stringify({ type: "agent_start" }));
    handles[0]?.emitStdout(
      JSON.stringify({ type: "extension_ui_request", id: "dlg-1", method: "select", title: "Pick", options: ["A"] }),
    );

    expect(session.getState().working).toBe(true);
    expect(session.getState().pendingDialogs).toHaveLength(1);

    handles[0]?.resolveExited({ code: 0, signal: null });
    await flushMicrotasks();

    expect(session.getState().working).toBe(false);
    expect(session.getState().pendingDialogs).toEqual([]);
    expect(errors).toHaveLength(0);
  });

  it("guards start() against a double start: the second call surfaces an error instead of spawning again", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));

    session.start();
    session.start();

    expect(handles).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/already started|active/i);
  });

  it("rejects prompt() while working: no message appended, no stdin write, lastError set", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });

    session.start();
    handles[0]?.emitStdout(JSON.stringify({ type: "agent_start" }));
    expect(session.getState().working).toBe(true);

    const beforeCount = session.getState().messages.length;
    const result = session.prompt("another message");

    expect(result).toEqual({ queued: false, reason: "Gentle is still working" });
    expect(session.getState().messages).toHaveLength(beforeCount);
    expect(handles[0]?.writes.map(line => JSON.parse(line).type)).toEqual(["get_state", "get_session_stats"]);
    expect(session.getState().lastError).toBe("Gentle is still working");
  });

  it("prompt() while idle still queues normally and returns { queued: true }", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });

    session.start();
    const result = session.prompt("hi");

    expect(result).toEqual({ queued: true });
    expect(session.getState().messages).toHaveLength(1);
    expect(handles[0]?.writes.map(line => JSON.parse(line).type)).toEqual(["get_state", "get_session_stats", "prompt"]);
  });

  it("merges the launcher's env (e.g. ELECTRON_RUN_AS_NODE for a JS entry) into the spawned process env", () => {
    const { spawner, handles } = createFakeSpawner();
    const locator: LauncherLocator = {
      locate: () => ({ command: process.execPath, args: ["entry.mjs"], env: { ELECTRON_RUN_AS_NODE: "1" } }),
    };
    const session = new PiSession({ spawner, locator, env: { FOO: "bar" } });

    session.start();

    expect(handles[0]?.env).toMatchObject({ FOO: "bar", ELECTRON_RUN_AS_NODE: "1" });
  });

  it("always marks the spawned pi process as an interactive host via GENTLE_SHELL_INTERACTIVE_HOST=1 (M2 prerequisite)", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: { FOO: "bar" } });

    session.start();

    expect(handles[0]?.env).toMatchObject({ FOO: "bar", GENTLE_SHELL_INTERACTIVE_HOST: "1" });
  });

  it("GENTLE_SHELL_INTERACTIVE_HOST survives being merged alongside the launcher's own env", () => {
    const { spawner, handles } = createFakeSpawner();
    const locator: LauncherLocator = {
      locate: () => ({ command: process.execPath, args: ["entry.mjs"], env: { ELECTRON_RUN_AS_NODE: "1" } }),
    };
    const session = new PiSession({ spawner, locator, env: { FOO: "bar" } });

    session.start();

    expect(handles[0]?.env).toMatchObject({ FOO: "bar", ELECTRON_RUN_AS_NODE: "1", GENTLE_SHELL_INTERACTIVE_HOST: "1" });
  });

  it("sends get_messages when started with a sessionPath and seeds ChatState.messages from the response", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {}, sessionPath: "/a/sess-1.jsonl" });

    session.start();

    expect(handles[0]?.writes).toHaveLength(3);
    const sent = JSON.parse(handles[0]?.writes[0] ?? "{}");
    expect(sent).toMatchObject({ type: "get_messages" });
    expect(typeof sent.id).toBe("string");

    handles[0]?.emitStdout(
      JSON.stringify({
        type: "response",
        id: sent.id,
        command: "get_messages",
        success: true,
        data: {
          messages: [
            { role: "user", content: "hi", timestamp: 0 },
            { role: "assistant", content: [{ type: "text", text: "hello" }], timestamp: 0 },
          ],
        },
      }),
    );

    expect(session.getState().messages).toEqual([
      { id: "msg-0", role: "user", text: "hi" },
      { id: "msg-1", role: "assistant", text: "hello", streaming: false },
    ]);
  });

  it("never sends get_messages for a fresh session (no sessionPath)", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {} });

    session.start();

    expect(handles[0]?.writes.map(line => JSON.parse(line).type)).not.toContain("get_messages");
  });

  it("surfaces lastError instead of throwing when the get_messages response fails", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {}, sessionPath: "/a/sess-1.jsonl" });

    session.start();
    const sent = JSON.parse(handles[0]?.writes[0] ?? "{}");

    handles[0]?.emitStdout(
      JSON.stringify({ type: "response", id: sent.id, command: "get_messages", success: false, error: "boom" }),
    );

    expect(session.getState().lastError).toBe("Could not load this chat's history");
    expect(session.getState().messages).toEqual([]);
  });

  it("ignores a get_messages response whose id does not match the pending request", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {}, sessionPath: "/a/sess-1.jsonl" });

    session.start();

    handles[0]?.emitStdout(
      JSON.stringify({
        type: "response",
        id: "some-other-id",
        command: "get_messages",
        success: true,
        data: { messages: [{ role: "user", content: "should be ignored", timestamp: 0 }] },
      }),
    );

    expect(session.getState().messages).toEqual([]);
  });

  it("never overwrites already-live messages with a late get_messages history response", () => {
    const { spawner, handles } = createFakeSpawner();
    const session = new PiSession({ spawner, locator: fakeLocator, env: {}, sessionPath: "/a/sess-1.jsonl" });

    session.start();
    const sent = JSON.parse(handles[0]?.writes[0] ?? "{}");

    // A live prompt races ahead of the history response.
    session.prompt("hi there");
    expect(session.getState().messages).toHaveLength(1);

    handles[0]?.emitStdout(
      JSON.stringify({
        type: "response",
        id: sent.id,
        command: "get_messages",
        success: true,
        data: { messages: [{ role: "user", content: "should not appear", timestamp: 0 }] },
      }),
    );

    expect(session.getState().messages).toHaveLength(1);
    expect(session.getState().messages[0]).toMatchObject({ text: "hi there" });
  });
});

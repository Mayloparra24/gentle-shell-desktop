import { describe, expect, it, vi } from "vitest";
import type { ChatState } from "@shared/bridge-types";
import type { LauncherLocator, ProcessSpawner, SessionInfoLike, SessionStore, SpawnedProcess } from "../../ports";
import { ChatHost } from "./ChatHost";
import { PiSession } from "./PiSession";
import type { GitWriteService } from "../../adapters/gitWrite";
import type { GitSummary } from "@shared/bridge-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const readyGit = { status: "ready", branch: "main", changed: [], truncatedChanges: false, commits: [] } as const;
const writeResult = { kind: "push", status: "success", pulled: false, pushed: true, message: "Done" } as const;
function writeFixture(extra: Partial<ConstructorParameters<typeof ChatHost>[0]> = {}) {
  const fake = createFakeSpawner();
  const service: GitWriteService = { plan: vi.fn().mockResolvedValue({ planId: "plan" }), trust: vi.fn().mockResolvedValue(undefined), apply: vi.fn().mockResolvedValue(writeResult) };
  const host = new ChatHost({ spawner: fake.spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {}, gitSummaryReader: { gitSummary: vi.fn().mockResolvedValue(readyGit) }, gitWrites: service, ...extra });
  return { ...fake, host, service };
}
async function contextId(host: ChatHost): Promise<string> {
  const summary = await host.gitSummary();
  expect(summary.status).toBe("ready");
  if (summary.status !== "ready" || !summary.contextId) throw new Error("Missing Git context");
  return summary.contextId;
}

/**
 * A controllable fake ProcessSpawner (no real child process), mirroring
 * the pattern in PiSession.test.ts's "Electron host follow-ups" describe
 * block: ChatHost's own tests need the same precise control over
 * stdout/exit timing without racing real process I/O. `events` records
 * spawn/endStdin ordering across handles, used by the startSession
 * serialization test below to prove the previous session is fully
 * stopped before the next one spawns (not just that both eventually run).
 */
interface FakeProcessHandle {
  readonly args: readonly string[];
  readonly writes: string[];
  emitStdout(line: string): void;
  emitStderr(line: string): void;
  resolveExited(result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }): void;
}

function createFakeSpawner(): { spawner: ProcessSpawner; handles: FakeProcessHandle[]; events: string[] } {
  const handles: FakeProcessHandle[] = [];
  const events: string[] = [];

  const spawner: ProcessSpawner = {
    spawn(_command, args): SpawnedProcess {
      const index = handles.length;
      events.push(`spawn:${index}`);

      const stdoutHandlers: Array<(line: string) => void> = [];
      const stderrHandlers: Array<(line: string) => void> = [];
      const writes: string[] = [];
      let resolveExitedFn: (result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }) => void = () => undefined;
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
        resolveExitedFn = resolve;
      });

      const handle: FakeProcessHandle = {
        args: [...args],
        writes,
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
        endStdin() {
          events.push(`endStdin:${index}`);
        },
        onStdoutLine(handler) {
          stdoutHandlers.push(handler);
        },
        onStderrLine(handler) {
          stderrHandlers.push(handler);
        },
        onError() {},
        kill() {},
      };
    },
  };

  return { spawner, handles, events };
}

const fakeLocator: LauncherLocator = { locate: () => ({ command: "fake-gentle-shell", args: [] }) };

function fakeSessionStore(sessions: readonly SessionInfoLike[]): SessionStore {
  return { listAll: () => Promise.resolve([...sessions]) };
}

function session(overrides: Partial<SessionInfoLike> = {}): SessionInfoLike {
  return {
    id: "sess-1",
    path: "/home/sessions/proj/sess-1.jsonl",
    cwd: "/tmp/proj",
    modified: new Date("2026-09-21T10:00:00.000Z"),
    messageCount: 0,
    firstMessage: "",
    ...overrides,
  };
}

/**
 * Opening an existing chat (sessionPath set) now sends `get_messages` and
 * bounds its wait to `HISTORY_LOAD_TIMEOUT_MS` (see ChatHost.ts). Tests
 * that don't care about the seeded history content answer it immediately
 * with an empty history through this helper, so `openChat` resolves right
 * away instead of blocking on the real 2s bound; tests that do care about
 * the content answer inline instead.
 */
const OPTIONAL_STATUS_READS = new Set(["get_state", "get_session_stats"]);

/** What the host sent to pi on purpose: the optional status-bar reads (get_state, get_session_stats) are not part of any chat behavior. */
function writesExceptStatusReads(handle: FakeProcessHandle | undefined): string[] {
  return (handle?.writes ?? []).filter((line) => !OPTIONAL_STATUS_READS.has(JSON.parse(line).type));
}

async function respondToHistoryRequest(
  handles: readonly FakeProcessHandle[],
  index: number,
  data: unknown = { messages: [] },
): Promise<void> {
  const historyWrite = (): string | undefined => handles[index]?.writes.filter((line) => JSON.parse(line).type === "get_messages").pop();
  await vi.waitFor(() => expect(historyWrite()).toBeDefined());
  const sent = JSON.parse(historyWrite()!);
  handles[index]!.emitStdout(
    JSON.stringify({ type: "response", id: sent.id, command: "get_messages", success: true, data }),
  );
}

describe("ChatHost Git lifecycle", () => {
  it("blocks Git before delayed agent_start and preserves prompt/abort behavior through confirmed settlement", async () => {
    const { host, service, handles } = writeFixture();
    const states: ChatState[] = [];
    host.onState(state => states.push(state));
    await host.newChat("/repo");
    const id = await contextId(host);
    expect(await host.sendMessage("hello")).toEqual({ queued: true });
    expect(states.at(-1)?.messages).toMatchObject([{ role: "user", text: "hello" }]);
    expect(states.at(-1)?.working).toBe(false);
    const before = [...handles[0]!.writes];
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    await expect(host.gitPlan(id, { kind: "push" })).rejects.toThrow(/busy/i);
    expect(service.apply).not.toHaveBeenCalled();
    expect(service.plan).not.toHaveBeenCalled();
    expect(handles[0]!.writes).toEqual(before);
    const request = JSON.parse(before.find(line => JSON.parse(line).type === "prompt")!);
    handles[0]!.emitStdout(JSON.stringify({ type: "response", id: request.id, command: "prompt", success: true, data: { disposition: "queued" } }));
    handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "get_state", success: true, data: { isStreaming: false } }));
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_start" }));
    expect(await host.sendMessage("another")).toEqual({ queued: false, reason: "Gentle is still working" });
    await host.abort();
    expect(JSON.parse(handles[0]!.writes.at(-1)!)).toEqual({ type: "abort" });
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_end", willRetry: true }));
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_settled" }));
    expect(await host.gitPlan(id, { kind: "push" })).toEqual({ planId: "plan" });
    expect(await host.gitApply(id, "p")).toEqual(writeResult);
  });

  it.each(["handled", "rejected", "end", "clean-exit", "error-exit"])("restores Git after confirmed prompt completion: %s", async (completion) => {
    const { host, service, handles } = writeFixture();
    await host.newChat("/repo");
    const id = await contextId(host);
    expect(await host.sendMessage("/gentle:status")).toEqual({ queued: true });
    const prompt = JSON.parse(handles[0]!.writes.at(-1)!);
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    handles[0]!.emitStdout(JSON.stringify({ type: "response", id: "unrelated", command: "prompt", success: true, data: { disposition: "handled" } }));
    await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
    expect(service.apply).not.toHaveBeenCalled();
    if (completion.endsWith("exit")) {
      handles[0]!.resolveExited({ code: completion === "clean-exit" ? 0 : 1, signal: null });
      await Promise.resolve();
    } else if (completion === "end") {
      handles[0]!.emitStdout(JSON.stringify({ type: "agent_start" }));
      handles[0]!.emitStdout(JSON.stringify({ type: "agent_end" }));
    } else {
      handles[0]!.emitStdout(JSON.stringify({ type: "response", id: prompt.id, command: "prompt", success: completion !== "rejected", data: { disposition: "handled" }, error: "Rejected" }));
    }
    expect(await host.gitPlan(id, { kind: "push" })).toEqual({ planId: "plan" });
    expect(await host.gitApply(id, "p")).toEqual(writeResult);
  });

  it.each(["handled", "rejected", "switch"])("keeps timed-out silent work blocked until confirmed recovery: %s", async (recovery) => {
    vi.useFakeTimers();
    try {
      const { host, service, handles } = writeFixture();
      await host.newChat("/repo");
      const id = await contextId(host);
      const diagnostic = host.runDiagnostic("status");
      const rejected = expect(diagnostic).rejects.toThrow(/Timed out/);
      await vi.advanceTimersByTimeAsync(0);
      const prompt = JSON.parse(handles[0]!.writes.at(-1)!);
      const before = [...handles[0]!.writes];
      await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
      expect(handles[0]!.writes).toEqual(before);
      await vi.advanceTimersByTimeAsync(8000);
      await rejected;
      handles[0]!.emitStdout(JSON.stringify({ type: "agent_settled" }));
      const status = handles[0]!.writes.map(line => JSON.parse(line)).find(command => command.type === "get_state");
      handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "get_state", id: status.id, success: true, data: { model: { id: "idle" } } }));
      await expect(host.gitApply(id, "p")).rejects.toThrow(/timed out|switch/i);
      expect(service.apply).not.toHaveBeenCalled();
      if (recovery === "switch") {
        const switching = host.newChat("/next");
        handles[0]!.resolveExited({ code: 0, signal: null });
        await switching;
      } else {
        handles[0]!.emitStdout(JSON.stringify({ type: "response", command: "prompt", id: prompt.id, success: recovery === "handled", data: { disposition: "handled" }, error: "Rejected" }));
      }
      expect(await host.gitApply(await contextId(host), "p")).toEqual(writeResult);
    } finally { vi.useRealTimers(); }
  });
  it.each([false, true])("locks synchronously and releases after apply (error=%s)", async (fails) => {
    const { host, service, handles } = writeFixture();
    await host.newChat("/authoritative");
    const id = await contextId(host);
    const pending = deferred<typeof writeResult>();
    vi.mocked(service.apply).mockReturnValue(pending.promise);
    const applying = host.gitApply(id, "plan");
    const outcome = fails ? expect(applying).rejects.toThrow("Safe failure") : expect(applying).resolves.toEqual(writeResult);
    const before = [...handles[0]!.writes];
    for (const operation of [() => host.openChat("x"), () => host.newChat(), () => host.startChat({ source: "browse" }), () => host.chooseFolder(), () => host.sendMessage("no"), () => host.answerDialog("x", { confirmed: true }), () => host.readSettings(), () => host.setSetting("review-mode", "on"), () => host.runDiagnostic("doctor"), () => host.listCommands(), () => host.gitSummary(), () => host.gitPlan(id, { kind: "push" }), () => host.gitTrust(id, "plan"), () => host.gitApply(id, "plan")]) {
      await expect(operation()).rejects.toThrow(/Git write in progress/);
    }
    expect(handles).toHaveLength(1);
    expect(handles[0]!.writes).toEqual(before);
    expect(service.apply).toHaveBeenCalledTimes(1);
    const captured = vi.mocked(service.apply).mock.calls[0]![0];
    expect(captured.cwd).toBe("/authoritative");
    expect(captured.isCurrent()).toBe(true);
    expect(captured.isBusy()).toBe(false);
    if (fails) pending.reject(new Error("Safe failure")); else pending.resolve(writeResult);
    await outcome;
    expect(await host.sendMessage("released")).toEqual({ queued: true });
  });

  it("holds off apply while earlier settings work is awaiting commands, then releases the guard", async () => {
    const commands = deferred<[]>();
    const list = vi.spyOn(PiSession.prototype, "listCommands").mockReturnValue(commands.promise);
    try {
      const { host, service } = writeFixture();
      await host.newChat("/repo");
      const id = await contextId(host);
      const reading = host.readSettings();
      await expect(host.gitApply(id, "p")).rejects.toThrow(/busy/i);
      expect(service.apply).not.toHaveBeenCalled();
      commands.resolve([]);
      expect(await reading).toEqual([
        { key: "permission-mode", unavailable: true }, { key: "yolo", unavailable: true },
        { key: "review-mode", unavailable: true }, { key: "background-subagents", unavailable: true },
        { key: "telemetry", unavailable: true },
      ]);
      expect(await host.gitApply(id, "p")).toEqual(writeResult);
    } finally { list.mockRestore(); }
  });

  it("waits beyond the quit cleanup timeout for an active apply, including its rejection", async () => {
    vi.useFakeTimers();
    try {
      const { host, service, handles, events } = writeFixture();
      await host.newChat("/repo");
      const pending = deferred<typeof writeResult>();
      vi.mocked(service.apply).mockReturnValue(pending.promise);
      const applying = host.gitApply(await contextId(host), "p");
      const rejected = expect(applying).rejects.toThrow("Safe failure");
      let stopped = false;
      const stopping = host.stop(10).then(() => { stopped = true; });
      await vi.advanceTimersByTimeAsync(100);
      expect(stopped).toBe(false);
      expect(events).toEqual(["spawn:0"]);
      pending.reject(new Error("Safe failure"));
      await rejected;
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toEqual(["spawn:0", "endStdin:0"]);
      handles[0]!.resolveExited({ code: 0, signal: null });
      await stopping;
      expect(stopped).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("invalidates before an asynchronous open lookup and refuses apply until the switch settles", async () => {
    const lookup = deferred<SessionInfoLike[]>();
    const { host, service, handles } = writeFixture({ sessionStore: { listAll: () => lookup.promise } });
    await host.newChat("/old");
    const old = await contextId(host);
    await host.gitPlan(old, { kind: "push" });
    const captured = vi.mocked(service.plan).mock.calls[0]![0];
    const opening = host.openChat("next");
    expect(captured.isCurrent()).toBe(false);
    await expect(host.gitApply(old, "plan")).rejects.toThrow(/changed|switch/i);
    expect(service.apply).not.toHaveBeenCalled();
    lookup.resolve([session({ id: "next", cwd: "/new" })]);
    handles[0]!.resolveExited({ code: 0, signal: null });
    await respondToHistoryRequest(handles, 1);
    await opening;
    expect(await contextId(host)).not.toBe(old);
    await expect(host.gitTrust(old, "plan")).rejects.toThrow(/changed/i);
  });

  it("does not stamp a stale summary with a new context", async () => {
    const read = deferred<GitSummary>();
    const { host, handles } = writeFixture({ gitSummaryReader: { gitSummary: () => read.promise } });
    await host.newChat("/old");
    const reading = host.gitSummary();
    const switching = host.newChat("/new");
    handles[0]!.resolveExited({ code: 0, signal: null });
    await switching;
    read.resolve(readyGit);
    expect(await reading).toEqual({ status: "no-chat-folder" });
  });

  it("blocks apply during an awaiting folder dialog or queued start", async () => {
    const dialog = deferred<string | undefined>();
    const { host, service, handles } = writeFixture({ chooseFolder: () => dialog.promise });
    await host.newChat("/old");
    const old = await contextId(host);
    const choosing = host.chooseFolder();
    await expect(host.gitApply(old, "plan")).rejects.toThrow(/changed|switch/i);
    dialog.resolve(undefined);
    expect(await choosing).toEqual({ status: "cancelled" });
    const fresh = await contextId(host);
    const queued = host.newChat("/next");
    await expect(host.gitApply(fresh, "plan")).rejects.toThrow(/changed|switch/i);
    expect(service.apply).not.toHaveBeenCalled();
    handles[0]!.resolveExited({ code: 0, signal: null });
    await queued;
  });

  it("stop invalidates immediately but waits for apply settlement before stopping the child", async () => {
    const { host, service, handles, events } = writeFixture();
    await host.newChat("/repo");
    const pending = deferred<typeof writeResult>();
    vi.mocked(service.apply).mockReturnValue(pending.promise);
    const applying = host.gitApply(await contextId(host), "plan");
    const captured = vi.mocked(service.apply).mock.calls[0]![0];
    const stopping = host.stop();
    expect(captured.isCurrent()).toBe(false);
    await Promise.resolve();
    expect(events).toEqual(["spawn:0"]);
    pending.resolve(writeResult);
    await applying;
    await vi.waitFor(() => expect(events).toContain("endStdin:0"));
    handles[0]!.resolveExited({ code: 0, signal: null });
    await stopping;
    expect(await host.gitSummary()).toEqual({ status: "no-chat-folder" });
  });

  it("refuses missing chat/service, active turns and pending dialogs without reaching the engine", async () => {
    const { host, service, handles } = writeFixture();
    await expect(host.gitPlan("absent", { kind: "push" })).rejects.toThrow();
    await host.newChat("/repo");
    const id = await contextId(host);
    await host.gitTrust(id, "trust-plan");
    expect(service.trust).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/repo" }), "trust-plan");
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_start" }));
    await expect(host.gitApply(id, "plan")).rejects.toThrow(/busy|working/i);
    handles[0]!.emitStdout(JSON.stringify({ type: "agent_end" }));
    handles[0]!.emitStdout(JSON.stringify({ type: "extension_ui_request", id: "d", method: "confirm", title: "Confirm", message: "Continue?" }));
    await expect(host.gitApply(id, "plan")).rejects.toThrow(/busy|dialog/i);
    expect(service.apply).not.toHaveBeenCalled();
    const unavailable = writeFixture({ gitWrites: undefined });
    await unavailable.host.newChat("/repo");
    await expect(unavailable.host.gitPlan(await contextId(unavailable.host), { kind: "push" })).rejects.toThrow(/unavailable/i);
  });
});

describe("ChatHost", () => {
  it("resolves a recent chat id on the host, validates its folder, and never trusts an extra path", async () => {
    const { spawner, handles } = createFakeSpawner();
    const spawn = vi.spyOn(spawner, "spawn");
    const folderExists = vi.fn().mockResolvedValue(true);
    const chooseFolder = vi.fn().mockResolvedValue(undefined);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([session()]), env: {}, chooseFolder, folderExists });
    const request = { source: "fromChat" as const, id: "sess-1", cwd: "/untrusted" };
    expect(await host.startChat(request)).toMatchObject({ status: "chosen", chat: { cwd: "/tmp/proj" } });
    expect(folderExists).toHaveBeenCalledExactlyOnceWith("/tmp/proj");
    expect(spawn.mock.calls[0]?.[3]).toBe("/tmp/proj");
    expect(chooseFolder).not.toHaveBeenCalled();
    folderExists.mockResolvedValue(false);
    expect(await host.startChat({ source: "fromChat", id: "sess-1" })).toEqual({ status: "error", message: "That folder no longer exists." });
    expect(await host.startChat({ source: "fromChat", id: "missing" })).toEqual({ status: "error", message: "That folder no longer exists." });
    expect(await host.startChat({ source: "browse" })).toEqual({ status: "cancelled" });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(handles).toHaveLength(1);
    expect(await host.sendMessage("still open")).toEqual({ queued: true });
  });
  it("native folder cancellation spawns nothing and keeps the current chat; every choice asks again", async () => {
    const { spawner, handles } = createFakeSpawner();
    const spawn = vi.spyOn(spawner, "spawn");
    const chooseFolder = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("/picked").mockResolvedValueOnce(undefined).mockResolvedValue("/other");
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {}, chooseFolder });
    expect(await host.chooseFolder()).toEqual({ status: "cancelled" });
    expect(spawn).not.toHaveBeenCalled();
    expect(await host.chooseFolder()).toMatchObject({ status: "chosen", chat: { cwd: "/picked" } });
    expect(spawn.mock.calls[0]?.[3]).toBe("/picked");
    expect(await host.chooseFolder()).toEqual({ status: "cancelled" });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(await host.sendMessage("still here")).toEqual({ queued: true });
    expect(handles[0]!.writes.join("")).toContain("still here");
    const next = host.chooseFolder();
    handles[0]!.resolveExited({ code: 0, signal: null });
    await next;
    expect(chooseFolder).toHaveBeenCalledTimes(4);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]?.[3]).toBe("/other");
  });
  it("workspace reads use only the active stored cwd and return no folder for a new chat", async () => {
    const { spawner, handles } = createFakeSpawner();
    const listDirectory = vi.fn().mockResolvedValue({ status: "ready", entries: [], truncated: false });
    const gitSummary = vi.fn().mockResolvedValue({ status: "not-a-repository" });
    const readFile = vi.fn().mockResolvedValue({ status: "binary" });
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([session()]), env: {}, workspaceReader: { listDirectory, readFile }, gitSummaryReader: { gitSummary } });
    expect(await host.readFile("root.ts")).toEqual({ status: "no-chat-folder" });
    expect(readFile).not.toHaveBeenCalled();
    expect(await host.listDirectory("")).toEqual({ status: "no-chat-folder" });
    expect(await host.gitSummary()).toEqual({ status: "no-chat-folder" });
    expect(listDirectory).not.toHaveBeenCalled();
    const opening = host.openChat("sess-1");
    await respondToHistoryRequest(handles, 0);
    await opening;
    await host.listDirectory("src");
    expect(await host.readFile("root.ts")).toEqual({ status: "binary" });
    expect(readFile).toHaveBeenCalledExactlyOnceWith("/tmp/proj", "root.ts");
    await host.gitSummary();
    expect(listDirectory).toHaveBeenCalledExactlyOnceWith("/tmp/proj", "src");
    expect(gitSummary).toHaveBeenCalledExactlyOnceWith("/tmp/proj");
    const fresh = host.newChat();
    handles[0]!.resolveExited({ code: 0, signal: null });
    await fresh;
    expect(await host.listDirectory("")).toEqual({ status: "no-chat-folder" });
    expect(await host.gitSummary()).toEqual({ status: "no-chat-folder" });
    expect(listDirectory).toHaveBeenCalledTimes(1);
    expect(await host.readFile("root.ts")).toEqual({ status: "no-chat-folder" });
    expect(readFile).toHaveBeenCalledTimes(1);
  });
  it("openChat resolves the session path from the store, starts it, and pushes state", async () => {
    const { spawner, handles } = createFakeSpawner();
    const store = fakeSessionStore([session({ id: "sess-1", path: "/home/sessions/proj/sess-1.jsonl" })]);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });
    const states: ChatState[] = [];
    host.onState((state) => states.push(state));

    const openPromise = host.openChat("sess-1");
    await respondToHistoryRequest(handles, 0);
    const initial = await openPromise;

    expect(initial.messages).toEqual([]);
    handles[0]?.emitStdout(JSON.stringify({ type: "agent_start" }));
    expect(states.some((state) => state.working)).toBe(true);
  });

  it("openChat resolves with the seeded history once pi answers get_messages", async () => {
    const { spawner, handles } = createFakeSpawner();
    const store = fakeSessionStore([session({ id: "sess-1", path: "/home/sessions/proj/sess-1.jsonl" })]);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });

    const openPromise = host.openChat("sess-1");
    await respondToHistoryRequest(handles, 0, {
      messages: [
        { role: "user", content: "hi", timestamp: 0 },
        { role: "assistant", content: [{ type: "text", text: "hello" }], timestamp: 0 },
      ],
    });
    const state = await openPromise;

    expect(state.messages).toEqual([
      { id: "msg-0", role: "user", text: "hi" },
      { id: "msg-1", role: "assistant", text: "hello", streaming: false },
    ]);
  });

  it("openChat resolves after the 2s bound even if pi never answers get_messages", async () => {
    vi.useFakeTimers();
    try {
      const { spawner, handles } = createFakeSpawner();
      const store = fakeSessionStore([session({ id: "sess-1", path: "/home/sessions/proj/sess-1.jsonl" })]);
      const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });

      const openPromise = host.openChat("sess-1");
      await vi.advanceTimersByTimeAsync(2000);
      const state = await openPromise;

      expect(state.messages).toEqual([]);
      expect(handles).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("openChat rejects for an id the session store does not have", async () => {
    const { spawner } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });

    await expect(host.openChat("missing")).rejects.toThrow(/no session found/i);
  });

  it("newChat starts a session with no sessionPath", async () => {
    const { spawner } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });

    const state = await host.newChat();

    expect(state.messages).toEqual([]);
  });

  it("switching chats stops the previous session before starting the next one", async () => {
    const { spawner, handles } = createFakeSpawner();
    const store = fakeSessionStore([
      session({ id: "sess-1", path: "/a/sess-1.jsonl" }),
      session({ id: "sess-2", path: "/b/sess-2.jsonl" }),
    ]);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });

    const openFirstPromise = host.openChat("sess-1");
    await respondToHistoryRequest(handles, 0);
    await openFirstPromise;
    expect(handles).toHaveLength(1);

    const openSecond = host.openChat("sess-2");
    // stop() waits for the child to exit (or a 3s grace timeout); resolve
    // the first child's exit immediately so this test does not wait it out.
    handles[0]?.resolveExited({ code: 0, signal: null });
    await respondToHistoryRequest(handles, 1);
    await openSecond;

    expect(handles).toHaveLength(2);
  });

  it("sendMessage while the assistant is working resolves { queued: false, reason } instead of rejecting (report once)", async () => {
    const { spawner, handles } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });

    await host.newChat();
    handles[0]?.emitStdout(JSON.stringify({ type: "agent_start" }));

    const result = await host.sendMessage("another message");

    expect(result).toEqual({ queued: false, reason: "Gentle is still working" });
    expect(writesExceptStatusReads(handles[0])).toEqual([]);
  });

  it("startSession serializes overlapping open/new calls: the previous session is fully stopped before the next spawns, and the last request wins", async () => {
    const { spawner, handles, events } = createFakeSpawner();
    const store = fakeSessionStore([
      session({ id: "sess-1", path: "/a/sess-1.jsonl" }),
      session({ id: "sess-2", path: "/b/sess-2.jsonl" }),
    ]);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });

    const openFirst = host.openChat("sess-1");
    const openSecond = host.openChat("sess-2");

    await vi.waitFor(() => expect(handles).toHaveLength(1));
    await respondToHistoryRequest(handles, 0);

    // performStart(sess1) only resolves once the history response above
    // unblocks its bounded wait, and only then does performStart(sess2)'s
    // own `await this.current?.stop()` reach `endStdin()`. Wait for that
    // before resolving session 1's exit below, so stop() still observes a
    // live process instead of racing handleExit's own cleanup (which
    // would otherwise clear `this.process` first and make stop() a no-op).
    await vi.waitFor(() => expect(events).toContain("endStdin:0"));
    // stop() waits for the child to exit (or a 3s grace timeout); resolve
    // it so the serialized second call can proceed without waiting it out.
    handles[0]?.resolveExited({ code: 0, signal: null });

    await vi.waitFor(() => expect(handles).toHaveLength(2));
    await respondToHistoryRequest(handles, 1);

    await Promise.all([openFirst, openSecond]);

    expect(handles).toHaveLength(2);
    // The key regression check: without serialization both sessions spawn
    // back-to-back (current is briefly undefined for both), leaking the
    // first child. Serialized, session 1 must be stopped (endStdin) before
    // session 2 ever spawns.
    expect(events).toEqual(["spawn:0", "endStdin:0", "spawn:1"]);

    await host.abort();
    expect(handles[1]?.writes.some((write) => write.includes('"abort"'))).toBe(true);
    // Session 1 only ever received its own get_messages request (sent by
    // its own start()); the abort reaches the current session (2) only.
    expect(handles[0]?.writes.some((write) => write.includes('"abort"'))).toBe(false);
  });

  it("passes deps.log to every PiSession as its onLog callback", async () => {
    const { spawner, handles } = createFakeSpawner();
    const logLines: string[] = [];
    const host = new ChatHost({
      spawner,
      locator: fakeLocator,
      sessionStore: fakeSessionStore([]),
      env: {},
      log: (line) => logLines.push(line),
    });

    await host.newChat();
    handles[0]?.emitStderr("hello from pi");

    expect(logLines).toEqual(["hello from pi"]);
  });

  it("answerDialog round-trips: forwards the answer to the current session's stdin", async () => {
    const { spawner, handles } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });

    await host.newChat();
    handles[0]?.emitStdout(
      JSON.stringify({ type: "extension_ui_request", id: "dlg-1", method: "select", title: "Pick", options: ["A"] }),
    );

    await host.answerDialog("dlg-1", { value: "A" });

    expect(writesExceptStatusReads(handles[0])).toEqual([`${JSON.stringify({ type: "extension_ui_response", id: "dlg-1", value: "A" })}\n`]);
  });

  it("abort() with no chat open rejects instead of throwing synchronously", async () => {
    const { spawner } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });

    await expect(host.abort()).rejects.toThrow(/no chat is open/i);
  });

  it("onError forwards errors surfaced by the current session (e.g. an unexpected exit)", async () => {
    const { spawner, handles } = createFakeSpawner();
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {} });
    const errors: string[] = [];
    host.onError((message) => errors.push(message));

    await host.newChat();
    handles[0]?.resolveExited({ code: 1, signal: null });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/exited unexpectedly/);
  });

  it("reads homeArgs from deps.homeSettings on every spawn instead of a fixed constant", async () => {
    const { spawner, handles } = createFakeSpawner();
    let mode: "link" | "isolated" = "isolated";
    const homeSettings = { homeArgs: () => (mode === "link" ? ["--link"] : ["--isolated"]) };
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: fakeSessionStore([]), env: {}, homeSettings });

    await host.newChat();
    expect(handles[0]?.args).toContain("--isolated");

    mode = "link";
    const second = host.newChat();
    handles[0]?.resolveExited({ code: 0, signal: null });
    await second;
    expect(handles[1]?.args).toContain("--link");
  });

  it("stop() awaits the internal start chain before stopping the current session, so a queued start cannot outlive quit", async () => {
    const { spawner, handles, events } = createFakeSpawner();
    const store = fakeSessionStore([session({ id: "sess-1", path: "/a/sess-1.jsonl" })]);
    const host = new ChatHost({ spawner, locator: fakeLocator, sessionStore: store, env: {} });

    // An already-open, live chat...
    const openFirstPromise = host.openChat("sess-1");
    await respondToHistoryRequest(handles, 0);
    await openFirstPromise;
    expect(handles).toHaveLength(1);

    // ...then newChat() is requested (queuing behind the still-live open
    // session — its own performStart will stop that session first, before
    // starting the next one), and stop() is called immediately after,
    // racing the still-queued newChat: without joining startChain first,
    // stop() would act on whatever `current` happens to be at this exact
    // synchronous instant (still the open session, not yet the queued
    // one), leaving the queued session's eventual child unstopped.
    const queuedNew = host.newChat();
    const stopping = host.stop();

    // The queued newChat's own internal `await this.current?.stop()` is
    // now stopping the open session; let it exit so newChat's performStart
    // can proceed to spawn its own session.
    handles[0]?.resolveExited({ code: 0, signal: null });
    await vi.waitFor(() => expect(handles).toHaveLength(2));

    // stop()'s own await of the now-current (queued) session; let it exit
    // too, so this resolves without waiting out PiSession's 3s stop grace
    // period.
    handles[1]?.resolveExited({ code: 0, signal: null });

    await stopping;
    await queuedNew;

    // No live child remains: both sessions were told to stop (endStdin),
    // including the one the queued newChat produced.
    expect(events).toEqual(["spawn:0", "endStdin:0", "spawn:1", "endStdin:1"]);
  });
});

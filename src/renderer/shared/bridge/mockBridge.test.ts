import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_STATE, type ChatState } from "@shared/bridge-types";
import { mockBridge, resetMockBridge } from "./mockBridge";

function collectStates(): { states: ChatState[]; errors: string[] } {
  const states: ChatState[] = [];
  const errors: string[] = [];
  mockBridge.onState((state) => states.push(state));
  mockBridge.onError((message) => errors.push(message));
  return { states, errors };
}

describe("mockBridge", () => {
  it("window theme is a no-op that neither pushes state nor errors", async () => {
    const { states, errors } = collectStates();
    const settings = await mockBridge.readSettings();
    await expect(mockBridge.setWindowTheme("gentle")).resolves.toBeUndefined();
    expect(states).toEqual([]);
    expect(errors).toEqual([]);
    expect(await mockBridge.readSettings()).toEqual(settings);
  });
  it("starts preview chats from a stored id or browse intent, never from a path", async () => {
    expect(await mockBridge.startChat({ source: "fromChat", id: "chat-readme" })).toMatchObject({ status: "chosen", chat: { cwd: "/Users/dev/gentle-shell-desktop" } });
    expect(await mockBridge.startChat({ source: "fromChat", id: "missing" })).toEqual({ status: "error", message: "That folder no longer exists." });
    expect(await mockBridge.startChat({ source: "browse" })).toMatchObject({ status: "chosen", chat: { cwd: "/Users/dev/preview" } });
  });
  // resetMockBridge (not just newChat()) so homeChoice, listener sets and
  // id counters never leak between tests — see its doc comment.
  beforeEach(() => {
    resetMockBridge();
  });

  // Ordered deliberately before the "needsChoice: true" test below: with
  // module state reset between tests (resetMockBridge in beforeEach), the
  // two must not depend on running in file order — a rerun with only this
  // test, or the suite in reverse, must see the same fresh homeChoice.
  it("chooseHome persists the choice: a later setupStatus() reports needsChoice: false", async () => {
    await mockBridge.chooseHome("link");

    const status = await mockBridge.setupStatus();

    expect(status.needsChoice).toBe(false);
  });

  it("setupStatus() starts with needsChoice: true and a fake pi detection, so the first-run screen is reachable in the browser preview", async () => {
    const status = await mockBridge.setupStatus();

    expect(status.needsChoice).toBe(true);
    expect(status.detection).toMatchObject({ found: true, hasAuth: true, hasModels: true });
  });

  it("homeStatus() starts isolated and follows chooseHome", async () => {
    expect((await mockBridge.homeStatus()).mode).toBe("isolated");

    await mockBridge.chooseHome("link");

    expect(await mockBridge.homeStatus()).toMatchObject({ mode: "link", dir: expect.stringContaining(".pi") });
  });

  it("listCommands() returns sample commands of every source", async () => {
    const commands = await mockBridge.listCommands();

    expect(commands.length).toBeGreaterThan(0);
    expect(new Set(commands.map((command) => command.source))).toEqual(new Set(["extension", "prompt", "skill"]));
  });

  it("readSettings() returns a state for every setting and setSetting() changes one", async () => {
    const before = await mockBridge.readSettings();
    expect(before.map((state) => state.key)).toContain("review-mode");
    expect(before.find((state) => state.key === "review-mode")).toMatchObject({ value: "on" });

    expect(await mockBridge.setSetting("review-mode", "off")).toEqual({ key: "review-mode", value: "off" });
    expect((await mockBridge.readSettings()).find((state) => state.key === "review-mode")).toEqual({ key: "review-mode", value: "off" });
  });

  it("setSetting() refuses a read-only setting like the real service", async () => {
    await expect(mockBridge.setSetting("yolo", "on")).rejects.toThrow("read-only");
  });

  it("runDiagnostic() returns sample text", async () => {
    expect(await mockBridge.runDiagnostic("doctor")).toContain("checks");
  });

  it("readProfiles() returns sample profiles with an active one", async () => {
    const snapshot = await mockBridge.readProfiles();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.profiles.map((profile) => profile.name)).toContain(snapshot.active);
    expect(snapshot.profiles[0]?.orchestrator?.model).toBeDefined();
  });

  it("returns realistic one-level preview files and git samples", async () => {
    expect(await mockBridge.listDirectory("")).toEqual({ status: "ready", truncated: false, entries: [{ name: "src", kind: "directory" }, { name: "README.md", kind: "file", size: 1280 }] });
    expect(await mockBridge.listDirectory("src")).toEqual({ status: "ready", truncated: false, entries: [{ name: "index.ts", kind: "file", size: 320 }] });
    expect(await mockBridge.listDirectory("unknown")).toEqual({ status: "error", message: "Preview directory not found" });
    expect(await mockBridge.gitSummary()).toEqual({ status: "ready", branch: "main", changed: [{ path: "src/index.ts", code: " M" }], truncatedChanges: false, commits: [{ hash: "a1b2c3d", subject: "Add desktop preview", relativeTime: "2 hours ago" }] });
  });

  describe("preview Git writes", () => {
    async function context() {
      const summary = await mockBridge.gitSummary();
      if (summary.status !== "ready" || !summary.contextId) throw new Error("Missing preview context");
      return summary.contextId;
    }
    async function trust() {
      const id = await context();
      const plan = await mockBridge.gitPlan(id, { kind: "stage", path: "src/index.ts" });
      await mockBridge.gitTrust(id, plan.planId);
      return id;
    }
    beforeEach(async () => { await mockBridge.openChat("chat-readme"); });

    it("requires explicit trust and a fresh plan without changing Git state", async () => {
      const id = await context(); const before = await mockBridge.gitSummary();
      const rejected = await mockBridge.gitPlan(id, { kind: "stage", path: "src/index.ts" });
      expect(rejected).toMatchObject({ needsTrust: true, repository: "/MOCK/preview/chat-readme", files: [] });
      await expect(mockBridge.gitApply(id, rejected.planId)).rejects.toThrow();
      expect(await mockBridge.gitSummary()).toEqual(before);
      const accepted = await mockBridge.gitPlan(id, { kind: "stage", path: "src/index.ts" });
      await mockBridge.gitTrust(id, accepted.planId);
      await expect(mockBridge.gitApply(id, accepted.planId)).rejects.toThrow();
      expect(await mockBridge.gitSummary()).toEqual(before);
      expect(await mockBridge.gitPlan(id, { kind: "stage", path: "src/index.ts" })).toMatchObject({ needsTrust: false });
    });

    it("rejects old contexts and plans on switch while retaining repository trust for the session", async () => {
      const id = await trust(); const plan = await mockBridge.gitPlan(id, { kind: "push" });
      await mockBridge.openChat("chat-refactor"); const next = await context();
      expect(next).not.toBe(id); const before = await mockBridge.gitSummary();
      await expect(mockBridge.gitApply(id, plan.planId)).rejects.toThrow();
      await expect(mockBridge.gitPlan(id, { kind: "push" })).rejects.toThrow();
      await expect(mockBridge.gitApply(next, plan.planId)).rejects.toThrow();
      expect(await mockBridge.gitSummary()).toEqual(before);
      await mockBridge.openChat("chat-readme");
      expect((await mockBridge.gitPlan(await context(), { kind: "push" })).needsTrust).toBe(false);
      resetMockBridge(); await mockBridge.openChat("chat-readme");
      expect((await mockBridge.gitPlan(await context(), { kind: "push" })).needsTrust).toBe(true);
    });

    it("stages and unstages paths, then commits only staged content", async () => {
      const id = await trust();
      let plan = await mockBridge.gitPlan(id, { kind: "stage", path: "src/index.ts" });
      await mockBridge.gitApply(id, plan.planId);
      expect(await mockBridge.gitSummary()).toMatchObject({ changed: [{ path: "src/index.ts", code: "M " }, { path: "README.md", code: "MM" }] });
      plan = await mockBridge.gitPlan(id, { kind: "unstage", path: "src/index.ts" });
      await mockBridge.gitApply(id, plan.planId);
      expect(await mockBridge.gitSummary()).toMatchObject({ changed: [{ path: "src/index.ts", code: " M" }, { path: "README.md", code: "MM" }] });
      plan = await mockBridge.gitPlan(id, { kind: "commit", message: "Preview commit" });
      expect(plan.files.map(file => file.path)).toEqual(["README.md"]);
      await mockBridge.gitApply(id, plan.planId);
      expect(await mockBridge.gitSummary()).toMatchObject({ changed: [{ path: "src/index.ts", code: " M" }, { path: "README.md", code: " M" }], commits: [expect.objectContaining({ subject: "Preview commit" }), expect.anything()] });
      await expect(mockBridge.gitPlan(id, { kind: "commit", message: "no staged files" })).rejects.toThrow();
    });

    it("consumes plans once, expires them and bounds the cache", async () => {
      const id = await trust();
      const plan = await mockBridge.gitPlan(id, { kind: "push" });
      await mockBridge.gitApply(id, plan.planId); const before = await mockBridge.gitSummary();
      await expect(mockBridge.gitApply(id, plan.planId)).rejects.toThrow();
      const expiring = await mockBridge.gitPlan(id, { kind: "push" });
      const clock = vi.spyOn(Date, "now").mockReturnValue(expiring.expiresAt + 1);
      try { await expect(mockBridge.gitApply(id, expiring.planId)).rejects.toThrow(); } finally { clock.mockRestore(); }
      const oldest = await mockBridge.gitPlan(id, { kind: "push" });
      for (let i = 0; i < 16; i++) await mockBridge.gitPlan(id, { kind: "push" });
      await expect(mockBridge.gitApply(id, oldest.planId)).rejects.toThrow();
      expect(await mockBridge.gitSummary()).toEqual(before);
    });

    it("requires clean pull/sync and exposes a redacted, explicitly simulated partial Sync", async () => {
      const id = await trust(); const before = await mockBridge.gitSummary();
      await expect(mockBridge.gitPlan(id, { kind: "sync" })).rejects.toThrow();
      await expect(mockBridge.gitPlan(id, { kind: "pull" })).rejects.toThrow();
      expect(await mockBridge.gitSummary()).toEqual(before);
      for (const path of ["src/index.ts", "README.md"]) {
        const stage = await mockBridge.gitPlan(id, { kind: "stage", path }); await mockBridge.gitApply(id, stage.planId);
      }
      const commit = await mockBridge.gitPlan(id, { kind: "commit", message: "Clean preview" }); await mockBridge.gitApply(id, commit.planId);
      const sync = await mockBridge.gitPlan(id, { kind: "sync" });
      expect(sync.remote).toEqual({ name: "origin", destination: "refs/heads/main", pullUrl: "https://example.invalid/MOCK/preview.git", pushUrl: "https://example.invalid/MOCK/preview.git" });
      expect(sync.summary).toContain("PREVIEW SIMULATION");
      expect(await mockBridge.gitApply(id, sync.planId)).toMatchObject({ kind: "sync", status: "partial", pulled: true, pushed: false });
      await expect(mockBridge.gitApply(id, sync.planId)).rejects.toThrow();
      const pull = await mockBridge.gitPlan(id, { kind: "pull" });
      expect(await mockBridge.gitApply(id, pull.planId)).toMatchObject({ status: "success", pulled: true, pushed: false });
    });
  });

  it("lists two example chats plus one already-working chat", async () => {
    const chats = await mockBridge.listChats();

    expect(chats).toHaveLength(3);
    expect(chats.filter((chat) => chat.state === CHAT_STATE.WORKING)).toHaveLength(1);
  });

  it('opens a select dialog for a message containing "?"', async () => {
    const { states } = collectStates();

    await mockBridge.sendMessage("Which branch?");

    const withDialog = states.find((state) => state.pendingDialogs.length > 0);
    expect(withDialog?.pendingDialogs[0]).toMatchObject({ method: "select" });
    expect(withDialog?.working).toBe(true);
  });

  it('opens a confirm dialog for a message containing "delete"', async () => {
    const { states } = collectStates();

    await mockBridge.sendMessage("please delete the branch");

    const withDialog = states.find((state) => state.pendingDialogs.length > 0);
    expect(withDialog?.pendingDialogs[0]).toMatchObject({ method: "confirm" });
  });

  it('opens an input dialog for a message containing "name"', async () => {
    const { states } = collectStates();

    await mockBridge.sendMessage("what is your name");

    const withDialog = states.find((state) => state.pendingDialogs.length > 0);
    expect(withDialog?.pendingDialogs[0]).toMatchObject({ method: "input" });
  });

  it('surfaces an error through onError for a message containing "fail"', async () => {
    const { states, errors } = collectStates();

    await mockBridge.sendMessage("make this fail please");

    expect(errors).toHaveLength(1);
    expect(states.every((state) => state.pendingDialogs.length === 0)).toBe(true);
  });

  it("answering a dialog clears it and resolves back to not working", async () => {
    const { states } = collectStates();

    await mockBridge.sendMessage("Which branch?");
    const dialog = states.find((state) => state.pendingDialogs.length > 0)?.pendingDialogs[0];
    expect(dialog).toBeDefined();

    await mockBridge.answerDialog(dialog!.id, { value: "main" });

    const final = states.at(-1);
    expect(final?.pendingDialogs).toHaveLength(0);
    expect(final?.working).toBe(false);
  });

  it('resolves { queued: false, reason } instead of notifying onError while already working (report once)', async () => {
    const { errors } = collectStates();

    await mockBridge.sendMessage("Which branch?"); // opens a dialog, leaves working: true
    const result = await mockBridge.sendMessage("another message");

    expect(result).toEqual({ queued: false, reason: "Gentle is still working" });
    expect(errors).toHaveLength(0);
  });

  it("streams a plain reply word by word for an ordinary message", async () => {
    const { states } = collectStates();

    await mockBridge.sendMessage("hello Gentle");
    await vi.waitFor(() => expect(states.at(-1)?.working).toBe(false));

    expect(states.at(-1)?.messages.at(-1)?.text).toContain("hello Gentle");
  });

  // D4: the "Migrate the config schema" working chat (chat-migration) seeds
  // five helpers so the Helpers tab is reachable under `pnpm dev:web`
  // without a real gentle-agents process — including two already finished
  // days ago, so the "Earlier" group (format.ts's partitionHelpers) has
  // something to show in the preview.
  describe("helpers scenario (chat-migration)", () => {
    it("seeds five helper tasks (running, waiting, done, and two earlier-finished) with a matching summary when opened", async () => {
      const state = await mockBridge.openChat("chat-migration");

      expect(state.helpers.tasks).toHaveLength(5);
      expect(state.helpers.tasks.map((task) => task.status).sort()).toEqual(["done", "done", "failed", "running", "waiting"]);
      expect(state.helpers.summary).toEqual({ running: 1, queued: 0, waiting: 1, finished: 3 });
    });

    it("leaves helpers empty for any other chat", async () => {
      const state = await mockBridge.openChat("chat-readme");
      expect(state.helpers).toEqual({ summary: { running: 0, queued: 0, waiting: 0, finished: 0 }, tasks: [] });
    });

    it("grows the running task's thread over time", async () => {
      vi.useFakeTimers();
      try {
        const { states } = collectStates();
        await mockBridge.openChat("chat-migration");

        const runningTask = () => states.at(-1)?.helpers.tasks.find((task) => task.status === "running");
        expect(runningTask()?.thread.items).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(800);
        expect(runningTask()?.thread.items.length).toBeGreaterThan(0);

        const afterOneStep = runningTask()?.thread.items.length ?? 0;
        await vi.advanceTimersByTimeAsync(800);
        expect(runningTask()?.thread.items.length ?? 0).toBeGreaterThan(afterOneStep);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops growing the previous chat's thread once a different chat is opened", async () => {
      vi.useFakeTimers();
      try {
        const { states } = collectStates();
        await mockBridge.openChat("chat-migration");
        await vi.advanceTimersByTimeAsync(800);

        await mockBridge.openChat("chat-readme");
        const countAfterSwitch = states.length;

        await vi.advanceTimersByTimeAsync(5000);
        expect(states.length).toBe(countAfterSwitch);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

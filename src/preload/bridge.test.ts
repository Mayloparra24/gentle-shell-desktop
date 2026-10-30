import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { createBridge, type RendererIpc } from "./bridge";

type Listener = (event: unknown, ...args: unknown[]) => void;

function createFakeIpc(): { ipc: RendererIpc; invoke: ReturnType<typeof vi.fn>; listeners: Map<string, Listener[]> } {
  const invoke = vi.fn().mockResolvedValue(undefined);
  const listeners = new Map<string, Listener[]>();

  const ipc: RendererIpc = {
    invoke,
    on(channel, listener) {
      const list = listeners.get(channel) ?? [];
      list.push(listener);
      listeners.set(channel, list);
    },
    removeListener(channel, listener) {
      const list = listeners.get(channel);
      if (!list) return;
      listeners.set(
        channel,
        list.filter((registered) => registered !== listener),
      );
    },
  };

  return { ipc, invoke, listeners };
}

describe("createBridge", () => {
  it("forwards Git context and typed operations over fixed channels without wrapping results/errors", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);
    const result = { planId: "p" };
    invoke.mockResolvedValue(result);
    expect(await bridge.gitPlan("ctx", { kind: "stage", path: "a" })).toBe(result);
    expect(invoke).toHaveBeenLastCalledWith("git.plan", "ctx", { kind: "stage", path: "a" });
    await bridge.gitTrust("ctx", "p");
    expect(invoke).toHaveBeenLastCalledWith("git.trust", "ctx", "p");
    expect(await bridge.gitApply("ctx", "p")).toBe(result);
    expect(invoke).toHaveBeenLastCalledWith("git.apply", "ctx", "p");
    invoke.mockRejectedValue(new Error("Safe refusal"));
    await expect(bridge.gitApply("ctx", "p")).rejects.toThrow("Safe refusal");
  });
  it("forwards file reads and returns their result unchanged", async () => {
    const { ipc, invoke } = createFakeIpc();
    const result = { status: "ok", path: "src/app.ts", text: "const n = 1;", eol: "lf", language: "typescript" };
    invoke.mockResolvedValue(result);
    expect(await createBridge(ipc).readFile("src/app.ts")).toBe(result);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("workspace.readFile", "src/app.ts");
  });
  it("forwards the theme id to window.setTheme and resolves void", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue({ ok: true });
    await expect(createBridge(ipc).setWindowTheme("gentle")).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("window.setTheme", "gentle");
  });
  it("startChat sends a source or chat id, never an extra renderer path", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue({ status: "cancelled" });
    const bridge = createBridge(ipc);
    expect(await bridge.startChat({ source: "browse" })).toEqual({ status: "cancelled" });
    expect(invoke).toHaveBeenLastCalledWith("chat.start", { source: "browse" });
    const request = { source: "fromChat" as const, id: "stored", cwd: "/untrusted" };
    await bridge.startChat(request);
    expect(invoke).toHaveBeenLastCalledWith("chat.start", { source: "fromChat", id: "stored" });
  });
  it("chooses a native folder without sending a renderer path", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue({ status: "cancelled" });
    expect(await createBridge(ipc).chooseFolder()).toEqual({ status: "cancelled" });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("chat.chooseFolder");
  });
  it("workspace methods send only the relative path or no payload and preserve status results", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);
    invoke.mockResolvedValue({ status: "no-chat-folder" });
    expect(await bridge.listDirectory("src")).toEqual({ status: "no-chat-folder" });
    expect(invoke).toHaveBeenLastCalledWith("workspace.listDirectory", "src");
    invoke.mockResolvedValue({ status: "not-a-repository" });
    expect(await bridge.gitSummary()).toEqual({ status: "not-a-repository" });
    expect(invoke).toHaveBeenLastCalledWith("workspace.gitSummary");
  });
  it("listChats invokes the sessions.list channel with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue([{ id: "chat-1" }]);
    const bridge = createBridge(ipc);

    await expect(bridge.listChats()).resolves.toEqual([{ id: "chat-1" }]);
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LIST_CHATS);
  });

  it("openChat invokes chat.open with the chat id", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.openChat("chat-1");

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.OPEN_CHAT, "chat-1");
  });

  it("newChat invokes chat.new with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.newChat();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.NEW_CHAT);
  });

  it("sendMessage invokes chat.send with the text", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.sendMessage("hello");

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.SEND_MESSAGE, "hello");
  });

  it("abort invokes chat.abort with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.abort();

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.ABORT);
  });

  it("answerDialog invokes dialog.answer with the id and the answer", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.answerDialog("dlg-1", { value: "A" });

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.ANSWER_DIALOG, "dlg-1", { value: "A" });
  });

  it("onState subscribes to the state push channel and forwards pushed state", () => {
    const { ipc, listeners } = createFakeIpc();
    const bridge = createBridge(ipc);
    const states: unknown[] = [];

    bridge.onState((state) => states.push(state));
    const pushed = { messages: [], working: true, pendingDialogs: [], activity: 0 };
    listeners.get(IPC_CHANNELS.STATE_PUSH)?.[0]?.(undefined, pushed);

    expect(states).toEqual([pushed]);
  });

  it("onState's returned unsubscribe removes the listener", () => {
    const { ipc, listeners } = createFakeIpc();
    const bridge = createBridge(ipc);

    const unsubscribe = bridge.onState(() => undefined);
    expect(listeners.get(IPC_CHANNELS.STATE_PUSH)).toHaveLength(1);

    unsubscribe();
    expect(listeners.get(IPC_CHANNELS.STATE_PUSH)).toHaveLength(0);
  });

  it("onError subscribes to the error push channel and forwards the pushed message", () => {
    const { ipc, listeners } = createFakeIpc();
    const bridge = createBridge(ipc);
    const messages: string[] = [];

    bridge.onError((message) => messages.push(message));
    listeners.get(IPC_CHANNELS.ERROR_PUSH)?.[0]?.(undefined, "boom");

    expect(messages).toEqual(["boom"]);
  });

  it("setupStatus invokes setup.status with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue({ needsChoice: true, detection: { found: true, dir: "/dir", hasAuth: true, hasModels: true } });
    const bridge = createBridge(ipc);

    await expect(bridge.setupStatus()).resolves.toEqual({
      needsChoice: true,
      detection: { found: true, dir: "/dir", hasAuth: true, hasModels: true },
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.SETUP_STATUS);
  });

  it("chooseHome invokes setup.chooseHome with the mode", async () => {
    const { ipc, invoke } = createFakeIpc();
    const bridge = createBridge(ipc);

    await bridge.chooseHome("link");

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CHOOSE_HOME, "link");
  });

  it("homeStatus invokes setup.homeStatus with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    const status = { mode: "link", dir: "/pi", detection: { found: true, dir: "/pi", hasAuth: true, hasModels: true } };
    invoke.mockResolvedValue(status);

    await expect(createBridge(ipc).homeStatus()).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.HOME_STATUS);
  });

  it("listCommands invokes commands.list with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue([{ name: "gentle-status", source: "extension" }]);

    await expect(createBridge(ipc).listCommands()).resolves.toEqual([{ name: "gentle-status", source: "extension" }]);
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LIST_COMMANDS);
  });

  it("readSettings, setSetting and runDiagnostic invoke their channels with the typed arguments", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue("done");
    const bridge = createBridge(ipc);

    await bridge.readSettings();
    await bridge.setSetting("review-mode", "on");
    await bridge.runDiagnostic("doctor");

    expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.SETTINGS_READ);
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.SETTINGS_SET, "review-mode", "on");
    expect(invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.DIAGNOSTIC_RUN, "doctor");
  });

  it("readProfiles invokes profiles.read with no payload", async () => {
    const { ipc, invoke } = createFakeIpc();
    invoke.mockResolvedValue({ status: "none", profiles: [] });

    await expect(createBridge(ipc).readProfiles()).resolves.toEqual({ status: "none", profiles: [] });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PROFILES_READ);
  });

  it("onError's returned unsubscribe removes the listener", () => {
    const { ipc, listeners } = createFakeIpc();
    const bridge = createBridge(ipc);

    const unsubscribe = bridge.onError(() => undefined);
    expect(listeners.get(IPC_CHANNELS.ERROR_PUSH)).toHaveLength(1);

    unsubscribe();
    expect(listeners.get(IPC_CHANNELS.ERROR_PUSH)).toHaveLength(0);
  });
});

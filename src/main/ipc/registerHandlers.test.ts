import { describe, expect, it, vi } from "vitest";
import type { IpcMain, WebContents } from "electron";
import type { ChatHost } from "../domain/session/ChatHost";
import type { SetupService } from "../ports";
import { registerHandlers } from "./registerHandlers";

function fakeHost(overrides: Partial<ChatHost> = {}): ChatHost {
  return {
    listChats: vi.fn(),
    openChat: vi.fn(),
    newChat: vi.fn(),
    sendMessage: vi.fn(),
    abort: vi.fn(),
    answerDialog: vi.fn(),
    onState: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as unknown as ChatHost;
}

function fakeSetup(): SetupService {
  return {
    status: vi.fn().mockResolvedValue({ needsChoice: false, detection: { found: false, dir: "", hasAuth: false, hasModels: false } }),
    homeStatus: vi.fn().mockResolvedValue({ mode: "isolated", dir: "/home/.gentle-shell/agent", detection: { found: false, dir: "", hasAuth: false, hasModels: false } }),
    profiles: vi.fn().mockResolvedValue({ status: "none", profiles: [] }),
    chooseHome: vi.fn().mockResolvedValue(undefined),
  };
}

/** Mirrors Electron's real behaviour: handle() throws for a channel that
 * already has a handler; removeHandler() is a safe no-op otherwise. */
function fakeIpcMain(): IpcMain {
  const handlers = new Set<string>();
  return {
    handle: vi.fn((channel: string) => {
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.add(channel);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  } as unknown as IpcMain;
}

function fakeWebContents(): WebContents {
  return { send: vi.fn() } as unknown as WebContents;
}

describe("registerHandlers", () => {
  it("startChat accepts only a browse intent or stored id and rejects malformed input", async () => {
    const host = fakeHost({ startChat: vi.fn().mockResolvedValue({ status: "cancelled" }) });
    const ipc = fakeIpcMain();
    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);
    const start = registeredHandler(ipc, "chat.start");
    await start({}, { source: "fromChat", id: "stored", cwd: "/untrusted" });
    expect(host.startChat).toHaveBeenLastCalledWith({ source: "fromChat", id: "stored" });
    await start({}, { source: "browse", cwd: "/untrusted" });
    expect(host.startChat).toHaveBeenLastCalledWith({ source: "browse" });
    for (const input of [null, "/path", {}, { source: "fromChat", id: 1 }, { source: "path", cwd: "/path" }]) {
      expect(await start({}, input)).toEqual({ status: "error", message: "Invalid folder request" });
    }
    expect(host.startChat).toHaveBeenCalledTimes(2);
  });
  it("folder and new-chat handlers never forward renderer-supplied paths", async () => {
    const host = fakeHost({ chooseFolder: vi.fn().mockResolvedValue({ status: "cancelled" }) });
    const ipc = fakeIpcMain();
    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);
    expect(await registeredHandler(ipc, "chat.chooseFolder")({}, "/untrusted")).toEqual({ status: "cancelled" });
    expect(host.chooseFolder).toHaveBeenCalledExactlyOnceWith();
    await registeredHandler(ipc, "chat.new")({}, "/untrusted");
    expect(host.newChat).toHaveBeenCalledExactlyOnceWith();
  });
  it("wires workspace reads, ignores extra cwd payloads and rejects malformed paths as data", async () => {
    const host = fakeHost({ listDirectory: vi.fn().mockResolvedValue({ status: "ready", entries: [], truncated: false }), gitSummary: vi.fn().mockResolvedValue({ status: "not-a-repository" }) });
    const ipc = fakeIpcMain();
    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);
    expect(await registeredHandler(ipc, "workspace.listDirectory")({}, "src", "/untrusted")).toEqual({ status: "ready", entries: [], truncated: false });
    expect(host.listDirectory).toHaveBeenCalledExactlyOnceWith("src");
    expect(await registeredHandler(ipc, "workspace.gitSummary")({}, "/untrusted")).toEqual({ status: "not-a-repository" });
    expect(host.gitSummary).toHaveBeenCalledExactlyOnceWith();
    expect(await registeredHandler(ipc, "workspace.listDirectory")({}, null)).toEqual({ status: "error", message: "Invalid relative directory path" });
    expect(host.listDirectory).toHaveBeenCalledTimes(1);
  });
  it("can be called again for a new window without throwing (window closed, then re-registered on activate)", () => {
    const ipc = fakeIpcMain();
    const host = fakeHost();

    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);

    expect(() => registerHandlers(host, fakeSetup(), fakeWebContents(), ipc)).not.toThrow();
  });

  it("returns an unsubscribe that stops forwarding state/error pushes for that call's webContents", () => {
    const ipc = fakeIpcMain();
    const unsubscribeState = vi.fn();
    const unsubscribeError = vi.fn();
    const host = fakeHost({
      onState: vi.fn().mockReturnValue(unsubscribeState),
      onError: vi.fn().mockReturnValue(unsubscribeError),
    });

    const unregister = registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);
    unregister();

    expect(unsubscribeState).toHaveBeenCalledTimes(1);
    expect(unsubscribeError).toHaveBeenCalledTimes(1);
  });

  it("registers setup.status and setup.chooseHome, wired to the SetupService", () => {
    const ipc = fakeIpcMain();
    const host = fakeHost();
    const setup = fakeSetup();

    registerHandlers(host, setup, fakeWebContents(), ipc);

    const statusHandler = registeredHandler(ipc, "setup.status");
    const chooseHomeHandler = registeredHandler(ipc, "setup.chooseHome");

    void statusHandler({} as never);
    expect(setup.status).toHaveBeenCalledTimes(1);

    void chooseHomeHandler({} as never, "link");
    expect(setup.chooseHome).toHaveBeenCalledWith("link");
  });

  // registerRequestHandler is a thin pass-through (ipc.handle(channel,
  // listener) with no try/catch of its own) so a rejected SetupService
  // call reaches the renderer as a rejected invoke() unchanged — this is
  // Electron's own ipcMain.handle()/ipcRenderer.invoke() contract, not
  // something this file has to implement; this test pins that the
  // pass-through never starts swallowing or rewrapping it (T6 follow-up).
  it("setup.chooseHome's handler rejects with the SetupService's own error instead of swallowing it", async () => {
    const ipc = fakeIpcMain();
    const setup: SetupService = {
      status: vi.fn(),
      homeStatus: vi.fn(),
      profiles: vi.fn(),
      chooseHome: vi.fn().mockRejectedValue(new Error("Could not save the home choice: EACCES")),
    };

    registerHandlers(fakeHost(), setup, fakeWebContents(), ipc);
    const chooseHomeHandler = registeredHandler(ipc, "setup.chooseHome");

    await expect(chooseHomeHandler({} as never, "link")).rejects.toThrow("Could not save the home choice: EACCES");
  });
});

function registeredHandler(ipc: IpcMain, channel: string): (...args: unknown[]) => unknown {
  const call = vi.mocked(ipc.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  if (!call) throw new Error(`no handler registered for channel "${channel}"`);
  return call[1] as (...args: unknown[]) => unknown;
}

describe("registerHandlers: home status and commands", () => {
  it("registers setup.homeStatus wired to the SetupService", async () => {
    const ipc = fakeIpcMain();
    const setup = fakeSetup();

    registerHandlers(fakeHost(), setup, fakeWebContents(), ipc);
    const status = await registeredHandler(ipc, "setup.homeStatus")({} as never);

    expect(setup.homeStatus).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ mode: "isolated" });
  });

  it("registers commands.list wired to ChatHost.listCommands", async () => {
    const ipc = fakeIpcMain();
    const host = fakeHost({ listCommands: vi.fn().mockResolvedValue([{ name: "gentle-status", source: "extension" }]) });

    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);
    const commands = await registeredHandler(ipc, "commands.list")({} as never);

    expect(host.listCommands).toHaveBeenCalledTimes(1);
    expect(commands).toEqual([{ name: "gentle-status", source: "extension" }]);
  });
});

describe("registerHandlers: settings", () => {
  const settingsHost = () =>
    fakeHost({
      readSettings: vi.fn().mockResolvedValue([{ key: "review-mode", value: "off" }]),
      setSetting: vi.fn().mockResolvedValue({ key: "review-mode", value: "on" }),
      runDiagnostic: vi.fn().mockResolvedValue("ok"),
    });

  it("registers settings.read, settings.set and diagnostic.run wired to ChatHost", async () => {
    const ipc = fakeIpcMain();
    const host = settingsHost();

    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);

    expect(await registeredHandler(ipc, "settings.read")({} as never)).toEqual([{ key: "review-mode", value: "off" }]);
    expect(await registeredHandler(ipc, "settings.set")({} as never, "review-mode", "on")).toEqual({ key: "review-mode", value: "on" });
    expect(host.setSetting).toHaveBeenCalledWith("review-mode", "on");
    expect(await registeredHandler(ipc, "diagnostic.run")({} as never, "doctor")).toBe("ok");
    expect(host.runDiagnostic).toHaveBeenCalledWith("doctor");
  });

  it("rejects a settings.set or diagnostic.run whose arguments are not plain strings, without calling ChatHost", async () => {
    const ipc = fakeIpcMain();
    const host = settingsHost();
    registerHandlers(host, fakeSetup(), fakeWebContents(), ipc);

    await expect(registeredHandler(ipc, "settings.set")({} as never, { key: "review-mode" }, "on")).rejects.toThrow("Invalid settings request");
    await expect(registeredHandler(ipc, "settings.set")({} as never, "review-mode", 1)).rejects.toThrow("Invalid settings request");
    await expect(registeredHandler(ipc, "diagnostic.run")({} as never, undefined)).rejects.toThrow("Invalid diagnostic request");
    expect(host.setSetting).not.toHaveBeenCalled();
    expect(host.runDiagnostic).not.toHaveBeenCalled();
  });
});

describe("registerHandlers: profiles", () => {
  it("registers profiles.read wired to the SetupService", async () => {
    const ipc = fakeIpcMain();
    const setup = fakeSetup();

    registerHandlers(fakeHost(), setup, fakeWebContents(), ipc);

    expect(await registeredHandler(ipc, "profiles.read")({} as never)).toEqual({ status: "none", profiles: [] });
    expect(setup.profiles).toHaveBeenCalledTimes(1);
  });
});

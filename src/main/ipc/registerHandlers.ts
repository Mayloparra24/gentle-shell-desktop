import type { IpcMain, WebContents } from "electron";
import type { DialogAnswer, DiagnosticKind, HomeMode, SettingKey } from "@shared/bridge-types";
import type { GitWriteRequest } from "@shared/git-write-types";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import type { ChatHost } from "../domain/session/ChatHost";
import type { SetupService } from "../ports";
import { overlayColorsFor, type OverlayColors } from "../domain/window/windowChrome";

/**
 * Registers `ipcMain.handle` for every GentleBridge request channel
 * (thin pass-through to ChatHost) and forwards ChatHost's state/error
 * pushes to the renderer via `webContents.send`. Takes `ipc`/`webContents`
 * as parameters (never imports the `ipcMain` value itself) so this file
 * never executes `require("electron")` at module load time — only
 * src/main/index.ts, which genuinely runs inside Electron, does that.
 *
 * Returns an unsubscribe function that stops forwarding state/error
 * pushes for this call's webContents. Request handlers are re-registered
 * on `ipc` every call (`removeHandler` first, since Electron's
 * `ipc.handle` throws "Attempted to register a second handler" for a
 * channel that already has one): M1 has exactly one window at a time, but
 * that window can still close and a new one open later (macOS `activate`,
 * T5 host follow-up), so this must tolerate being called again rather
 * than assuming it only ever runs once for the app's lifetime. `setup`
 * (T5) answers the first-run/home-choice channels; it has no per-window
 * state, so it is exposed the same way for every window instead of also
 * needing an unsubscribe.
 */
export function registerHandlers(host: ChatHost, setup: SetupService, webContents: WebContents, ipc: IpcMain, setWindowTheme?: (colors: OverlayColors) => void): () => void {
  registerRequestHandler(ipc, IPC_CHANNELS.SET_WINDOW_THEME, (_event, themeId: unknown) => {
    const colors = typeof themeId === "string" ? overlayColorsFor(themeId) : undefined;
    if (!colors) return { ok: false };
    setWindowTheme?.(colors);
    return { ok: true };
  });
  registerRequestHandler(ipc, IPC_CHANNELS.LIST_CHATS, () => host.listChats());
  registerRequestHandler(ipc, IPC_CHANNELS.LIST_DIRECTORY, (_event, relativePath: unknown) => {
    if (typeof relativePath !== "string") return { status: "error", message: "Invalid relative directory path" };
    return host.listDirectory(relativePath);
  });
  registerRequestHandler(ipc, IPC_CHANNELS.READ_FILE, (_event, relativePath: unknown) => {
    if (typeof relativePath !== "string" || !relativePath.length) return { status: "error", message: "Invalid file path" };
    return host.readFile(relativePath);
  });
  registerRequestHandler(ipc, IPC_CHANNELS.GIT_SUMMARY, () => host.gitSummary());
  registerRequestHandler(ipc, IPC_CHANNELS.GIT_PLAN, async (_event, ...args: unknown[]) => {
    if (args.length !== 2 || !gitId(args[0]) || !gitRequest(args[1])) throw new Error("Invalid Git request");
    return host.gitPlan(args[0], args[1]);
  });
  for (const [channel, method] of [[IPC_CHANNELS.GIT_TRUST, "gitTrust"], [IPC_CHANNELS.GIT_APPLY, "gitApply"]] as const) {
    registerRequestHandler(ipc, channel, async (_event, ...args: unknown[]) => {
      if (args.length !== 2 || !gitId(args[0]) || !gitId(args[1])) throw new Error("Invalid Git request");
      return host[method](args[0], args[1]);
    });
  }
  registerRequestHandler(ipc, IPC_CHANNELS.OPEN_CHAT, (_event, id: string) => host.openChat(id));
  registerRequestHandler(ipc, IPC_CHANNELS.NEW_CHAT, () => host.newChat());
  registerRequestHandler(ipc, IPC_CHANNELS.CHOOSE_FOLDER, () => host.chooseFolder());
  registerRequestHandler(ipc, IPC_CHANNELS.START_CHAT, (_event, request: unknown) => {
    if (request && typeof request === "object" && "source" in request) {
      if (request.source === "browse") return host.startChat({ source: "browse" });
      if (request.source === "fromChat" && "id" in request && typeof request.id === "string") {
        return host.startChat({ source: "fromChat", id: request.id });
      }
    }
    return { status: "error", message: "Invalid folder request" };
  });
  registerRequestHandler(ipc, IPC_CHANNELS.SEND_MESSAGE, (_event, text: string) => host.sendMessage(text));
  registerRequestHandler(ipc, IPC_CHANNELS.ABORT, () => host.abort());
  registerRequestHandler(ipc, IPC_CHANNELS.ANSWER_DIALOG, (_event, id: string, answer: DialogAnswer) =>
    host.answerDialog(id, answer),
  );
  registerRequestHandler(ipc, IPC_CHANNELS.SETUP_STATUS, () => setup.status());
  registerRequestHandler(ipc, IPC_CHANNELS.HOME_STATUS, () => setup.homeStatus());
  registerRequestHandler(ipc, IPC_CHANNELS.LIST_COMMANDS, () => host.listCommands());
  registerRequestHandler(ipc, IPC_CHANNELS.SETTINGS_READ, () => host.readSettings());
  registerRequestHandler(ipc, IPC_CHANNELS.SETTINGS_SET, async (_event, key: unknown, value: unknown) => {
    if (typeof key !== "string" || typeof value !== "string") throw new Error("Invalid settings request");
    return host.setSetting(key as SettingKey, value);
  });
  registerRequestHandler(ipc, IPC_CHANNELS.DIAGNOSTIC_RUN, async (_event, kind: unknown) => {
    if (typeof kind !== "string") throw new Error("Invalid diagnostic request");
    return host.runDiagnostic(kind as DiagnosticKind);
  });
  registerRequestHandler(ipc, IPC_CHANNELS.PROFILES_READ, () => setup.profiles());
  registerRequestHandler(ipc, IPC_CHANNELS.CHOOSE_HOME, (_event, mode: HomeMode) => setup.chooseHome(mode));

  const unsubscribeState = host.onState((state) => webContents.send(IPC_CHANNELS.STATE_PUSH, state));
  const unsubscribeError = host.onError((message) => webContents.send(IPC_CHANNELS.ERROR_PUSH, message));

  return () => {
    unsubscribeState();
    unsubscribeError();
  };
}

function gitString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\u0000");
}

function gitId(value: unknown): value is string { return gitString(value, 128) && value.trim().length > 0; }

function gitRequest(value: unknown): value is GitWriteRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const keys = Object.keys(request);
  if (!Object.hasOwn(request, "kind")) return false;
  if (request.kind === "stage" || request.kind === "unstage") {
    return keys.length === 2 && Object.hasOwn(request, "path") && gitString(request.path, 4096);
  }
  if (request.kind === "commit") {
    return keys.length === 2 && Object.hasOwn(request, "message") && gitString(request.message, 20_000) && request.message.trim().length > 0;
  }
  return keys.length === 1 && ["push", "pull", "sync"].includes(request.kind as string);
}

type IpcHandleListener = Parameters<IpcMain["handle"]>[1];

function registerRequestHandler(ipc: IpcMain, channel: string, listener: IpcHandleListener): void {
  ipc.removeHandler(channel);
  ipc.handle(channel, listener);
}

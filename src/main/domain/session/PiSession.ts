import {
  MESSAGE_ROLE,
  SLASH_COMMAND_SOURCE,
  type ChatMessage,
  type ChatState,
  type DialogAnswer,
  type PromptResult,
  type SlashCommand,
  type SlashCommandSource,
} from "@shared/bridge-types";
import { INITIAL_CHAT_STATE, reduceChat } from "../rpc/chatReducer";
import { decodeLine, encodeCommand } from "../rpc/codec";
import { extractHistoryMessages, historyToMessages } from "../rpc/history";
import type { RpcCommand, RpcEvent, RpcResponse } from "../rpc/types";
import type { LauncherLocator, ProcessSpawner, SpawnedProcess } from "../../ports";

export interface PiSessionOptions {
  readonly spawner: ProcessSpawner;
  readonly locator: LauncherLocator;
  /** e.g. `["--link"]` or `["--isolated"]`; empty means gentle-shell's own default. */
  readonly homeArgs?: readonly string[];
  readonly sessionPath?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd?: string;
  /**
   * Receives raw child stderr lines (diagnostics, warnings) for logging.
   * Defaults to a no-op. Stderr output is not, by itself, evidence of a
   * failure (see handleStderrLine) so it no longer sets `lastError`.
   */
  readonly onLog?: (line: string) => void;
}

// PromptResult and DialogAnswer now live in @shared/bridge-types (T5, T3: the renderer
// constructs these too, answering a Dialog card through
// GentleBridge.answerDialog).

interface PiSessionEventMap {
  readonly state: ChatState;
  readonly event: RpcEvent;
  readonly error: Error;
}

type Listener<T> = (payload: T) => void;

/** Minimal typed pub/sub — PiSession only needs on/off/emit, not a full EventEmitter. */
class TypedEmitter<Events> {
  private readonly listeners: { [K in keyof Events]?: Array<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[event] ?? [];
    list.push(listener);
    this.listeners[event] = list;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter((registered) => registered !== listener);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners[event] ?? []) listener(payload);
  }
}

const STOP_GRACE_PERIOD_MS = 3000;

/** How long `listCommands` waits for pi's `get_commands` response. */
const COMMANDS_TIMEOUT_MS = 3000;

/** How long `runSilent` waits for a command's response. */
const SILENT_TIMEOUT_MS = 8000;

/** Extra wait after a silent command's response, for notifications that trail it. */
const SILENT_SETTLE_MS = 150;

/** What `handleLine` hands to an active silent run: the notifications and the command's response. */
interface SilentCapture {
  readonly id: string;
  readonly messages: string[];
  onResponse(response: RpcResponse): void;
  onExit(error: Error): void;
}

/**
 * Set on every spawned pi process (M2 prerequisite, see
 * odd/tasks/desktop-m2-helpers.md): only with this flag does gentle-pi
 * enable RPC dialogs for ask_user_question/ask_user_choice and publish
 * subagent activity via the gentle-agents setWidget widget. Applied last
 * in start()'s env merge so neither `this.env` nor a launcher's own env
 * (e.g. ELECTRON_RUN_AS_NODE) can accidentally suppress it.
 */
const GENTLE_SHELL_INTERACTIVE_HOST_ENV = { GENTLE_SHELL_INTERACTIVE_HOST: "1" } as const;

/**
 * Owns one `gentle-shell --mode rpc` child process: spawns it through a
 * ProcessSpawner (resolved via a LauncherLocator), decodes its stdout into
 * RpcEvents, folds them into ChatState with the pure reducer, and emits
 * both out. Only depends on ports (ProcessSpawner, LauncherLocator), so it
 * needs no Node import itself and is testable with fakes — see
 * src/README.md's hexagonal main process note.
 *
 * Never throws from a public method: spawn/decode/stream failures surface
 * as `lastError` on the emitted state plus an ("error", Error) event
 * instead, because this runs inside Electron's main process, where an
 * uncaught exception takes down the whole app.
 */
export class PiSession extends TypedEmitter<PiSessionEventMap> {
  private readonly spawner: ProcessSpawner;
  private readonly locator: LauncherLocator;
  private readonly homeArgs: readonly string[];
  private readonly sessionPath: string | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly cwd: string | undefined;
  private readonly onLog: (line: string) => void;

  private state: ChatState = INITIAL_CHAT_STATE;
  private process: SpawnedProcess | undefined;
  private stopping = false;
  private historyRequestCounter = 0;
  private commandsRequestCounter = 0;
  private silentCounter = 0;
  private capture: SilentCapture | undefined;
  private silentChain: Promise<unknown> = Promise.resolve();
  /** Set right after a `get_messages` history request is sent (reopening a
   * session with a `sessionPath`); cleared once its matching response
   * arrives. Lets `applyHistoryResponse` correlate the response by `id`
   * and ignore anything else that happens to carry `command: "get_messages"`
   * (a stale or unrelated response). */
  private pendingHistoryRequestId: string | undefined;

  constructor(options: PiSessionOptions) {
    super();
    this.spawner = options.spawner;
    this.locator = options.locator;
    this.homeArgs = options.homeArgs ?? [];
    this.sessionPath = options.sessionPath;
    this.env = options.env;
    this.cwd = options.cwd;
    this.onLog = options.onLog ?? (() => undefined);
  }

  /**
   * Resolves the launcher, spawns it with `--mode rpc`, and starts streaming
   * events. Guarded against a double start: while a process is already
   * active, a second call surfaces an error instead of spawning a second
   * child (which would silently orphan the first one's stdin/stdout wiring).
   */
  start(): void {
    if (this.process) {
      this.surfaceError(new Error("PiSession: already started (a session is already active)"));
      return;
    }

    try {
      const launcher = this.locator.locate();
      const args = [
        ...launcher.args,
        ...this.homeArgs,
        "--mode",
        "rpc",
        ...(this.sessionPath ? ["--session", this.sessionPath] : []),
      ];
      const env = { ...this.env, ...(launcher.env ?? {}), ...GENTLE_SHELL_INTERACTIVE_HOST_ENV };
      const proc = this.spawner.spawn(launcher.command, args, env, this.cwd);
      this.process = proc;

      proc.onStdoutLine((line) => this.handleLine(line));
      proc.onStderrLine((line) => this.handleStderrLine(line));
      proc.onError((error) => this.surfaceError(error));
      proc.exited.then(({ code, signal, error }) => this.handleExit(code, signal, error)).catch(() => undefined);

      // Reopening an existing chat (sessionPath set): the child already has
      // this session's prior messages, but the renderer starts with an
      // empty thread until we ask for them. A fresh chat has no history to
      // load, so this is skipped entirely when sessionPath is unset.
      if (this.sessionPath) this.requestHistory();
    } catch (error) {
      this.surfaceError(toError(error));
    }
  }

  /** Sends `get_messages` with a fresh correlation id, tracked in
   * `pendingHistoryRequestId` so the matching response (handled in
   * `applyHistoryResponse`) can be told apart from any other response. */
  private requestHistory(): void {
    const id = `history-${this.historyRequestCounter++}`;
    this.pendingHistoryRequestId = id;
    this.send({ type: "get_messages", id });
  }

  /**
   * Sends `prompt` and appends the user's message to state immediately (no
   * round trip needed to show it). M1 keeps this simple with no queue: a
   * prompt sent while the assistant is still working is rejected outright
   * (no message appended, nothing written to stdin) instead of buffered.
   */
  prompt(text: string): PromptResult {
    if (this.state.working) {
      // Declined, not a failure: report once via the return value (and the
      // state push below, for anyone reading ChatState.lastError directly)
      // rather than also emitting an "error" event — ChatHost.sendMessage
      // (T5) resolves this PromptResult straight to the renderer instead
      // of rejecting, so a second report through onError would duplicate
      // the same message.
      const reason = "Gentle is still working";
      this.state = { ...this.state, lastError: reason };
      this.emit("state", this.state);
      return { queued: false, reason };
    }

    this.state = appendUserMessage(this.state, text);
    this.emit("state", this.state);
    this.send({ type: "prompt", message: text });
    return { queued: true };
  }

  /**
   * Asks pi which commands `/name` can run (extension commands, prompt
   * templates, skills) with `get_commands`, correlated by `id`. Rejects (it
   * never throws synchronously) when there is no active process, when pi
   * answers with an error, or when pi does not answer in time.
   */
  listCommands(timeoutMs: number = COMMANDS_TIMEOUT_MS): Promise<SlashCommand[]> {
    if (!this.process || this.stopping) {
      return Promise.reject(new Error("PiSession: cannot list commands (no active process)"));
    }

    const id = `commands-${this.commandsRequestCounter++}`;

    return new Promise<SlashCommand[]>((resolve, reject) => {
      const finish = (settle: () => void): void => {
        clearTimeout(timer);
        this.off("event", onEvent);
        settle();
      };
      const onEvent = (event: RpcEvent): void => {
        if (event.type !== "response" || event.id !== id) return;
        if (event.success) finish(() => resolve(toSlashCommands(event.data)));
        else finish(() => reject(new Error(event.error)));
      };
      const timer = setTimeout(
        () => finish(() => reject(new Error("Timed out waiting for the command list"))),
        timeoutMs,
      );

      this.on("event", onEvent);
      this.send({ type: "get_commands", id });
    });
  }

  /**
   * Runs one slash command and resolves with the notification texts it
   * printed, without touching the chat: nothing is added to `messages` and
   * those notifications never reach the reducer, even right after the user
   * ran a command themselves. Runs are queued one at a time. Rejects (it
   * never throws synchronously) when there is no active process, when the
   * agent is working, when pi answers with an error, or when pi does not
   * answer in time.
   */
  runSilent(command: string, timeoutMs: number = SILENT_TIMEOUT_MS): Promise<string[]> {
    if (!this.process || this.stopping) {
      return Promise.reject(new Error("PiSession: cannot run a command (no active process)"));
    }
    if (this.state.working) {
      return Promise.reject(new Error("Gentle is still working; try again when it finishes"));
    }

    const run = this.silentChain.then(() => this.execSilent(command, timeoutMs));
    this.silentChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private execSilent(command: string, timeoutMs: number): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const id = `silent-${this.silentCounter++}`;
      const messages: string[] = [];
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (settle: () => void): void => {
        clearTimeout(timer);
        clearTimeout(settleTimer);
        this.capture = undefined;
        settle();
      };
      const timer = setTimeout(() => finish(() => reject(new Error("Timed out waiting for gentle-shell"))), timeoutMs);

      this.capture = {
        id,
        messages,
        onResponse: (response) => {
          if (!response.success) finish(() => reject(new Error(response.error)));
          else settleTimer = setTimeout(() => finish(() => resolve(messages)), SILENT_SETTLE_MS);
        },
        onExit: (error) => finish(() => reject(error)),
      };

      this.send({ type: "prompt", message: command, id });
    });
  }

  abort(): void {
    this.send({ type: "abort" });
  }

  /** Answers a pending extension_ui_request dialog and drops it from `pendingDialogs`. */
  answerDialog(id: string, answer: DialogAnswer): void {
    this.state = {
      ...this.state,
      pendingDialogs: this.state.pendingDialogs.filter((dialog) => dialog.id !== id),
    };
    this.emit("state", this.state);

    if ("cancelled" in answer) {
      this.send({ type: "extension_ui_response", id, cancelled: true });
    } else if ("confirmed" in answer) {
      this.send({ type: "extension_ui_response", id, confirmed: answer.confirmed });
    } else {
      this.send({ type: "extension_ui_response", id, value: answer.value });
    }
  }

  getState(): ChatState {
    return this.state;
  }

  /** Graceful shutdown: close stdin, wait up to 3s for exit, then kill. */
  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc) return;

    this.stopping = true;
    proc.endStdin();

    const timedOut = Symbol("stop-timeout");
    const outcome = await Promise.race([
      proc.exited.then(() => "exited" as const),
      new Promise<typeof timedOut>((resolve) => {
        setTimeout(() => resolve(timedOut), STOP_GRACE_PERIOD_MS);
      }),
    ]);

    if (outcome === timedOut) {
      proc.kill();
      await proc.exited.catch(() => undefined);
    }

    this.process = undefined;
  }

  private send(command: RpcCommand): void {
    if (!this.process || this.stopping) {
      this.surfaceError(new Error("PiSession: cannot send a command (no active process)"));
      return;
    }
    this.process.writeStdin(encodeCommand(command));
  }

  private handleLine(line: string): void {
    try {
      const decoded = decodeLine(line);
      if ("kind" in decoded) return; // unknown/unmodeled line: nothing to fold or emit
      if (this.capture && this.takeForSilentRun(decoded)) return;

      // `now` feeds reduceChat's setWidget helpers-retention fallback
      // (endedAt for a task gentle-pi drops after it finishes); PiSession
      // is the impure boundary, reduceChat itself stays pure.
      this.state = reduceChat(this.state, decoded, new Date().toISOString());
      // reduceChat has no case for "response" (its default arm returns
      // state unchanged), so folding the get_messages history response in
      // here, right after, never fights it.
      if (decoded.type === "response") this.state = this.applyHistoryResponse(this.state, decoded);
      this.emit("event", decoded);
      this.emit("state", this.state);
    } catch (error) {
      this.surfaceError(toError(error));
    }
  }

  /** True when an active silent run consumed this event (a notification, or its own response). */
  private takeForSilentRun(event: RpcEvent): boolean {
    const capture = this.capture;
    if (!capture) return false;

    if (event.type === "extension_ui_request" && event.method === "notify") {
      const message = (event as { readonly message?: unknown }).message;
      if (typeof message === "string") capture.messages.push(message);
      return true;
    }
    if (event.type === "response" && event.command === "prompt" && event.id === capture.id) {
      capture.onResponse(event);
      return true;
    }
    return false;
  }

  /**
   * Folds the `get_messages` history response into `state.messages`, once:
   * a response for any other command, or one whose `id` does not match
   * `pendingHistoryRequestId` (stale or unrelated), is ignored outright.
   * Never throws: a failed response surfaces as `lastError` instead of an
   * empty thread with no explanation.
   */
  private applyHistoryResponse(state: ChatState, response: RpcResponse): ChatState {
    if (response.command !== "get_messages" || response.id !== this.pendingHistoryRequestId) return state;
    this.pendingHistoryRequestId = undefined;

    if (!response.success) {
      return { ...state, lastError: "Could not load this chat's history" };
    }
    // Never clobber messages a live prompt already appended while the
    // history request was still in flight.
    if (state.messages.length > 0) return state;

    return { ...state, messages: historyToMessages(extractHistoryMessages(response.data)) };
  }

  /**
   * Child stderr is diagnostics/warnings, not by itself evidence of a
   * failure (pi logs there routinely) — route it to the injectable logger
   * instead of surfacing it as `lastError`, which previously made routine
   * stderr output look like a fatal error to the UI.
   */
  private handleStderrLine(line: string): void {
    if (line.trim().length === 0) return;
    this.onLog(line);
  }

  /**
   * Clears `this.process` unconditionally so the next `send()` never
   * writes to a dead child's stdin (R4-001), whether the exit was clean,
   * a crash, or a spawn failure. ANY exit not requested via `stop()` —
   * including a clean `code === 0` self-exit — resets `working` and drops
   * any pending dialogs: the child that would have resolved them is gone
   * either way, so a stale "working" pill or an unanswerable dialog card
   * would otherwise strand the UI regardless of how the child exited. An
   * error is only surfaced for a non-zero exit: a spawn failure already
   * surfaced its real error via `onError` (not re-reported here), and a
   * clean self-exit is not, by itself, evidence of a failure.
   */
  private handleExit(code: number | null, signal: NodeJS.Signals | null, spawnError?: Error): void {
    this.process = undefined;
    if (this.stopping) return;

    this.state = { ...this.state, working: false, pendingDialogs: [] };
    this.capture?.onExit(new Error("gentle-shell exited before it answered"));

    if (spawnError) {
      this.emit("state", this.state);
      return;
    }
    if (code !== 0) {
      this.surfaceError(new Error(`gentle-shell exited unexpectedly (code ${code ?? "null"}${signal ? `, signal ${signal}` : ""})`));
      return;
    }
    this.emit("state", this.state);
  }

  private surfaceError(error: Error): void {
    this.state = { ...this.state, lastError: error.message };
    this.emit("error", error);
    this.emit("state", this.state);
  }
}

function appendUserMessage(state: ChatState, text: string): ChatState {
  const message: ChatMessage = { id: `msg-${state.messages.length}`, role: MESSAGE_ROLE.USER, text };
  return { ...state, messages: [...state.messages, message] };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

const COMMAND_SOURCES: readonly string[] = Object.values(SLASH_COMMAND_SOURCE);

/** Keeps the fields the UI needs from pi's `get_commands` payload and drops entries it cannot use. */
function toSlashCommands(data: unknown): SlashCommand[] {
  const commands = (data as { commands?: unknown } | undefined)?.commands;
  if (!Array.isArray(commands)) return [];

  const result: SlashCommand[] = [];
  for (const entry of commands) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, description, source } = entry as Record<string, unknown>;
    if (typeof name !== "string" || name.length === 0) continue;
    if (typeof source !== "string" || !COMMAND_SOURCES.includes(source)) continue;
    const kind = source as SlashCommandSource;
    result.push(typeof description === "string" ? { name, description, source: kind } : { name, source: kind });
  }
  return result;
}

import type { FileReadResult, StartChatSource, StartChatResult, FolderChoice, DirectoryListing, GitSummary, ChatState, ChatSummary, DialogAnswer, DiagnosticKind, PromptResult, SettingKey, SettingState, SlashCommand } from "@shared/bridge-types";
import { randomUUID } from "node:crypto";
import type { GitWriteRequest, GitWritePlan, GitWriteResult } from "@shared/git-write-types";
import type { GitWriteContext, GitWriteService } from "../../adapters/gitWrite";
import { boundedStop } from "../lifecycle/boundedStop";
import type { RpcEvent } from "../rpc/types";
import type { GitSummaryReader, WorkspaceReader, HomeSettings, LauncherLocator, ProcessSpawner, SessionStore } from "../../ports";
import { createSettingsService } from "../settings/settingsService";
import { PiSession } from "./PiSession";
import { toChatSummaries } from "./sessionList";

const NO_HOME_SETTINGS: HomeSettings = { homeArgs: () => [] };

/**
 * Bounds how long `openChat` waits for pi's `get_messages` history response
 * (PiSession.start() sends it automatically for a sessionPath-backed
 * session) before returning anyway, so a slow or missing response never
 * blocks the renderer from opening the chat — see `waitForHistoryResponse`
 * below. Later pushes (the response itself, if it arrives late, or any
 * live event) keep flowing through the normal `onState` subscription
 * either way.
 */
const HISTORY_LOAD_TIMEOUT_MS = 2000;

/**
 * Resolves once `session` reports its `get_messages` history response
 * (success or failure) on its `event` stream. Reused with `boundedStop`
 * (src/main/domain/lifecycle/boundedStop.ts) instead of a bespoke timer,
 * so `performStart` only waits for a session actually started with a
 * sessionPath — `newChat` never sends `get_messages` in the first place,
 * so there is nothing to wait for there.
 */
function waitForHistoryResponse(session: PiSession): Promise<void> {
  return new Promise((resolve) => {
    const onEvent = (event: RpcEvent): void => {
      if (event.type !== "response" || event.command !== "get_messages") return;
      session.off("event", onEvent);
      resolve();
    };
    session.on("event", onEvent);
  });
}

export interface ChatHostDeps {
  readonly spawner: ProcessSpawner;
  readonly chooseFolder?: () => Promise<string | undefined>;
  readonly folderExists?: (cwd: string) => Promise<boolean>;
  readonly locator: LauncherLocator;
  readonly sessionStore: SessionStore;
  readonly env: NodeJS.ProcessEnv;
  readonly workspaceReader?: WorkspaceReader;
  readonly gitSummaryReader?: GitSummaryReader;
  readonly gitWrites?: GitWriteService;
  /** Resolves the launcher home flags (e.g. `["--link"]`) fresh on every
   * spawned session, from the persisted home choice (T5) instead of a
   * fixed constant, so a choice made mid-session takes effect on the very
   * next open/new. Defaults to no flags when omitted (e.g. plain unit
   * tests that don't care about home). */
  readonly homeSettings?: HomeSettings;
  /** Receives raw child stderr lines from every spawned PiSession, forwarded
   * unchanged from PiSessionOptions.onLog (T5 host follow-up). Defaults to
   * a no-op. */
  readonly log?: (line: string) => void;
}

type StateListener = (state: ChatState) => void;
type ErrorListener = (message: string) => void;

/**
 * Owns the one PiSession the desktop window can have open at a time (M1
 * scope: no multi-chat tabs). openChat/newChat stop whatever session is
 * currently running before starting the next one, so exactly one
 * `gentle-shell --mode rpc` child is ever alive — this is the IPC layer's
 * single point of contact with PiSession, mirroring the shape of
 * GentleBridge so registerHandlers.ts (src/main/ipc/) is a thin pass-through.
 */
export class ChatHost {
  private readonly deps: ChatHostDeps;
  private current: PiSession | undefined;
  private currentCwd: string | undefined;
  private readonly stateListeners = new Set<StateListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  /** Serializes startSession calls: a second open/new call queues behind
   * whatever the previous one is still doing (stopping the old session,
   * starting the new one) instead of racing it. Without this, two
   * overlapping calls can both observe `this.current` as unset and both
   * spawn a live child, leaking the first one — see ChatHost.test.ts's
   * "startSession serializes overlapping open/new calls" test. */
  private startChain: Promise<void> = Promise.resolve();
  private generation = 0;
  private contextId = randomUUID();
  private readonly lifecycleOperations = new Set<Promise<unknown>>();
  private hostWork = 0;
  private gitPreparing = 0;
  private applySettlement: Promise<void> | undefined;
  private stopping = false;

  constructor(deps: ChatHostDeps) {
    this.deps = deps;
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async listChats(): Promise<ChatSummary[]> {
    const sessions = await this.deps.sessionStore.listAll();
    return toChatSummaries(sessions);
  }

  /** Reopens an existing chat: looks up its session file path from the
   * store (ChatSummary.id is pi's session id, not a file path) and passes
   * it to PiSession as `sessionPath` (`--session <path>`). */
  async openChat(id: string): Promise<ChatState> {
    return this.lifecycle(async () => {
      const sessions = await this.deps.sessionStore.listAll();
      const match = sessions.find((session) => session.id === id);
      if (!match) throw new Error(`ChatHost: no session found for id "${id}"`);
      return this.startSession(match.path, match.cwd);
    });
  }

  /** Starts a fresh chat: no sessionPath, so PiSession omits `--session`. */
  async newChat(cwd?: string): Promise<ChatState> {
    return this.lifecycle(() => this.startSession(undefined, cwd));
  }

  async startChat(request: StartChatSource): Promise<StartChatResult> {
    if (request.source === "browse") return this.chooseFolder();
    return this.lifecycle(async () => {
      const sessions = await this.deps.sessionStore.listAll();
      const match = sessions.find((session) => session.id === request.id);
      if (!match?.cwd || !await this.deps.folderExists?.(match.cwd)) {
        return { status: "error", message: "That folder no longer exists." };
      }
      return { status: "chosen", chat: await this.startSession(undefined, match.cwd) };
    });
  }

  async chooseFolder(): Promise<FolderChoice> {
    return this.lifecycle(async () => {
      if (!this.deps.chooseFolder) throw new Error("Folder dialog unavailable");
      const cwd = await this.deps.chooseFolder();
      if (!cwd) return { status: "cancelled" };
      return { status: "chosen", chat: await this.startSession(undefined, cwd) };
    });
  }

  async listDirectory(relativePath: string): Promise<DirectoryListing> {
    if (!this.current || !this.currentCwd) return { status: "no-chat-folder" };
    if (!this.deps.workspaceReader) return { status: "error", message: "Workspace reader unavailable" };
    return this.deps.workspaceReader.listDirectory(this.currentCwd, relativePath);
  }

  async readFile(relativePath: string): Promise<FileReadResult> {
    if (!this.current || !this.currentCwd) return { status: "no-chat-folder" };
    if (!this.deps.workspaceReader) return { status: "error", message: "Workspace reader unavailable" };
    return this.deps.workspaceReader.readFile(this.currentCwd, relativePath);
  }

  async gitSummary(): Promise<GitSummary> {
    this.assertUnlocked();
    if (!this.current || !this.currentCwd || this.lifecycleOperations.size) return { status: "no-chat-folder" };
    if (!this.deps.gitSummaryReader) return { status: "error", message: "Git reader unavailable" };
    const generation = this.generation;
    const contextId = this.contextId;
    const cwd = this.currentCwd;
    return this.withHostWork(async () => {
      const summary = await this.deps.gitSummaryReader!.gitSummary(cwd);
      if (generation !== this.generation) return { status: "no-chat-folder" };
      return summary.status === "ready" ? { ...summary, contextId } : summary;
    });
  }

  async gitPlan(contextId: string, request: GitWriteRequest): Promise<GitWritePlan> {
    const context = this.gitContext(contextId);
    this.gitPreparing += 1;
    try { return await this.deps.gitWrites!.plan(context, request); }
    finally { this.gitPreparing -= 1; }
  }

  async gitTrust(contextId: string, planId: string): Promise<void> {
    const context = this.gitContext(contextId);
    this.gitPreparing += 1;
    try { await this.deps.gitWrites!.trust(context, planId); }
    finally { this.gitPreparing -= 1; }
  }

  async gitApply(contextId: string, planId: string): Promise<GitWriteResult> {
    const context = this.gitContext(contextId);
    if (this.gitPreparing || context.isBusy()) throw new Error("Chat is busy: wait for agent work and dialogs to finish.");
    // Acquire before invoking the service, including synchronous callbacks/throws.
    let release!: () => void;
    this.applySettlement = new Promise<void>((resolve) => { release = resolve; });
    try {
      return await this.deps.gitWrites!.apply(context, planId);
    } finally {
      this.applySettlement = undefined;
      release();
    }
  }

  /** Resolves the PromptResult as-is instead of throwing when the
   * assistant is already working: PiSession.prompt already reports the
   * decline once (state push + this return value), so rejecting here too
   * would report it a second time through the IPC error path. */
  async sendMessage(text: string): Promise<PromptResult> {
    return this.withHostWork(() => this.requireCurrent().prompt(text));
  }

  /** The commands the open chat can run with `/name`; rejects when no chat is open. */
  async listCommands(): Promise<SlashCommand[]> {
    return this.withHostWork(() => this.requireCurrent().listCommands());
  }

  /** Every setting's value as the open gentle-shell reports it; rejects when no chat is open. */
  async readSettings(): Promise<SettingState[]> {
    return this.withHostWork(() => this.settingsService().readAll());
  }

  /** Sets one allowlisted setting and resolves with the value gentle-shell confirms. */
  async setSetting(key: SettingKey, value: string): Promise<SettingState> {
    return this.withHostWork(() => this.settingsService().set(key, value));
  }

  async runDiagnostic(kind: DiagnosticKind): Promise<string> {
    return this.withHostWork(() => this.settingsService().diagnostic(kind));
  }

  async abort(): Promise<void> {
    this.requireCurrent().abort();
  }

  async answerDialog(id: string, answer: DialogAnswer): Promise<void> {
    await this.withHostWork(() => this.requireCurrent().answerDialog(id, answer));
  }

  /** Stops the current session, if any. Called on app quit. Joins
   * `startChain` first (T6 follow-up): quitting right as a queued
   * open/new is still in flight would otherwise act on whatever
   * `current` happens to be at that exact synchronous instant — possibly
   * still unset, or the previous session — leaving the queued session's
   * eventual child unstopped and outliving the app. */
  async stop(timeoutMs?: number): Promise<void> {
    this.invalidateGitContext();
    this.stopping = true;
    try {
      await this.applySettlement;
      const stopSessions = async () => {
        await Promise.allSettled([...this.lifecycleOperations]);
        await this.startChain;
        await this.current?.stop();
        this.currentCwd = undefined;
      };
      // Shutdown may bound agent cleanup, but must never abandon an active write.
      if (timeoutMs === undefined) await stopSessions();
      else await boundedStop(stopSessions, timeoutMs);
    } finally {
      this.stopping = false;
    }
  }

  /** Queues this start behind the previous one via `startChain` (see its
   * doc comment) instead of running `performStart` directly. */
  private async startSession(sessionPath: string | undefined, cwd?: string): Promise<ChatState> {
    const run = this.startChain.then(() => this.performStart(sessionPath, cwd));
    // Keep the chain alive regardless of this step's outcome, so one
    // failed start (e.g. a locator error) never permanently wedges every
    // later open/new call behind a rejected promise.
    this.startChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async performStart(sessionPath: string | undefined, cwd?: string): Promise<ChatState> {
    if (this.applySettlement) throw new Error("Git write in progress. Wait for it to finish.");
    this.currentCwd = undefined;
    await this.current?.stop();

    const session = new PiSession({
      spawner: this.deps.spawner,
      locator: this.deps.locator,
      homeArgs: (this.deps.homeSettings ?? NO_HOME_SETTINGS).homeArgs(),
      sessionPath,
      cwd,
      env: this.deps.env,
      onLog: this.deps.log,
    });
    session.on("state", (state) => this.emitState(state));
    session.on("error", (error) => this.emitError(error.message));

    this.current = session;
    this.currentCwd = cwd;

    if (sessionPath) {
      // Attach the listener before start() so it can never miss a response
      // that (in principle) arrived before this line runs.
      const historyLoaded = waitForHistoryResponse(session);
      session.start();
      await boundedStop(() => historyLoaded, HISTORY_LOAD_TIMEOUT_MS);
    } else {
      // newChat: PiSession never sends get_messages without a sessionPath,
      // so there is nothing to wait for.
      session.start();
    }

    return { ...session.getState(), cwd };
  }

  /** Settings run as silent commands in the open session; the command list tells which ones this gentle-shell has. */
  private settingsService() {
    const session = this.requireCurrent();
    return createSettingsService(
      (command) => session.runSilent(command),
      async () => (await session.listCommands()).map((command) => command.name),
    );
  }

  private invalidateGitContext(): void {
    this.generation += 1;
    this.contextId = randomUUID();
  }

  private assertUnlocked(): void {
    if (this.applySettlement) throw new Error("Git write in progress. Wait for it to finish.");
    if (this.stopping) throw new Error("Chat is stopping. Wait for it to finish.");
  }

  /** Register the entire lookup/dialog, not just the eventual serialized spawn. */
  private async lifecycle<T>(operation: () => Promise<T>): Promise<T> {
    this.assertUnlocked();
    this.invalidateGitContext();
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    this.lifecycleOperations.add(pending);
    try { return await operation(); }
    finally {
      this.lifecycleOperations.delete(pending);
      settle();
    }
  }

  private async withHostWork<T>(operation: () => T | Promise<T>): Promise<T> {
    this.assertUnlocked();
    this.hostWork += 1;
    try { return await operation(); }
    finally { this.hostWork -= 1; }
  }

  private gitContext(contextId: string): GitWriteContext {
    this.assertUnlocked();
    if (contextId !== this.contextId || this.lifecycleOperations.size) {
      throw new Error("Chat context changed or is switching. Reload Git and plan again.");
    }
    this.requireCurrent();
    if (!this.currentCwd) throw new Error("No chat folder is open.");
    if (!this.deps.gitWrites) throw new Error("Git writes unavailable.");
    const generation = this.generation;
    const session = this.current!;
    const context = {
      cwd: this.currentCwd,
      generation,
      isCurrent: () => generation === this.generation,
      isBusy: () => this.hostWork > 0 || session.isBusy(),
    };
    if (context.isBusy()) {
      throw new Error("Chat is busy: wait for agent work, queued commands and dialogs to finish. If a command timed out, switch chats before writing.");
    }
    return context;
  }

  private requireCurrent(): PiSession {
    this.assertUnlocked();
    if (!this.current) throw new Error("ChatHost: no chat is open (call openChat or newChat first)");
    return this.current;
  }

  private emitState(state: ChatState): void {
    for (const listener of this.stateListeners) listener(state);
  }

  private emitError(message: string): void {
    for (const listener of this.errorListeners) listener(message);
  }
}

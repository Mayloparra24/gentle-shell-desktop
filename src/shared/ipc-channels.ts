/**
 * IPC channel names shared between src/main/ipc/registerHandlers.ts and
 * src/preload/bridge.ts. Lives under src/shared/, not src/main/ipc/,
 * because both processes need it — the same Scope Rule that put
 * bridge-types.ts here instead of duplicating it locally (see
 * src/README.md).
 */
export const IPC_CHANNELS = {
  LIST_CHATS: "sessions.list",
  LIST_DIRECTORY: "workspace.listDirectory",
  GIT_SUMMARY: "workspace.gitSummary",
  OPEN_CHAT: "chat.open",
  NEW_CHAT: "chat.new",
  CHOOSE_FOLDER: "chat.chooseFolder",
  START_CHAT: "chat.start",
  SEND_MESSAGE: "chat.send",
  ABORT: "chat.abort",
  ANSWER_DIALOG: "dialog.answer",
  /** webContents.send push: the current chat's ChatState changed. */
  STATE_PUSH: "chat.state",
  /** webContents.send push: an error was surfaced for the current chat. */
  ERROR_PUSH: "chat.error",
  /** First-run status (T5): whether to show the home-choice screen. */
  SETUP_STATUS: "setup.status",
  /** Persists the chosen home mode (T5). */
  CHOOSE_HOME: "setup.chooseHome",
  /** The home in use now and its resolved folder. */
  HOME_STATUS: "setup.homeStatus",
  /** Slash commands the open chat can run (pi `get_commands`). */
  LIST_COMMANDS: "commands.list",
  /** Every setting's current value. */
  SETTINGS_READ: "settings.read",
  /** Sets one setting to one allowed value. */
  SETTINGS_SET: "settings.set",
  /** Runs one read-only diagnostic. */
  DIAGNOSTIC_RUN: "diagnostic.run",
  /** The profiles gentle-shell keeps (read-only). */
  PROFILES_READ: "profiles.read",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

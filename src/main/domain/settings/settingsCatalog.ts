import { SETTING_KEY, type SettingKey } from "@shared/bridge-types";

/**
 * The only gentle-shell commands the settings screen may run. Each entry says
 * how to read a setting (its `status` text) and, when writing is possible over
 * RPC, how to set it. Nothing outside this table is ever sent to gentle-shell,
 * so the page cannot ask for an arbitrary command.
 *
 * The parsers read the plain-text replies gentle-shell prints today. A reply
 * they do not recognize reads as `undefined` ("unknown"), never as a guess, so
 * a future gentle-shell that words a status differently shows "unknown"
 * instead of a wrong value.
 */
export interface SettingDef {
  readonly key: SettingKey;
  /** The command's name as `get_commands` lists it (no leading slash). */
  readonly commandName: string;
  readonly statusCommand: string;
  /** Reads the value out of one notification text; undefined when it is not this setting's status. */
  readonly parse: (text: string) => string | undefined;
  /** Allowed values for writing; empty for read-only settings. */
  readonly allowed: readonly string[];
  /** The command that sets `value`; absent for read-only settings. */
  readonly writeCommand?: (value: string) => string;
  /** Why a read-only setting cannot be changed here. */
  readonly readOnlyReason?: string;
}

const ON_OFF = ["on", "off"] as const;

const enableDisable = (command: string) => (value: string) => `${command} ${value === "on" ? "enable" : "disable"}`;

function matchWord(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.toLowerCase();
}

export const SETTING_DEFS: readonly SettingDef[] = [
  {
    key: SETTING_KEY.VIM,
    commandName: "gentle:vim",
    statusCommand: "/gentle:vim status",
    parse: (text) => matchWord(text, /^vim:\s*(on|off)\b/m),
    allowed: ON_OFF,
    writeCommand: enableDisable("/gentle:vim"),
  },
  {
    key: SETTING_KEY.ANIMATIONS,
    commandName: "gentle:animations",
    statusCommand: "/gentle:animations status",
    parse: (text) => matchWord(text, /^animations:\s*(quality|performance|potato)\b/m),
    allowed: ["quality", "performance", "potato"],
    writeCommand: (value) => `/gentle:animations ${value}`,
  },
  {
    key: SETTING_KEY.DOUBLE_ESC_CANCEL,
    commandName: "gentle:double-esc-cancel",
    statusCommand: "/gentle:double-esc-cancel status",
    parse: (text) => matchWord(text, /^double-esc-cancel:\s*(on|off)\b/m),
    allowed: ON_OFF,
    writeCommand: enableDisable("/gentle:double-esc-cancel"),
  },
  {
    key: SETTING_KEY.PERMISSION_MODE,
    commandName: "gentle:mode",
    statusCommand: "/gentle:mode status",
    // "Permissions: AUTO — default: SUPER-YOLO": the saved default is what applies to new chats.
    parse: (text) => matchWord(text, /^Permissions:[^\n]*default:\s*(normal|auto|yolo|super-yolo)\b/im),
    allowed: ["normal", "auto", "yolo", "super-yolo"],
    writeCommand: (value) => `/gentle:mode default ${value}`,
  },
  {
    key: SETTING_KEY.YOLO,
    commandName: "gentle:yolo",
    statusCommand: "/gentle:yolo status",
    parse: (text) => matchWord(text, /^YOLO\s+(on|off)\b/im),
    allowed: [],
    readOnlyReason: "gentle-shell only lets you turn YOLO on from an interactive terminal session.",
  },
  {
    key: SETTING_KEY.REVIEW_MODE,
    commandName: "gentle:review-mode",
    statusCommand: "/gentle:review-mode status",
    parse: (text) => matchWord(text, /^receipt-driven development:\s*(on|off)\b/m),
    allowed: ON_OFF,
    writeCommand: enableDisable("/gentle:review-mode"),
  },
  {
    key: SETTING_KEY.BACKGROUND_SUBAGENTS,
    commandName: "gentle:background-subagents",
    statusCommand: "/gentle:background-subagents status",
    parse: (text) => matchWord(text, /^background subagents:\s*(on|off)\b/m),
    allowed: ON_OFF,
    writeCommand: enableDisable("/gentle:background-subagents"),
  },
  {
    key: SETTING_KEY.TELEMETRY,
    commandName: "gentle:telemetry",
    statusCommand: "/gentle:telemetry status",
    parse: (text) => {
      try {
        const parsed: unknown = JSON.parse(text);
        const enabled = (parsed as { enabled?: unknown } | null)?.enabled;
        return typeof enabled === "boolean" ? (enabled ? "on" : "off") : undefined;
      } catch {
        return undefined;
      }
    },
    allowed: ON_OFF,
    writeCommand: enableDisable("/gentle:telemetry"),
  },
];

/** The first notification that is this setting's status, so unrelated startup notices around it are ignored. */
export function pickValue(def: SettingDef, messages: readonly string[]): string | undefined {
  for (const message of messages) {
    const value = def.parse(message);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((def) => def.key === key);
}

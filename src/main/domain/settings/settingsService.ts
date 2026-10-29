import { DIAGNOSTIC_KIND, type DiagnosticKind, type SettingKey, type SettingState } from "@shared/bridge-types";
import { SETTING_DEFS, findSettingDef, pickValue, type SettingDef } from "./settingsCatalog";

/**
 * Sends one slash command to the open gentle-shell session without touching
 * the chat and resolves with the notification texts it printed.
 */
export type SilentRunner = (command: string) => Promise<readonly string[]>;

const DIAGNOSTIC_COMMANDS: Record<DiagnosticKind, string> = {
  [DIAGNOSTIC_KIND.DOCTOR]: "/gentle:doctor",
  [DIAGNOSTIC_KIND.STATUS]: "/gentle:status",
};

const UNREADABLE = "Could not read this setting from gentle-shell";

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Reads and changes gentle-shell settings through its own commands only.
 * `commandNames` lists the commands the installed gentle-shell offers
 * (`get_commands`), so a setting its version does not have is reported as
 * unavailable instead of being sent. A change is only reported as applied
 * after the `status` command confirms it.
 */
export function createSettingsService(run: SilentRunner, commandNames?: () => Promise<readonly string[]>) {
  // One listing per service instance, so reading every setting asks gentle-shell once.
  let listing: Promise<readonly string[]> | undefined;

  async function isAvailable(def: SettingDef): Promise<boolean> {
    if (!commandNames) return true;
    try {
      listing ??= commandNames();
      return (await listing).includes(def.commandName);
    } catch {
      // Not being able to list commands must not hide settings that may work.
      return true;
    }
  }

  async function readDef(def: SettingDef): Promise<SettingState> {
    if (!(await isAvailable(def))) return { key: def.key, unavailable: true };
    try {
      const value = pickValue(def, await run(def.statusCommand));
      return value === undefined ? { key: def.key, error: UNREADABLE } : { key: def.key, value };
    } catch (cause) {
      return { key: def.key, error: errorText(cause) };
    }
  }

  return {
    read(key: SettingKey): Promise<SettingState> {
      const def = findSettingDef(key);
      if (!def) return Promise.reject(new Error(`Unknown setting "${String(key)}"`));
      return readDef(def);
    },

    /** One state per setting, read one after another (gentle-shell answers them in order). */
    async readAll(): Promise<SettingState[]> {
      const states: SettingState[] = [];
      for (const def of SETTING_DEFS) states.push(await readDef(def));
      return states;
    },

    async set(key: SettingKey, value: string): Promise<SettingState> {
      const def = findSettingDef(key);
      if (!def) throw new Error(`Unknown setting "${String(key)}"`);
      if (!def.writeCommand) throw new Error(`"${def.key}" is read-only here. ${def.readOnlyReason ?? ""}`.trim());
      if (!def.allowed.includes(value)) throw new Error(`"${value}" is not allowed for "${def.key}"`);
      if (!(await isAvailable(def))) throw new Error(`This version of gentle-shell does not have the ${def.commandName} command`);

      const printed = await run(def.writeCommand(value));
      const confirmed = await readDef(def);
      if (confirmed.value === value) return confirmed;

      const hint = printed.find((line) => line.trim() !== "")?.trim();
      throw new Error(`gentle-shell did not apply ${def.key}: ${hint ?? confirmed.error ?? "the value did not change"}`);
    },

    async diagnostic(kind: DiagnosticKind): Promise<string> {
      const command = DIAGNOSTIC_COMMANDS[kind];
      if (!command) throw new Error(`Unknown diagnostic "${String(kind)}"`);
      const printed = await run(command);
      return printed.map((line) => line.trim()).filter((line) => line !== "").join(String.fromCharCode(10, 10));
    },
  };
}

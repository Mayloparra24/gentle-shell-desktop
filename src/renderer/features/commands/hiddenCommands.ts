import type { SlashCommand } from "@shared/bridge-types";

export const HIDDEN_COMMAND_NAMES: readonly string[] = [
  "gentle:customize",
  "history",
  "gentle:status-timing",
  "gentle:dev-binary",
  "gentle:scratch",
  "gentle:doctor",
  "gentle:status",
  "gentle:telemetry",
];

export function visibleCommands(commands: readonly SlashCommand[], showAll: boolean): SlashCommand[] {
  return commands.filter((command) => showAll || !HIDDEN_COMMAND_NAMES.includes(command.name));
}

import type { SlashCommand } from "@shared/bridge-types";

/** Stable within each relevance tier; never mutate the bridge's list. */
export function filterCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
  const needle = query.toLowerCase();
  if (!needle) return [...commands];
  const prefixes: SlashCommand[] = [];
  const names: SlashCommand[] = [];
  const descriptions: SlashCommand[] = [];
  for (const command of commands) {
    const name = command.name.toLowerCase();
    if (name.startsWith(needle)) prefixes.push(command);
    else if (name.includes(needle)) names.push(command);
    else if (command.description?.toLowerCase().includes(needle)) descriptions.push(command);
  }
  return [...prefixes, ...names, ...descriptions];
}

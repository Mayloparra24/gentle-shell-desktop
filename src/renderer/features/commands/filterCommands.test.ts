import { describe, expect, it } from "vitest";
import type { SlashCommand } from "@shared/bridge-types";
import { filterCommands } from "./filterCommands";

const commands: SlashCommand[] = [
  { name: "review", description: "COMmit changes", source: "skill" },
  { name: "auto-commit", source: "extension" },
  { name: "commit-message", source: "prompt" },
  { name: "other", source: "skill" },
];

describe("filterCommands", () => {
  it("ranks case-insensitive name prefixes, name substrings, then descriptions", () => {
    expect(filterCommands(commands, "COM").map(({ name }) => name)).toEqual(["commit-message", "auto-commit", "review"]);
    expect(commands[0]?.name).toBe("review");
  });
  it("returns all commands in order for an empty query and none for a miss", () => {
    expect(filterCommands(commands, "")).toEqual(commands);
    expect(filterCommands(commands, "missing")).toEqual([]);
  });
});

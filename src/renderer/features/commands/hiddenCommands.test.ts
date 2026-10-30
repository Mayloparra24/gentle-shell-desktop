import { describe, expect, it } from "vitest";
import type { SlashCommand } from "@shared/bridge-types";
import { HIDDEN_COMMAND_NAMES, visibleCommands } from "./hiddenCommands";

const hidden = ["gentle:customize", "history", "gentle:status-timing", "gentle:dev-binary", "gentle:scratch", "gentle:doctor", "gentle:status", "gentle:telemetry"];

describe("visibleCommands", () => {
  it("exports the exact hide-list", () => {
    expect([...HIDDEN_COMMAND_NAMES]).toEqual(hidden);
  });
  it.each(hidden)("hides the exact name %s regardless of source", (name) => {
    const commands: SlashCommand[] = ["extension", "skill", "prompt"].map((source) => ({ name, source: source as SlashCommand["source"] }));
    expect(visibleCommands(commands, false)).toEqual([]);
    expect(visibleCommands(commands, true)).toEqual(commands);
  });
  it("keeps every other command, skill and prompt in order without an allowlist", () => {
    const names = ["gentle:persona", "gentle:mode", "gentle:yolo", "gentle:review-mode", "gentle:background-subagents", "gentle:profiles", "skill-registry:refresh", "unknown-extension"];
    const commands: SlashCommand[] = [
      ...names.map((name) => ({ name, source: "extension" as const })),
      { name: "skill:history", source: "skill" },
      { name: "history-template", source: "prompt" },
    ];
    expect(visibleCommands(commands, false)).toEqual(commands);
    expect(visibleCommands(commands, true)).toEqual(commands);
    expect(visibleCommands([], false)).toEqual([]);
  });
});

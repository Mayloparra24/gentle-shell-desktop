import { describe, expect, it } from "vitest";
import { SETTING_KEY } from "@shared/bridge-types";
import { SETTING_DEFS, pickValue } from "./settingsCatalog";

const def = (key: string) => {
  const found = SETTING_DEFS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`no definition for ${key}`);
  return found;
};

// Texts copied from the real gentle-shell `status` replies (see odd/tasks/settings.md L2).
const REAL = {
  mode: "Permissions: NORMAL — default: NORMAL",
  modeSuper: "Permissions: AUTO — default: SUPER-YOLO",
  yolo: "YOLO OFF",
  review: "receipt-driven development: on (decided by global)",
  background: "background subagents: on (decided by global file C:/home/b.json; capability: ready)\nResolution order: project file, global file.",
  telemetry: JSON.stringify({ schema: "gentle-ai.telemetry-status/v1", operation: "status", enabled: true, source: "default" }),
};

describe("settings catalog parsers", () => {
  it.each(["vim", "animations", "double-esc-cancel"])("does not define terminal-only %s", (key) => {
    expect(SETTING_DEFS.map((definition) => definition.key)).not.toContain(key);
  });
  it.each([
    [SETTING_KEY.PERMISSION_MODE, REAL.mode, "normal"],
    [SETTING_KEY.YOLO, REAL.yolo, "off"],
    [SETTING_KEY.REVIEW_MODE, REAL.review, "on"],
    [SETTING_KEY.BACKGROUND_SUBAGENTS, REAL.background, "on"],
    [SETTING_KEY.TELEMETRY, REAL.telemetry, "on"],
  ])("reads %s from its real status text", (key, text, expected) => {
    expect(def(key).parse(text)).toBe(expected);
  });

  it("reads the saved default of the permission mode, not the one of the running session", () => {
    expect(def(SETTING_KEY.PERMISSION_MODE).parse(REAL.modeSuper)).toBe("super-yolo");
  });

  it("returns undefined for text that is not that setting's status", () => {
    expect(def(SETTING_KEY.REVIEW_MODE).parse("Ponytail loaded: off")).toBeUndefined();
    expect(def(SETTING_KEY.TELEMETRY).parse("not json")).toBeUndefined();
  });

  it("pickValue ignores unrelated startup notifications around the status line", () => {
    const messages = ["Gentle Shell is running inside a Git repository rooted at your home folder", "Ponytail loaded: off", REAL.review];
    expect(pickValue(def(SETTING_KEY.REVIEW_MODE), messages)).toBe("on");
    expect(pickValue(def(SETTING_KEY.BACKGROUND_SUBAGENTS), messages)).toBeUndefined();
  });

  it("only exposes allowlisted write commands", () => {
    expect(def(SETTING_KEY.REVIEW_MODE).writeCommand?.("on")).toBe("/gentle:review-mode enable");
    expect(def(SETTING_KEY.REVIEW_MODE).writeCommand?.("off")).toBe("/gentle:review-mode disable");
    expect(def(SETTING_KEY.PERMISSION_MODE).writeCommand?.("auto")).toBe("/gentle:mode default auto");
    expect(def(SETTING_KEY.TELEMETRY).writeCommand?.("on")).toBe("/gentle:telemetry enable");
    expect(def(SETTING_KEY.YOLO).writeCommand).toBeUndefined();
  });
});

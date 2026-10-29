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
  vim: "vim: off (decided by global file C:/home/vim.json). No active Gentle prompt; preference applies when one starts.",
  animations: "animations: potato (decided by global file C:/home/animations.json). Prompt applies now; startup banner applies at next creation.",
  doubleEsc: "double-esc-cancel: off (decided by built-in default)\nResolution order (first hit wins): global file, env, built-in default off.",
  mode: "Permissions: NORMAL — default: NORMAL",
  modeSuper: "Permissions: AUTO — default: SUPER-YOLO",
  yolo: "YOLO OFF",
  review: "receipt-driven development: on (decided by global)",
  background: "background subagents: on (decided by global file C:/home/b.json; capability: ready)\nResolution order: project file, global file.",
  telemetry: JSON.stringify({ schema: "gentle-ai.telemetry-status/v1", operation: "status", enabled: true, source: "default" }),
};

describe("settings catalog parsers", () => {
  it.each([
    [SETTING_KEY.VIM, REAL.vim, "off"],
    [SETTING_KEY.ANIMATIONS, REAL.animations, "potato"],
    [SETTING_KEY.DOUBLE_ESC_CANCEL, REAL.doubleEsc, "off"],
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
    expect(def(SETTING_KEY.VIM).parse("Ponytail loaded: off")).toBeUndefined();
    expect(def(SETTING_KEY.TELEMETRY).parse("not json")).toBeUndefined();
    expect(def(SETTING_KEY.ANIMATIONS).parse("animations: turbo (decided by x)")).toBeUndefined();
  });

  it("pickValue ignores unrelated startup notifications around the status line", () => {
    const messages = ["Gentle Shell is running inside a Git repository rooted at your home folder", "Ponytail loaded: off", REAL.vim];
    expect(pickValue(def(SETTING_KEY.VIM), messages)).toBe("off");
    expect(pickValue(def(SETTING_KEY.ANIMATIONS), messages)).toBeUndefined();
  });

  it("only exposes allowlisted write commands", () => {
    expect(def(SETTING_KEY.VIM).writeCommand?.("on")).toBe("/gentle:vim enable");
    expect(def(SETTING_KEY.VIM).writeCommand?.("off")).toBe("/gentle:vim disable");
    expect(def(SETTING_KEY.ANIMATIONS).writeCommand?.("quality")).toBe("/gentle:animations quality");
    expect(def(SETTING_KEY.PERMISSION_MODE).writeCommand?.("auto")).toBe("/gentle:mode default auto");
    expect(def(SETTING_KEY.TELEMETRY).writeCommand?.("on")).toBe("/gentle:telemetry enable");
    expect(def(SETTING_KEY.YOLO).writeCommand).toBeUndefined();
  });
});

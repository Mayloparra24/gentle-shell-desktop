import { describe, expect, it } from "vitest";
import { SETTING_KEY } from "@shared/bridge-types";
import { mockBridge, resetMockBridge } from "@renderer/shared/bridge/mockBridge";
import { SECTIONS, SETTING_ROWS } from "./catalog";

describe("Desktop settings catalog", () => {
  it.each(["vim", "animations", "double-esc-cancel"])("does not expose terminal-only %s", async (key) => {
    resetMockBridge();
    expect(Object.values(SETTING_KEY)).not.toContain(key);
    expect(SETTING_ROWS.map((row) => row.key)).not.toContain(key);
    const before = await mockBridge.readSettings();
    expect(before.map((state) => state.key)).not.toContain(key);
    await expect(mockBridge.setSetting(key as never, "on")).rejects.toThrow(`Unknown setting "${key}"`);
    expect(await mockBridge.readSettings()).toEqual(before);
  });
  it("drops Editing but keeps Appearance for the theme", () => {
    expect(SECTIONS).not.toContain("Editing");
    expect(SECTIONS).toContain("Appearance");
  });
});

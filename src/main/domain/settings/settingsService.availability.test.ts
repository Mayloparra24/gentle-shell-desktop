import { describe, expect, it, vi } from "vitest";
import { SETTING_KEY } from "@shared/bridge-types";
import { createSettingsService, type SilentRunner } from "./settingsService";

const statusReply: SilentRunner = async (command) => {
  if (command === "/gentle:review-mode status") return ["receipt-driven development: on (decided by global file x)"];
  return [];
};

describe("settings service across gentle-shell versions", () => {
  it("reports a setting as unavailable, without running anything, when this gentle-shell lacks its command", async () => {
    const run = vi.fn<SilentRunner>(statusReply);
    const service = createSettingsService(run, async () => ["gentle:status"]);

    expect(await service.read(SETTING_KEY.REVIEW_MODE)).toEqual({ key: "review-mode", unavailable: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses to change a setting whose command this gentle-shell does not have", async () => {
    const run = vi.fn<SilentRunner>(statusReply);
    const service = createSettingsService(run, async () => []);

    await expect(service.set(SETTING_KEY.REVIEW_MODE, "off")).rejects.toThrow("does not have the gentle:review-mode command");
    expect(run).not.toHaveBeenCalled();
  });

  it("reads the setting when its command is listed", async () => {
    const service = createSettingsService(statusReply, async () => ["gentle:review-mode"]);

    expect(await service.read(SETTING_KEY.REVIEW_MODE)).toEqual({ key: "review-mode", value: "on" });
  });

  it("lists the commands once for a whole read, not once per setting", async () => {
    const names = vi.fn().mockResolvedValue(["gentle:review-mode"]);

    await createSettingsService(statusReply, names).readAll();

    expect(names).toHaveBeenCalledTimes(1);
  });

  it("still tries a setting when the command list itself cannot be read", async () => {
    const service = createSettingsService(statusReply, async () => {
      throw new Error("no answer");
    });

    expect(await service.read(SETTING_KEY.REVIEW_MODE)).toEqual({ key: "review-mode", value: "on" });
  });

  it("reads an unrecognized status text as unknown instead of guessing a value", async () => {
    const reworded: SilentRunner = async () => ["Receipt-driven development is currently turned off"];
    const service = createSettingsService(reworded, async () => ["gentle:review-mode"]);

    expect(await service.read(SETTING_KEY.REVIEW_MODE)).toEqual({ key: "review-mode", error: "Could not read this setting from gentle-shell" });
  });
});

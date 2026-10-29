import { describe, expect, it, vi } from "vitest";
import { SETTING_KEY } from "@shared/bridge-types";
import { createSettingsService, type SilentRunner } from "./settingsService";

const statusReply: SilentRunner = async (command) => {
  if (command === "/gentle:vim status") return ["vim: on (decided by global file x)"];
  return [];
};

describe("settings service across gentle-shell versions", () => {
  it("reports a setting as unavailable, without running anything, when this gentle-shell lacks its command", async () => {
    const run = vi.fn<SilentRunner>(statusReply);
    const service = createSettingsService(run, async () => ["gentle:status"]);

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", unavailable: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses to change a setting whose command this gentle-shell does not have", async () => {
    const run = vi.fn<SilentRunner>(statusReply);
    const service = createSettingsService(run, async () => []);

    await expect(service.set(SETTING_KEY.VIM, "off")).rejects.toThrow("does not have the gentle:vim command");
    expect(run).not.toHaveBeenCalled();
  });

  it("reads the setting when its command is listed", async () => {
    const service = createSettingsService(statusReply, async () => ["gentle:vim"]);

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", value: "on" });
  });

  it("lists the commands once for a whole read, not once per setting", async () => {
    const names = vi.fn().mockResolvedValue(["gentle:vim"]);

    await createSettingsService(statusReply, names).readAll();

    expect(names).toHaveBeenCalledTimes(1);
  });

  it("still tries a setting when the command list itself cannot be read", async () => {
    const service = createSettingsService(statusReply, async () => {
      throw new Error("no answer");
    });

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", value: "on" });
  });

  it("reads an unrecognized status text as unknown instead of guessing a value", async () => {
    const reworded: SilentRunner = async () => ["Vim prompt editing is currently turned off"];
    const service = createSettingsService(reworded, async () => ["gentle:vim"]);

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", error: "Could not read this setting from gentle-shell" });
  });
});

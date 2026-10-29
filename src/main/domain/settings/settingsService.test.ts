import { describe, expect, it, vi } from "vitest";
import { SETTING_KEY } from "@shared/bridge-types";
import { createSettingsService, type SilentRunner } from "./settingsService";

/** A fake gentle-shell that keeps its own settings and answers like the real one. */
function fakeShell(initial: Record<string, string> = {}) {
  const state: Record<string, string> = { vim: "off", animations: "potato", ...initial };
  const calls: string[] = [];
  const runner: SilentRunner = async (command) => {
    calls.push(command);
    if (command === "/gentle:vim status") return [`vim: ${state.vim} (decided by global file x)`];
    if (command === "/gentle:vim enable") {
      state.vim = "on";
      return [];
    }
    if (command === "/gentle:vim disable") {
      state.vim = "off";
      return [];
    }
    if (command === "/gentle:animations status") return [`animations: ${state.animations} (decided by global file y)`];
    if (command === "/gentle:telemetry enable") return ["telemetry enable refused: opt-out lock is set"];
    if (command === "/gentle:telemetry status") return [JSON.stringify({ enabled: false })];
    if (command === "/gentle:doctor") return ["Doctor: 9 checks passed", "0 problems"];
    if (command === "/gentle:status") return ["el Gentleman package is active"];
    throw new Error(`unexpected command ${command}`);
  };
  return { runner, calls, state };
}

describe("settings service", () => {
  it("reads one setting through its status command", async () => {
    const { runner, calls } = fakeShell();
    const service = createSettingsService(runner);

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", value: "off" });
    expect(calls).toEqual(["/gentle:vim status"]);
  });

  it("reports a setting it cannot read as an error state instead of throwing", async () => {
    const runner: SilentRunner = async () => ["Ponytail loaded: off"];
    const service = createSettingsService(runner);

    expect(await service.read(SETTING_KEY.VIM)).toEqual({ key: "vim", error: "Could not read this setting from gentle-shell" });
  });

  it("reports a runner failure as that setting's error and keeps reading the others", async () => {
    const runner: SilentRunner = async (command) => {
      if (command.startsWith("/gentle:vim")) throw new Error("Timed out waiting for gentle-shell");
      if (command === "/gentle:animations status") return ["animations: quality (decided by global)"];
      return [];
    };
    const states = await createSettingsService(runner).readAll();

    expect(states.find((state) => state.key === "vim")).toEqual({ key: "vim", error: "Timed out waiting for gentle-shell" });
    expect(states.find((state) => state.key === "animations")).toEqual({ key: "animations", value: "quality" });
    expect(states.map((state) => state.key)).toEqual(Object.values(SETTING_KEY));
  });

  it("sets a value, then confirms it by reading the status again", async () => {
    const { runner, calls, state } = fakeShell();
    const service = createSettingsService(runner);

    const result = await service.set(SETTING_KEY.VIM, "on");

    expect(result).toEqual({ key: "vim", value: "on" });
    expect(state.vim).toBe("on");
    expect(calls).toEqual(["/gentle:vim enable", "/gentle:vim status"]);
  });

  it("rejects, with gentle-shell's own words, when the value did not change", async () => {
    const { runner } = fakeShell();

    await expect(createSettingsService(runner).set(SETTING_KEY.TELEMETRY, "on")).rejects.toThrow(
      "gentle-shell did not apply telemetry: telemetry enable refused: opt-out lock is set",
    );
  });

  it("never runs a command for an unknown key, a value outside the allowlist, or a read-only setting", async () => {
    const run = vi.fn<SilentRunner>().mockResolvedValue([]);
    const service = createSettingsService(run);

    await expect(service.set("rm -rf" as never, "on")).rejects.toThrow("Unknown setting");
    await expect(service.set(SETTING_KEY.ANIMATIONS, "turbo")).rejects.toThrow("is not allowed");
    await expect(service.set(SETTING_KEY.YOLO, "on")).rejects.toThrow("read-only");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs only the two diagnostics and joins what gentle-shell printed", async () => {
    const { runner, calls } = fakeShell();
    const service = createSettingsService(runner);
    const blankLine = String.fromCharCode(10, 10);

    expect(await service.diagnostic("doctor")).toBe(["Doctor: 9 checks passed", "0 problems"].join(blankLine));
    expect(await service.diagnostic("status")).toBe("el Gentleman package is active");
    await expect(service.diagnostic("repair" as never)).rejects.toThrow("Unknown diagnostic");
    expect(calls).toEqual(["/gentle:doctor", "/gentle:status"]);
  });
});

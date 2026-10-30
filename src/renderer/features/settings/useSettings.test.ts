// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GentleBridge, SettingState } from "@shared/bridge-types";
import { useSettings } from "./useSettings";

function fake() {
  return { readSettings: vi.fn().mockResolvedValue([{ key: "review-mode", value: "off" }, { key: "yolo", unavailable: true }]), setSetting: vi.fn().mockResolvedValue({ key: "review-mode", value: "on" }) } satisfies Pick<GentleBridge, "readSettings" | "setSetting">;
}

describe("useSettings", () => {
  it("loads values, hides unavailable keys, and retries unknown keys", async () => {
    const bridge = fake();
    let finish!: (states: SettingState[]) => void;
    bridge.readSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useSettings(bridge, 0));
    expect(result.current.rows["review-mode"].loading).toBe(true);
    await act(async () => finish([{ key: "review-mode", error: "unknown status" }, { key: "yolo", unavailable: true }]));
    expect(result.current.rows["review-mode"].error).toBe("unknown status");
    expect(result.current.rows.yolo.unavailable).toBe(true);
    await act(async () => result.current.retry("review-mode"));
    expect(result.current.rows["review-mode"].value).toBe("off");
    expect(result.current.rows.yolo.unavailable).toBe(true);
  });

  it("ignores stale reads from a previous home", async () => {
    const bridge = fake();
    let finish!: (states: SettingState[]) => void;
    bridge.readSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ version }) => useSettings(bridge, version), { initialProps: { version: 0 } });
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.rows["review-mode"].value).toBe("off"));
    await act(async () => finish([{ key: "review-mode", value: "on" }]));
    expect(result.current.rows["review-mode"].value).toBe("off");
  });

  it("ignores a stale whole-read failure after a newer reload succeeds", async () => {
    const bridge = fake();
    let reject!: (cause: Error) => void;
    bridge.readSettings.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const { result } = renderHook(() => useSettings(bridge, 0));
    await act(async () => result.current.reload());
    expect(result.current.rows["review-mode"].value).toBe("off");
    await act(async () => reject(new Error("stale failure")));
    expect(result.current.error).toBeUndefined();
    expect(result.current.rows["review-mode"].value).toBe("off");
  });

  it("expires Applied after a brief confirmation", async () => {
    const bridge = fake();
    const { result } = renderHook(() => useSettings(bridge, 0));
    await waitFor(() => expect(result.current.rows["review-mode"].value).toBe("off"));
    vi.useFakeTimers();
    try {
      await act(async () => result.current.change("review-mode", "on"));
      expect(result.current.rows["review-mode"].applied).toBe(true);
      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.rows["review-mode"].applied).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("reports a whole-read failure once, and recovers", async () => {
    const bridge = fake();
    bridge.readSettings.mockRejectedValueOnce(new Error("no chat"));
    const { result } = renderHook(() => useSettings(bridge, 0));
    await waitFor(() => expect(result.current.error).toBe("no chat"));
    expect(Object.values(result.current.rows).every((row) => !row.loading && !row.value)).toBe(true);
    await act(async () => result.current.reload());
    expect(result.current.error).toBeUndefined();
    expect(result.current.rows["review-mode"].value).toBe("off");
  });

  it("disables pending writes, confirms success and keeps the previous value on failure or unconfirmed writes", async () => {
    const bridge = fake();
    const { result } = renderHook(() => useSettings(bridge, 0));
    await waitFor(() => expect(result.current.rows["review-mode"].value).toBe("off"));
    let finish!: (state: SettingState) => void;
    bridge.setSetting.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { void result.current.change("review-mode", "on"); });
    expect(result.current.rows["review-mode"].pending).toBe(true);
    await act(async () => finish({ key: "review-mode", value: "on" }));
    expect(result.current.rows["review-mode"].applied).toBe(true);
    bridge.setSetting.mockRejectedValueOnce(new Error("denied"));
    await act(async () => result.current.change("review-mode", "off"));
    expect(result.current.rows["review-mode"].value).toBe("on");
    expect(result.current.rows["review-mode"].error).toBe("denied");
    bridge.setSetting.mockResolvedValueOnce({ key: "review-mode", value: "on" });
    await act(async () => result.current.retry("review-mode"));
    expect(result.current.rows["review-mode"].value).toBe("on");
    expect(result.current.rows["review-mode"].applied).toBe(false);
    expect(result.current.rows["review-mode"].error).toBeTruthy();
  });

  it("ignores old reads and writes after home changes; retries a restarting session once", async () => {
    const bridge = fake();
    let finish!: (state: SettingState) => void;
    const { result, rerender } = renderHook(({ version }) => useSettings(bridge, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.rows["review-mode"].value).toBe("off"));
    bridge.setSetting.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { void result.current.change("review-mode", "on"); });
    bridge.readSettings.mockRejectedValueOnce(new Error("no chat"));
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.rows["review-mode"].value).toBe("off"));
    await act(async () => finish({ key: "review-mode", value: "on" }));
    expect(result.current.rows["review-mode"].value).toBe("off");
    expect(bridge.readSettings).toHaveBeenCalledTimes(3);
  });
});

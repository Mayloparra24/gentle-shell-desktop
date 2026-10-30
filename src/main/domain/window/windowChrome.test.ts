import { describe, expect, it } from "vitest";
import { TITLE_BAR_HEIGHT, windowChrome } from "./windowChrome";

describe("windowChrome", () => {
  it("hides the native title bar on every platform", () => {
    for (const platform of ["win32", "linux", "darwin"] as const) {
      expect(windowChrome(platform).titleBarStyle).toBe("hidden");
    }
  });

  it("paints the native window controls with the theme colors on Windows and Linux", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(windowChrome(platform).titleBarOverlay).toEqual({ color: "#100a0f", symbolColor: "#d2cbd0", height: TITLE_BAR_HEIGHT });
    }
  });

  it("keeps the macOS traffic lights vertically centered in the bar and adds no overlay", () => {
    const chrome = windowChrome("darwin");
    expect(chrome.titleBarOverlay).toBeUndefined();
    expect(chrome.trafficLightPosition).toEqual({ x: 14, y: (TITLE_BAR_HEIGHT - 12) / 2 });
  });

  it("uses the colors it is given for the overlay", () => {
    expect(windowChrome("win32", { color: "#0d0f14", symbolColor: "#a3b5d6" }).titleBarOverlay).toEqual({
      color: "#0d0f14",
      symbolColor: "#a3b5d6",
      height: TITLE_BAR_HEIGHT,
    });
  });

  it("matches the 36 px bar of the design", () => {
    expect(TITLE_BAR_HEIGHT).toBe(36);
  });
});

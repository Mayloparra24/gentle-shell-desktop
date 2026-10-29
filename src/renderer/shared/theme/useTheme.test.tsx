// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { THEME_STORAGE_KEY, applyStoredTheme, useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to Gentleman-Cute", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.themeId).toBe("gentleman-cute");
    expect(document.documentElement.dataset.theme).toBe("gentleman-cute");
  });

  it("applies and persists the chosen theme", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme("gentle"));

    expect(document.documentElement.dataset.theme).toBe("gentle");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("gentle");
  });

  it("restores the saved theme and ignores unknown values", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "gentleman-sexy");
    expect(renderHook(() => useTheme()).result.current.themeId).toBe("gentleman-sexy");

    window.localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(renderHook(() => useTheme()).result.current.themeId).toBe("gentleman-cute");
  });

  it("applyStoredTheme sets the attribute before React renders", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "gentle");
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe("gentle");
  });
});

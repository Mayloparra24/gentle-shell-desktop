// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SHELL_LAYOUT_STORAGE_KEY, useShellLayout } from "./useShellLayout";

describe("useShellLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with both panels open", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.leftOpen).toBe(true);
    expect(result.current.rightOpen).toBe(true);
  });

  it("toggles each panel independently", () => {
    const { result } = renderHook(() => useShellLayout());

    act(() => result.current.toggleLeft());
    expect(result.current.leftOpen).toBe(false);
    expect(result.current.rightOpen).toBe(true);

    act(() => result.current.toggleRight());
    expect(result.current.rightOpen).toBe(false);

    act(() => result.current.toggleLeft());
    expect(result.current.leftOpen).toBe(true);
  });

  it("restores the saved choice on the next mount", () => {
    const first = renderHook(() => useShellLayout());
    act(() => first.result.current.toggleRight());
    first.unmount();

    const second = renderHook(() => useShellLayout());
    expect(second.result.current.leftOpen).toBe(true);
    expect(second.result.current.rightOpen).toBe(false);
  });

  it("falls back to both open when the saved value is corrupt", () => {
    window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.leftOpen).toBe(true);
    expect(result.current.rightOpen).toBe(true);
  });
});

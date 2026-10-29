import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "./themes";

export const THEME_STORAGE_KEY = "gentle.theme";

function readStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
  } catch {
    // Unavailable storage must never stop the app from rendering.
    return DEFAULT_THEME_ID;
  }
}

function applyTheme(themeId: ThemeId): void {
  document.documentElement.dataset.theme = themeId;
}

/** Sets the saved theme on <html> before React renders, so the first paint is not the default theme. */
export function applyStoredTheme(): void {
  applyTheme(readStoredTheme());
}

/** The active theme: applied to <html data-theme> and persisted when changed. */
export function useTheme() {
  const [themeId, setThemeId] = useState<ThemeId>(readStoredTheme);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeId(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort.
    }
  }, []);

  return { themeId, setTheme };
}

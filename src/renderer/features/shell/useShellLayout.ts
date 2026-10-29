import { useCallback, useEffect, useState } from "react";

export const SHELL_LAYOUT_STORAGE_KEY = "gentle.shell.layout";

interface ShellLayout {
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
}

const DEFAULT_LAYOUT: ShellLayout = { leftOpen: true, rightOpen: true };

function readLayout(): ShellLayout {
  try {
    const raw = window.localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY);
    if (raw === null) return DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_LAYOUT;
    const { leftOpen, rightOpen } = parsed as Record<string, unknown>;
    return {
      leftOpen: typeof leftOpen === "boolean" ? leftOpen : DEFAULT_LAYOUT.leftOpen,
      rightOpen: typeof rightOpen === "boolean" ? rightOpen : DEFAULT_LAYOUT.rightOpen,
    };
  } catch {
    // Corrupt or unavailable storage must never stop the shell from rendering.
    return DEFAULT_LAYOUT;
  }
}

/**
 * Which side panels are visible. Persisted so a reload keeps the user's
 * choice; both panels start open. Hiding a panel only changes layout — the
 * containers inside stay mounted so chats and state are not reloaded.
 */
export function useShellLayout() {
  const [layout, setLayout] = useState<ShellLayout>(readLayout);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Persistence is best-effort.
    }
  }, [layout]);

  const toggleLeft = useCallback(() => setLayout((current) => ({ ...current, leftOpen: !current.leftOpen })), []);
  const toggleRight = useCallback(() => setLayout((current) => ({ ...current, rightOpen: !current.rightOpen })), []);

  return { leftOpen: layout.leftOpen, rightOpen: layout.rightOpen, toggleLeft, toggleRight };
}

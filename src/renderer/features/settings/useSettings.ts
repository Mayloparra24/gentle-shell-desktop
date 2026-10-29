import { useCallback, useEffect, useRef, useState } from "react";
import { SETTING_KEY, type GentleBridge, type SettingKey, type SettingState } from "@shared/bridge-types";

export interface SettingsRowState extends SettingState {
  loading: boolean;
  pending?: boolean;
  applied?: boolean;
}
export type SettingsRows = Record<SettingKey, SettingsRowState>;
const KEYS = Object.values(SETTING_KEY);
function initialRows(): SettingsRows {
  return Object.fromEntries(KEYS.map((key) => [key, { key, loading: true }])) as SettingsRows;
}
export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
function fromRead(key: SettingKey, states: SettingState[]): SettingsRowState {
  const state = states.find((item) => item.key === key);
  return { ...(state ?? { key, error: "No current value returned" }), loading: false, applied: false, pending: false };
}

/** A mounted dialog owns one generation; a home reset invalidates every outstanding operation. */
export function useSettings(bridge: Pick<GentleBridge, "readSettings" | "setSetting">, homeVersion: number) {
  const [rows, setRows] = useState<SettingsRows>(initialRows);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const requests = useRef<Partial<Record<SettingKey, number>>>({});
  const failedWrites = useRef<Partial<Record<SettingKey, string>>>({});
  const timers = useRef<Partial<Record<SettingKey, ReturnType<typeof setTimeout>>>>({});

  const read = useCallback(async (key?: SettingKey, retryAfterReset = false) => {
    const epoch = generation.current;
    const keys = key ? [key] : KEYS;
    const tokens = Object.fromEntries(keys.map((item) => [item, requests.current[item] = (requests.current[item] ?? 0) + 1]));
    setRows((previous) => {
      const next = { ...previous };
      keys.forEach((item) => { next[item] = { ...previous[item], loading: true, error: undefined, applied: false }; });
      return next;
    });
    if (!key) setError(undefined);
    try {
      let states: SettingState[];
      try { states = await bridge.readSettings(); }
      catch (cause) {
        if (!retryAfterReset || generation.current !== epoch) throw cause;
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        if (generation.current !== epoch) return;
        states = await bridge.readSettings();
      }
      if (generation.current !== epoch) return;
      setRows((previous) => {
        const next = { ...previous };
        keys.forEach((item) => {
          if (requests.current[item] === tokens[item]) next[item] = fromRead(item, states);
        });
        return next;
      });
    } catch (cause) {
      if (generation.current !== epoch) return;
      if (!key && keys.some((item) => requests.current[item] === tokens[item])) setError(errorText(cause));
      setRows((previous) => {
        const next = { ...previous };
        keys.forEach((item) => {
          if (requests.current[item] === tokens[item]) next[item] = { key: item, loading: false, error: key ? errorText(cause) : undefined };
        });
        return next;
      });
    }
  }, [bridge]);

  useEffect(() => {
    generation.current += 1;
    requests.current = {};
    failedWrites.current = {};
    setRows(initialRows());
    void read(undefined, homeVersion > 0);
    return () => {
      generation.current += 1;
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [read, homeVersion]);

  const change = useCallback(async (key: SettingKey, value: string) => {
    const epoch = generation.current;
    const token = requests.current[key] = (requests.current[key] ?? 0) + 1;
    clearTimeout(timers.current[key]);
    setRows((previous) => ({ ...previous, [key]: { ...previous[key], pending: true, applied: false, error: undefined } }));
    try {
      const confirmed = await bridge.setSetting(key, value);
      if (generation.current !== epoch || requests.current[key] !== token) return;
      if (confirmed.key !== key || confirmed.value !== value || confirmed.error || confirmed.unavailable) {
        throw new Error(confirmed.error ?? "Change was not confirmed. Nothing was changed.");
      }
      delete failedWrites.current[key];
      setRows((previous) => ({ ...previous, [key]: { ...confirmed, loading: false, pending: false, applied: true } }));
      timers.current[key] = setTimeout(() => {
        if (generation.current === epoch && requests.current[key] === token) {
          setRows((previous) => ({ ...previous, [key]: { ...previous[key], applied: false } }));
        }
      }, 1800);
    } catch (cause) {
      if (generation.current !== epoch || requests.current[key] !== token) return;
      failedWrites.current[key] = value;
      setRows((previous) => ({ ...previous, [key]: { ...previous[key], pending: false, applied: false, error: errorText(cause) } }));
    }
  }, [bridge]);

  const retry = useCallback((key: SettingKey) => {
    const value = failedWrites.current[key];
    return value === undefined ? read(key) : change(key, value);
  }, [read, change]);
  const reload = useCallback(() => read(), [read]);
  return { rows, error, change, retry, reload };
}

// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SlashCommand } from "@shared/bridge-types";
import { useSlashCommands } from "./useSlashCommands";

const commands: SlashCommand[] = [{ name: "commit-message", source: "prompt" }];

describe("useSlashCommands", () => {
  it("loads only on demand, caches, and reloads after a chat reset", async () => {
    const load = vi.fn().mockResolvedValue(commands);
    const { result, rerender } = renderHook(({ key }) => useSlashCommands(load, key), { initialProps: { key: 1 } });
    expect(result.current.status).toBe("idle");
    expect(load).not.toHaveBeenCalled();
    act(() => { result.current.ensureLoaded(); result.current.ensureLoaded(); });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.commands).toEqual(commands);
    act(() => result.current.ensureLoaded());
    expect(load).toHaveBeenCalledTimes(1);
    rerender({ key: 2 });
    expect(result.current.commands).toEqual([]);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
  it("reports errors without throwing", async () => {
    const { result } = renderHook(() => useSlashCommands(() => Promise.reject(new Error("offline")), 1));
    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("offline");
    expect(result.current.commands).toEqual([]);
  });
  it("ignores stale results from the previous chat", async () => {
    let resolveOld!: (value: SlashCommand[]) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<SlashCommand[]>((resolve) => { resolveOld = resolve; })).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ key }) => useSlashCommands(load, key), { initialProps: { key: 1 } });
    act(() => result.current.ensureLoaded());
    rerender({ key: 2 });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => resolveOld(commands));
    expect(result.current.commands).toEqual([]);
  });
});

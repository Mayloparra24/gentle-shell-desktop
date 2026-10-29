// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CHAT_STATE, type ChatSummary } from "@shared/bridge-types";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import { FolderDialog } from "./FolderDialog";

afterEach(() => vi.restoreAllMocks());
const chat = (id: string, cwd: string, day: number): ChatSummary => ({ id, cwd, title: id, updatedAt: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, messageCount: 1, state: CHAT_STATE.IDLE });

function mount() {
  const onClose = vi.fn();
  const onStarted = vi.fn();
  const result = render(<FolderDialog onClose={onClose} onStarted={onStarted} />);
  return { ...result, onClose, onStarted };
}

describe("FolderDialog", () => {
  it("deduplicates recent folders by latest usage, sorts descending and caps at eight", async () => {
    const chats = Array.from({ length: 10 }, (_, i) => chat(`chat-${i}`, `/projects/folder-${i}`, i + 1));
    chats.push(chat("newest-duplicate", "/projects/folder-2", 20));
    vi.spyOn(mockBridge, "listChats").mockResolvedValue(chats);
    const start = vi.spyOn(mockBridge, "startChat").mockResolvedValue({ status: "cancelled" });
    mount();
    const list = await screen.findByRole("list", { name: "Recent folders" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(8);
    expect(rows.map(row => row.textContent)).toEqual([2, 9, 8, 7, 6, 5, 4, 3].map(i => `folder-${i}/projects/folder-${i}`));
    fireEvent.click(rows[0]!);
    await waitFor(() => expect(start).toHaveBeenCalledExactlyOnceWith({ source: "fromChat", id: "newest-duplicate" }));
  });
  it("shows a stale-folder error without closing or starting another chat", async () => {
    vi.spyOn(mockBridge, "listChats").mockResolvedValue([chat("stored-id", "/gone", 1)]);
    const start = vi.spyOn(mockBridge, "startChat").mockResolvedValue({ status: "error", message: "That folder no longer exists." });
    const { onClose, onStarted } = mount();
    fireEvent.click(await screen.findByRole("button", { name: /gone/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That folder no longer exists.");
    expect(start).toHaveBeenCalledExactlyOnceWith({ source: "fromChat", id: "stored-id" });
    expect(onClose).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
  });
  it("Browse cancellation returns to the modal, choosing starts once", async () => {
    vi.spyOn(mockBridge, "listChats").mockResolvedValue([]);
    const state = await mockBridge.newChat();
    const start = vi.spyOn(mockBridge, "startChat").mockResolvedValueOnce({ status: "cancelled" }).mockResolvedValue({ status: "chosen", chat: state });
    const { onStarted, onClose } = mount();
    expect(await screen.findByText("No recent folders yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(start).toHaveBeenCalledExactlyOnceWith({ source: "browse" }));
    expect(onStarted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Choose a folder" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Browse…" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledExactlyOnceWith(state));
    expect(start).toHaveBeenCalledTimes(2);
  });
  it("traps focus, Cancel and Escape start nothing, and restores trigger focus", async () => {
    vi.spyOn(mockBridge, "listChats").mockResolvedValue([]);
    const start = vi.spyOn(mockBridge, "startChat");
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { onClose, unmount } = mount();
    const dialog = screen.getByRole("dialog", { name: "Choose a folder" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const browse = screen.getByRole("button", { name: "Browse…" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(browse).toHaveFocus();
    fireEvent.keyDown(browse, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(browse).toHaveFocus();
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

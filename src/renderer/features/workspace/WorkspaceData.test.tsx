// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirectoryListing, GitSummary } from "@shared/bridge-types";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import { WorkspacePanel } from "./WorkspacePanel";

afterEach(() => { vi.restoreAllMocks(); delete window.gentle; });
function panel(chatId = "a") { return <WorkspacePanel chatId={chatId} />; }
function tab(name: string) { fireEvent.click(screen.getByRole("tab", { name })); }

describe("live workspace", () => {
  it("loads, orders directories first, humanizes sizes and expands only allowed directories", async () => {
    let resolve!: (value: DirectoryListing) => void;
    const list = vi.spyOn(mockBridge, "listDirectory").mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockImplementation(async path => ({ status: "ready", truncated: false, entries: path === "src" ? [{ name: "nested", kind: "directory" }] : [{ name: "leaf.ts", kind: "file", size: 0 }] }));
    render(panel()); tab("Files");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => resolve({ status: "ready", truncated: true, entries: [
      { name: "README.md", kind: "file", size: 1280 }, { name: "src", kind: "directory" },
      { name: ".git", kind: "directory" }, { name: "node_modules", kind: "directory" },
    ] }));
    expect(list).toHaveBeenCalledWith("");
    expect(screen.getByText("1.3 KB")).toBeInTheDocument();
    expect(screen.getByText("Showing the first 500 entries")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Files" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("src"); expect(rows[3]).toHaveTextContent("README.md");
    for (const name of [".git", "node_modules"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "README.md" })).not.toHaveAttribute("aria-expanded");
    const src = screen.getByRole("button", { name: "src" });
    expect(src).toHaveAttribute("aria-expanded", "false"); src.focus(); expect(src).toHaveFocus();
    fireEvent.click(src);
    const nested = await screen.findByRole("button", { name: "nested" });
    expect(src).toHaveAttribute("aria-expanded", "true"); fireEvent.click(nested);
    expect(await screen.findByText("leaf.ts")).toBeInTheDocument();
    expect(list.mock.calls.map(c => c[0])).toEqual(["", "src", "src/nested"]);
    fireEvent.click(src); expect(screen.queryByText("leaf.ts")).not.toBeInTheDocument();
    fireEvent.click(src); expect(await screen.findByText("leaf.ts")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(3);
  });

  it.each<DirectoryListing>([{ status: "no-chat-folder" }, { status: "error", message: "Cannot read folder" }, { status: "ready", entries: [], truncated: false }])("Files state $status", async result => {
    const list = vi.spyOn(mockBridge, "listDirectory").mockResolvedValue(result);
    render(panel()); tab("Files");
    const message = result.status === "no-chat-folder" ? "Choose a folder to see its files." : result.status === "error" ? result.message : "This folder is empty.";
    expect(await screen.findByText(message)).toBeInTheDocument();
    if (result.status === "error") { fireEvent.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => expect(list).toHaveBeenCalledTimes(2)); }
  });

  it.each<GitSummary>([{ status: "no-chat-folder" }, { status: "not-a-repository" }, { status: "git-unavailable" }, { status: "error", message: "Cannot read Git" }])("Git state $status", async result => {
    const git = vi.spyOn(mockBridge, "gitSummary").mockResolvedValue(result);
    render(panel()); tab("Git");
    const messages = { "no-chat-folder": "Choose a folder to see its Git status.", "not-a-repository": "This folder is not a Git repository.", "git-unavailable": "Git is not installed or not on PATH." };
    expect(await screen.findByText(result.status === "error" ? result.message : messages[result.status as keyof typeof messages])).toBeInTheDocument();
    if (result.status === "error") { fireEvent.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => expect(git).toHaveBeenCalledTimes(2)); }
  });

  it("shows Git loading, branch, plain statuses, commits and refreshes without mutation actions", async () => {
    let resolve!: (value: GitSummary) => void;
    const git = vi.spyOn(mockBridge, "gitSummary").mockImplementation(() => new Promise(r => { resolve = r; }));
    render(panel()); tab("Git"); expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => resolve({ status: "ready", branch: "live-branch", truncatedChanges: true,
      changed: [" M", "A ", " D", "R ", "??", "AM"].map((code, i) => ({ code, path: `file-${i}` })),
      commits: [{ hash: "abcdef123456", subject: "Real commit", relativeTime: "3 hours ago" }] }));
    expect(screen.getByText("live-branch")).toBeInTheDocument();
    for (const [letter, word] of [["M", "modified"], ["A", "added"], ["D", "deleted"], ["R", "renamed"], ["U", "untracked"], ["M", "added, modified"]]) expect(screen.getByTitle(word!)).toHaveTextContent(letter!);
    for (const text of ["abcdef1", "Real commit", "3 hours ago", "Showing the first 500 changes"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stage|commit|push|pull|sync/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(git).toHaveBeenCalledTimes(2);
  });

  it("refreshes Git after apply and keeps the outcome across the loading state", async () => {
    const summary: GitSummary = { status: "ready", contextId: "live", branch: "main", changed: [{ path: "live.ts", code: " M" }], commits: [], truncatedChanges: false };
    let finishRefresh!: (value: GitSummary) => void;
    const git = vi.spyOn(mockBridge, "gitSummary").mockResolvedValueOnce(summary).mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
    const plan = vi.spyOn(mockBridge, "gitPlan").mockResolvedValue({ planId: "live-plan", kind: "stage", repository: "/repo", branch: "main", files: [], summary: "Stage", needsTrust: false, expiresAt: Date.now() + 10000 });
    const apply = vi.spyOn(mockBridge, "gitApply").mockResolvedValue({ kind: "stage", status: "success", pulled: false, pushed: false, message: "Staged" });
    render(panel()); tab("Git");
    fireEvent.click(await screen.findByRole("button", { name: "Stage live.ts" }));
    await waitFor(() => expect(git).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("stage completed.");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => finishRefresh(summary));
    expect(screen.getByRole("status")).toHaveTextContent("stage completed.");
    expect(plan).toHaveBeenCalledWith("live", { kind: "stage", path: "live.ts" }); expect(apply).toHaveBeenCalledTimes(1);
  });

  it("unmounts pending Git actions when switching tabs", async () => {
    vi.spyOn(mockBridge, "gitSummary").mockResolvedValue({ status: "ready", contextId: "live", branch: "main", changed: [], commits: [], truncatedChanges: false });
    let resolve!: (value: Awaited<ReturnType<typeof mockBridge.gitPlan>>) => void;
    vi.spyOn(mockBridge, "gitPlan").mockImplementation(() => new Promise(r => { resolve = r; }));
    const apply = vi.spyOn(mockBridge, "gitApply");
    render(panel()); tab("Git");
    fireEvent.click(await screen.findByRole("button", { name: "Push" }));
    tab("Files");
    await act(async () => resolve({ planId: "late", kind: "push", repository: "/repo", branch: "main", files: [], summary: "Push", needsTrust: false, expiresAt: Date.now() + 10000 }));
    tab("Git");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(apply).not.toHaveBeenCalled();
  });

  it("refetches both tabs on chat change and discards late results", async () => {
    let resolve!: (value: DirectoryListing) => void;
    const list = vi.spyOn(mockBridge, "listDirectory").mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValue({ status: "ready", truncated: false, entries: [{ name: "new.txt", kind: "file", size: 1 }] });
    const git = vi.spyOn(mockBridge, "gitSummary");
    const view = render(panel()); tab("Files"); view.rerender(panel("b"));
    expect(await screen.findByText("new.txt")).toBeInTheDocument();
    await act(async () => resolve({ status: "ready", truncated: false, entries: [{ name: "stale.txt", kind: "file" }] }));
    expect(screen.queryByText("stale.txt")).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2); expect(git).toHaveBeenCalledTimes(2);
  });

  it("uses the real bridge rather than preview samples", async () => {
    window.gentle = { ...mockBridge, listDirectory: vi.fn().mockResolvedValue({ status: "ready", entries: [{ name: "real.txt", kind: "file", size: 20 }], truncated: false }) };
    render(panel()); tab("Files"); expect(await screen.findByText("real.txt")).toBeInTheDocument();
    expect(screen.queryByText("package.json")).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import type { GitWritePlan } from "@shared/git-write-types";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); delete window.gentle; });
const ready = { status: "ready" as const, contextId: "chat-a", branch: "feature", changed: [{ path: "partial.ts", code: "MM" }, { path: "new.ts", code: "??" }], truncatedChanges: true, commits: [] };
const plan: GitWritePlan = { planId: "p1", kind: "stage", repository: "/canonical/repo", branch: "feature", files: [{ path: "partial.ts", code: "MM" }], summary: "Stage file", needsTrust: false, expiresAt: Date.now() + 120000 };
function setup() {
  const bridge = { ...mockBridge, gitPlan: vi.fn().mockResolvedValue(plan), gitTrust: vi.fn().mockResolvedValue(undefined), gitApply: vi.fn().mockResolvedValue({ kind: "stage", status: "success", pulled: false, pushed: false, message: "Done" }) };
  window.gentle = bridge;
  const refresh = vi.fn();
  const view = render(<GitTab git={ready} onRefresh={refresh} />);
  return { bridge, refresh, ...view };
}
import { GitTab } from "./GitTab";

describe("GitTab", () => {
  it("groups XY paths and stages or unstages one file with captured context", async () => {
    const { bridge, refresh } = setup();
    expect(within(screen.getByRole("list", { name: "Staged changes" })).getByText("partial.ts")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Unstaged changes" })).getByText("partial.ts")).toBeInTheDocument();
    expect(screen.getByText("Showing the first 500 changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledWith("chat-a", "p1"));
    expect(bridge.gitPlan).toHaveBeenCalledWith("chat-a", { kind: "stage", path: "new.ts" });
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Unstage partial.ts" }));
    await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledTimes(2));
    expect(bridge.gitPlan).toHaveBeenLastCalledWith("chat-a", { kind: "unstage", path: "partial.ts" });
  });

  it("cancels trust without writes, then trusts only and replans before apply", async () => {
    const { bridge } = setup();
    bridge.gitPlan.mockResolvedValue({ ...plan, needsTrust: true });
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    const dialog = await screen.findByRole("dialog", { name: "Trust repository for this session?" });
    expect(dialog).toHaveTextContent("/canonical/repo");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(bridge.gitTrust).not.toHaveBeenCalled(); expect(bridge.gitApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    await screen.findByRole("dialog");
    bridge.gitPlan.mockResolvedValue(plan);
    const accept = screen.getByRole("button", { name: "Trust for this session" });
    fireEvent.click(accept); fireEvent.click(accept);
    await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledTimes(1));
    expect(bridge.gitTrust).toHaveBeenCalledTimes(1); expect(bridge.gitPlan).toHaveBeenCalledTimes(3);
  });

  it.each(["commit", "push", "pull", "sync"] as const)("confirms fresh %s details and prevents duplicate apply", async kind => {
    const { bridge } = setup();
    bridge.gitPlan.mockResolvedValue({ ...plan, kind, message: kind === "commit" ? "<fix>" : undefined, remote: { name: "origin", destination: "refs/heads/main", pullUrl: "https://host/fetch", pushUrl: "https://host/push" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), { target: { value: "<fix>" } });
    fireEvent.click(screen.getByRole("button", { name: kind === "commit" ? "Commit staged" : kind[0]!.toUpperCase() + kind.slice(1) }));
    const dialog = await screen.findByRole("dialog", { name: `Confirm ${kind}` });
    expect(dialog).toHaveTextContent("/canonical/repo"); expect(dialog).toHaveTextContent("feature");
    expect(dialog).toHaveTextContent(kind === "commit" ? "<fix>" : "refs/heads/main");
    expect(bridge.gitApply).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledTimes(1));
    if (kind === "commit") expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it.each(["partial", "failure"])("refreshes after %s without retry or clearing the draft", async outcome => {
    const { bridge, refresh } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep me" } });
    bridge.gitPlan.mockResolvedValue({ ...plan, kind: "sync" });
    if (outcome === "partial") bridge.gitApply.mockResolvedValue({ kind: "sync", status: "partial", pulled: true, pushed: false, message: "Push failed" });
    else bridge.gitApply.mockRejectedValue(new Error("secret raw diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(outcome === "partial" ? "Sync partially completed" : "Git operation failed");
    expect(screen.queryByText(/secret raw/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("keep me"); expect(bridge.gitApply).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate a running apply with manual refresh", async () => {
    const { bridge, refresh } = setup();
    let finish!: () => void;
    bridge.gitApply.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ kind: "stage", status: "success", pulled: false, pushed: false, message: "Done" }); }));
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(refresh).toHaveBeenCalledTimes(1); expect(screen.getByRole("status")).toHaveTextContent("stage completed.");
  });

  it("requires staged files and a nonblank message for commit", () => {
    const { rerender, bridge } = setup();
    expect(screen.getByRole("button", { name: "Commit staged" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Commit staged" })).toBeDisabled();
    rerender(<GitTab git={{ ...ready, changed: [{ path: "new.ts", code: "??" }] }} onRefresh={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "message" } });
    expect(screen.getByRole("button", { name: "Commit staged" })).toBeDisabled();
    expect(bridge.gitPlan).not.toHaveBeenCalled();
  });

  it("replans a trusted commit and still requires the new confirmation", async () => {
    const { bridge } = setup();
    bridge.gitPlan.mockResolvedValueOnce({ ...plan, needsTrust: true, kind: "commit" }).mockResolvedValue({ ...plan, planId: "fresh", kind: "commit", message: "draft" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trust for this session" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm commit" });
    expect(dialog).toHaveTextContent("partial.ts");
    expect(bridge.gitApply).not.toHaveBeenCalled();
    expect(bridge.gitPlan).toHaveBeenLastCalledWith("chat-a", { kind: "commit", message: "draft" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox")).toHaveValue("draft"); expect(bridge.gitApply).not.toHaveBeenCalled();
  });

  it("keeps a failed commit draft without retrying", async () => {
    const { bridge, refresh } = setup();
    bridge.gitPlan.mockResolvedValue({ ...plan, kind: "commit", message: "draft" });
    bridge.gitApply.mockRejectedValue(new Error("raw error"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox")).toHaveValue("draft"); expect(bridge.gitApply).toHaveBeenCalledTimes(1);
  });

  it.each(["trust", "apply"])("ignores a late %s completion after context change", async phase => {
    const { bridge, rerender, refresh } = setup();
    let finish!: () => void;
    if (phase === "trust") {
      bridge.gitPlan.mockResolvedValue({ ...plan, needsTrust: true });
      bridge.gitTrust.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    } else bridge.gitApply.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ kind: "stage", status: "success", pulled: false, pushed: false, message: "Done" }); }));
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    if (phase === "trust") fireEvent.click(await screen.findByRole("button", { name: "Trust for this session" }));
    else await waitFor(() => expect(bridge.gitApply).toHaveBeenCalledTimes(1));
    rerender(<GitTab git={{ ...ready, contextId: "chat-b" }} onRefresh={refresh} />);
    await act(async () => finish());
    expect(refresh).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(bridge.gitPlan).toHaveBeenCalledTimes(1);
    if (phase === "trust") expect(bridge.gitApply).not.toHaveBeenCalled();
  });

  it.each(["context", "refresh"])("invalidates an open confirmation on %s", async change => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    await screen.findByRole("dialog");
    if (change === "context") rerender(<GitTab git={{ ...ready, contextId: "chat-b" }} onRefresh={() => {}} />);
    else fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores focus to the action after cancelling confirmation", async () => {
    setup();
    const push = screen.getByRole("button", { name: "Push" });
    push.focus(); fireEvent.click(push);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(push).toHaveFocus());
  });

  it.each(["context", "unmount", "refresh"])("discards pending plans after %s", async change => {
    const { bridge, rerender, unmount } = setup();
    let resolve!: (value: GitWritePlan) => void;
    bridge.gitPlan.mockImplementation(() => new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Stage new.ts" }));
    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
    if (change === "unmount") unmount();
    else if (change === "context") rerender(<GitTab git={{ ...ready, contextId: "chat-b" }} onRefresh={() => {}} />);
    else fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => resolve(plan));
    expect(bridge.gitApply).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves the branch and changed-path list as read-only data", () => {
    render(<GitTab git={{ status: "ready", branch: "feature", changed: [{ path: "lib/links.ts", code: " M" }], truncatedChanges: false, commits: [] }} onRefresh={() => {}} />);
    expect(screen.getByText("feature")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes · 1" })).toBeInTheDocument();
    expect(screen.getByText("links.ts")).toBeInTheDocument();
    expect(screen.getByText("lib")).toBeInTheDocument();
    expect(screen.getByText("M")).toHaveAttribute("title", "modified");
    expect(screen.getByText("No commits yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stage|commit|push|pull|sync/i })).not.toBeInTheDocument();
  });
});

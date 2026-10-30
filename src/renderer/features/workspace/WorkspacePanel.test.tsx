// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import { WorkspacePanel } from "./WorkspacePanel";

afterEach(() => { delete window.gentle; });
describe("WorkspacePanel", () => {
  it("defaults to Files and exposes exactly Files and Git with one selected panel", () => {
    render(<WorkspacePanel />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Files", "Git"]);
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Files", "Git"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
      expect(screen.getByRole("tabpanel")).toHaveAccessibleName(name);
    }
    expect(screen.queryByText("Sample data · not connected yet")).not.toBeInTheDocument();
    expect(screen.getByText("Preview data")).toBeInTheDocument();
  });
  it("shows the change count only for ready Git with changes, retaining exact tab names", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof mockBridge.gitSummary>>) => void;
    window.gentle = { ...mockBridge, gitSummary: vi.fn(() => new Promise<Awaited<ReturnType<typeof mockBridge.gitSummary>>>(done => { resolve = done; })) };
    render(<WorkspacePanel />);
    const git = screen.getByRole("tab", { name: "Git" });
    expect(git).not.toHaveTextContent("1");
    resolve({ status: "ready", branch: "main", changed: [{ path: "src/app.ts", code: " M" }], commits: [], truncatedChanges: false });
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(git).toHaveAccessibleName("Git");
  });
  it("uses the supplied folder name without changing tab names", async () => {
    render(<WorkspacePanel cwd="C:\\work\\project" />);
    expect(await screen.findByText("project")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
  });
  it("omits the count for clean and unavailable Git", async () => {
    window.gentle = { ...mockBridge, gitSummary: vi.fn().mockResolvedValue({ status: "ready", branch: "main", changed: [], commits: [], truncatedChanges: false }) };
    const { unmount } = render(<WorkspacePanel />);
    fireEvent.click(screen.getByRole("tab", { name: "Git" }));
    await screen.findByText("No changes.");
    expect(screen.getByRole("tab", { name: "Git" })).toHaveTextContent(/^Git$/);
    unmount();
    window.gentle = { ...mockBridge, gitSummary: vi.fn().mockResolvedValue({ status: "git-unavailable" }) };
    render(<WorkspacePanel />);
    fireEvent.click(screen.getByRole("tab", { name: "Git" }));
    await screen.findByText("Git is not installed or not on PATH.");
    expect(screen.getByRole("tab", { name: "Git" })).toHaveTextContent(/^Git$/);
  });
  it("preserves arrows, wraparound, Home and End navigation", () => {
    render(<WorkspacePanel />);
    const files = screen.getByRole("tab", { name: "Files" });
    const git = screen.getByRole("tab", { name: "Git" });
    fireEvent.keyDown(files, { key: "ArrowRight" }); expect(git).toHaveFocus();
    fireEvent.keyDown(git, { key: "ArrowRight" }); expect(files).toHaveFocus();
    fireEvent.keyDown(files, { key: "ArrowLeft" }); expect(git).toHaveFocus();
    fireEvent.keyDown(git, { key: "Home" }); expect(files).toHaveFocus();
    fireEvent.keyDown(files, { key: "End" });
    expect(git).toHaveFocus(); expect(git).toHaveAttribute("aria-selected", "true");
  });
  it("does not label the real bridge as preview", () => {
    window.gentle = { ...mockBridge };
    render(<WorkspacePanel />);
    expect(screen.queryByText("Preview data")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sample data/)).not.toBeInTheDocument();
  });
});

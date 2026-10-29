// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

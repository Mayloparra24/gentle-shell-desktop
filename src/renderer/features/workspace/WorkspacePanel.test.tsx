// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspacePanel } from "./WorkspacePanel";
import { PREVIEW_WORKSPACE } from "./preview";

describe("WorkspacePanel", () => {
  it("defaults to ODD and exposes only the selected panel", () => {
    render(<WorkspacePanel snapshot={PREVIEW_WORKSPACE} />);
    expect(screen.getByRole("tab", { name: "ODD" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("ODD");
    for (const name of ["Files", "Git", "ODD"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
      expect(screen.getByRole("tabpanel")).toHaveAccessibleName(name);
    }
    expect(screen.getByText("Sample data · not connected yet")).toBeInTheDocument();
  });

  it("supports arrow, Home and End keyboard navigation", () => {
    render(<WorkspacePanel snapshot={PREVIEW_WORKSPACE} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "ODD" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Git" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Git" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Files" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Files" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Git" })).toHaveAttribute("aria-selected", "true");
  });
});

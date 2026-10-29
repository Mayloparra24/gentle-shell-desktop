// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";

function renderBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const props = {
    title: "Add login with magic link",
    leftOpen: true,
    rightOpen: true,
    onToggleLeft: vi.fn(),
    onToggleRight: vi.fn(),
    ...overrides,
  };
  render(<TopBar {...props} />);
  return props;
}

describe("TopBar", () => {
  it("opens settings from the labelled gear", () => {
    const onOpenSettings = vi.fn();
    renderBar({ onOpenSettings });
    const button = screen.getByRole("button", { name: "Settings" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(button);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("draws the settings icon as a cog: a hub circle inside a toothed outline", () => {
    renderBar();
    const icon = screen.getByRole("button", { name: "Settings" }).querySelector("svg");
    expect(icon?.querySelector("circle")).not.toBeNull();
    expect(icon?.querySelector("path")?.getAttribute("d")?.startsWith("M19.4")).toBe(true);
  });

  it("no longer carries a theme picker, which lives in Settings", () => {
    renderBar();
    expect(screen.queryByRole("combobox", { name: "Theme" })).not.toBeInTheDocument();
  });
  it("shows the brand and the chat title", () => {
    renderBar();
    expect(screen.getByText("gentle web")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add login with magic link" })).toBeInTheDocument();
  });

  it("reports each toggle's state through aria-pressed", () => {
    renderBar({ leftOpen: false, rightOpen: true });
    expect(screen.getByRole("button", { name: "Toggle chat list" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Toggle side panel" })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls the matching handler when a toggle is clicked", () => {
    const props = renderBar();
    screen.getByRole("button", { name: "Toggle chat list" }).click();
    expect(props.onToggleLeft).toHaveBeenCalledTimes(1);
    expect(props.onToggleRight).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Toggle side panel" }).click();
    expect(props.onToggleRight).toHaveBeenCalledTimes(1);
  });
});

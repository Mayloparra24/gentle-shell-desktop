// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitTab } from "./GitTab";
import { PREVIEW_WORKSPACE } from "../preview";

describe("GitTab", () => {
  it("shows branch, upstream, ahead and changes, with disconnected actions disabled", () => {
    render(<GitTab git={PREVIEW_WORKSPACE.git} />);
    expect(screen.getByText("feat/magic-link-login")).toBeInTheDocument();
    expect(screen.getByText("→ origin/main · 2 ahead")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes · 4" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getAllByText("M")).toHaveLength(2);
    expect(screen.getByText("D")).toBeInTheDocument();
    const commit = screen.getByRole("button", { name: "Commit" });
    const pr = screen.getByRole("button", { name: "Create PR" });
    expect(commit).toBeDisabled();
    expect(pr).toBeDisabled();
    expect(commit).toHaveAttribute("title", "Not connected yet");
    expect(pr).toHaveAttribute("title", "Not connected yet");
    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), { target: { value: "Add magic link" } });
    expect(commit).toBeDisabled();
    expect(pr).toBeDisabled();
  });
});

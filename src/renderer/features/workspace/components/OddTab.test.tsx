// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OddTab } from "./OddTab";
import { PREVIEW_WORKSPACE } from "../preview";

describe("OddTab", () => {
  it("marks the current phase and task and displays the document and checks", () => {
    render(<OddTab odd={PREVIEW_WORKSPACE.odd} />);
    const phases = screen.getByRole("list", { name: "Phases" });
    expect(within(phases).getAllByRole("listitem")).toHaveLength(5);
    expect(within(phases).getByText("Build")).toHaveAttribute("aria-current", "step");
    const tasks = screen.getByRole("list", { name: "Tasks" });
    expect(within(tasks).getAllByRole("listitem")).toHaveLength(5);
    expect(within(tasks).getByText("Send the login email").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("odd/tasks/magic-link-login.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Login with magic link" })).toBeInTheDocument();
    expect(screen.getByText("42 passed")).toBeInTheDocument();
    expect(screen.getByText("212 / 400")).toBeInTheDocument();
  });
});

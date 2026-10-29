// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandMenu } from "./CommandMenu";

const footer = "Pi's built-in commands such as /model are not available here.";
describe("CommandMenu", () => {
  it("renders selectable commands with descriptions, source labels and stable option ids", () => {
    const onPick = vi.fn();
    render(<CommandMenu id="commands" commands={[{ name: "commit-message", description: "Write a commit", source: "prompt" }, { name: "review", source: "skill" }, { name: "help", source: "extension" }]} activeIndex={0} status="ready" onPick={onPick} />);
    expect(screen.getByRole("listbox")).toHaveAttribute("id", "commands");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("id", "commands-0");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Write a commit")).toBeInTheDocument();
    for (const source of ["prompt", "skill", "extension"]) expect(screen.getByText(source)).toBeInTheDocument();
    fireEvent.click(options[0]!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "commit-message" }));
    expect(screen.getByText(footer)).toBeInTheDocument();
  });
  it.each([
    ["loading", undefined, "Loading commands…"],
    ["ready", undefined, "No commands match"],
    ["error", "offline", "Could not load commands: offline"],
  ] as const)("renders %s with the built-in limitation", (status, error, message) => {
    render(<CommandMenu id="commands" commands={[]} activeIndex={0} status={status} error={error} onPick={vi.fn()} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(footer)).toBeInTheDocument();
  });
});

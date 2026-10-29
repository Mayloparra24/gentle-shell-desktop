// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CONVERSATION_PANE, ConversationHeader } from "./ConversationHeader";

describe("ConversationHeader", () => {
  it("shows the Working pill only while working", () => {
    const { rerender } = render(
      <ConversationHeader working={false} pane={CONVERSATION_PANE.CHAT} runningHelpersCount={0} onSelectPane={() => {}} />,
    );
    expect(screen.queryByText("Working…")).not.toBeInTheDocument();

    rerender(
      <ConversationHeader working pane={CONVERSATION_PANE.CHAT} runningHelpersCount={0} onSelectPane={() => {}} />,
    );
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });

  it("renders a Chat / Helpers tab switch, marking the active pane", () => {
    render(
      <ConversationHeader working={false} pane={CONVERSATION_PANE.CHAT} runningHelpersCount={0} onSelectPane={() => {}} />,
    );

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Helpers" })).toHaveAttribute("aria-selected", "false");
  });

  it("shows the running count in the Helpers tab label when greater than zero", () => {
    render(
      <ConversationHeader working={false} pane={CONVERSATION_PANE.CHAT} runningHelpersCount={2} onSelectPane={() => {}} />,
    );

    expect(screen.getByRole("tab", { name: "Helpers (2 running)" })).toBeInTheDocument();
  });

  it("omits the running count from the Helpers tab label when zero", () => {
    render(
      <ConversationHeader working={false} pane={CONVERSATION_PANE.CHAT} runningHelpersCount={0} onSelectPane={() => {}} />,
    );

    expect(screen.getByRole("tab", { name: "Helpers" })).toBeInTheDocument();
  });

  it("calls onSelectPane with the clicked pane", () => {
    const onSelectPane = vi.fn();
    render(
      <ConversationHeader working={false} pane={CONVERSATION_PANE.CHAT} runningHelpersCount={1} onSelectPane={onSelectPane} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Helpers (1 running)" }));

    expect(onSelectPane).toHaveBeenCalledWith(CONVERSATION_PANE.HELPERS);
  });
});

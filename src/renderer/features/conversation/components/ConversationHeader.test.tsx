// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationHeader } from "./ConversationHeader";

describe("ConversationHeader", () => {
  it("shows the Working pill only while working", () => {
    const { rerender } = render(<ConversationHeader working={false} />);
    expect(screen.queryByText("Working…")).not.toBeInTheDocument();

    rerender(<ConversationHeader working />);
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });

  it("keeps the title and removes the Helpers switch", () => {
    render(<ConversationHeader title="My chat" working={false} />);
    expect(screen.getByRole("heading", { name: "My chat" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });


});

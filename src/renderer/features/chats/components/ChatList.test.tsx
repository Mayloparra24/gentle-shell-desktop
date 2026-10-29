// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CHAT_STATE, type ChatSummary } from "@shared/bridge-types";
import { ChatList } from "./ChatList";

function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "chat-1",
    title: "A chat",
    cwd: "/tmp/project",
    updatedAt: "2026-09-21T09:00:00.000Z",
    messageCount: 1,
    state: CHAT_STATE.IDLE,
    ...overrides,
  };
}

describe("ChatList", () => {
  it("renders a project heading per folder and the status of each chat", () => {
    const chats = [
      makeChat({ id: "a", title: "Login chat", cwd: "/work/shop-web", state: CHAT_STATE.WORKING }),
      makeChat({ id: "b", title: "Rate limit", cwd: "/work/shop-api", state: CHAT_STATE.NEEDS_YOU }),
      makeChat({ id: "c", title: "Cart fix", cwd: "/work/shop-web", state: CHAT_STATE.IDLE }),
    ];

    render(<ChatList chats={chats} onSelect={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "shop-web" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "shop-api" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Login chat/ })).toHaveTextContent("working");
    expect(screen.getByRole("button", { name: /Rate limit/ })).toHaveTextContent("needs you");
    expect(screen.getByRole("button", { name: /Cart fix/ })).toHaveTextContent("idle");
  });

  it("calls onSelect with the chat when an item is clicked", () => {
    const chat = makeChat({ id: "clicked" });
    const onSelect = vi.fn();

    render(<ChatList chats={[chat]} onSelect={onSelect} />);
    screen.getByRole("button", { name: /A chat/ }).click();

    expect(onSelect).toHaveBeenCalledWith(chat);
  });

  it("marks the selected chat as current", () => {
    const chats = [makeChat({ id: "a", title: "First" }), makeChat({ id: "b", title: "Second" })];

    render(<ChatList chats={chats} selectedId="b" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /First/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /Second/ })).toHaveAttribute("aria-current", "true");
  });

  it("renders nothing when there are no chats", () => {
    const { container } = render(<ChatList chats={[]} onSelect={vi.fn()} />);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
});

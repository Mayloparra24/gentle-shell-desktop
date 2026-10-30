// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CHAT_STATE, type ChatSummary, type GentleBridge } from "@shared/bridge-types";
import { ChatsContainer } from "./ChatsContainer";

function makeBridge(overrides: Partial<GentleBridge> = {}): GentleBridge {
  return {
    listDirectory: vi.fn().mockResolvedValue({ status: "no-chat-folder" }),
    gitSummary: vi.fn().mockResolvedValue({ status: "no-chat-folder" }),
    listChats: vi.fn().mockResolvedValue([]),
    openChat: vi.fn(),
    newChat: vi.fn(),
    chooseFolder: vi.fn(),
    startChat: vi.fn(),
    sendMessage: vi.fn(),
    abort: vi.fn(),
    answerDialog: vi.fn(),
    onState: vi.fn(),
    onError: vi.fn(),
    setupStatus: vi.fn().mockResolvedValue({ needsChoice: false, detection: { found: false, dir: "", hasAuth: false, hasModels: false } }),
    chooseHome: vi.fn(),
    homeStatus: vi.fn(),
    listCommands: vi.fn(),
    readSettings: vi.fn(),
    setSetting: vi.fn(),
    readProfiles: vi.fn(),
    setWindowTheme: vi.fn(),
    runDiagnostic: vi.fn(),
    ...overrides,
  };
}

it("shows a message when listChats rejects", async () => {
  window.gentle = makeBridge({ listChats: vi.fn().mockRejectedValue(new Error("bridge not ready")) });
  render(<ChatsContainer onSelectChat={vi.fn()} onNewChat={vi.fn()} />);
  expect(await screen.findByText("Chats are not available yet: bridge not ready")).toBeInTheDocument();
});

it("calls onNewChat when the New chat button is clicked", async () => {
  window.gentle = makeBridge();
  const onNewChat = vi.fn();

  render(<ChatsContainer onSelectChat={vi.fn()} onNewChat={onNewChat} />);
  screen.getByRole("button", { name: "New chat" }).click();

  expect(onNewChat).toHaveBeenCalled();
});

it("calls onSelectChat with the chat when a list item is clicked", async () => {
  const chat: ChatSummary = {
    id: "chat-1",
    title: "Refactor the store",
    cwd: "/tmp/project",
    updatedAt: "2026-09-21T09:00:00.000Z",
    messageCount: 3,
    state: CHAT_STATE.IDLE,
  };
  window.gentle = makeBridge({ listChats: vi.fn().mockResolvedValue([chat]) });
  const onSelectChat = vi.fn();

  render(<ChatsContainer onSelectChat={onSelectChat} onNewChat={vi.fn()} />);
  (await screen.findByRole("button", { name: /Refactor the store/ })).click();

  expect(onSelectChat).toHaveBeenCalledWith(chat);
});

it("filters the chat list by title from the search field", async () => {
  const make = (id: string, title: string): ChatSummary => ({
    id,
    title,
    cwd: "/work/shop-web",
    updatedAt: "2026-09-21T09:00:00.000Z",
    messageCount: 1,
    state: CHAT_STATE.IDLE,
  });
  window.gentle = makeBridge({ listChats: vi.fn().mockResolvedValue([make("1", "Add login"), make("2", "Fix cart rounding")]) });

  render(<ChatsContainer onSelectChat={vi.fn()} onNewChat={vi.fn()} />);
  await screen.findByRole("button", { name: /Add login/ });

  fireEvent.change(screen.getByRole("searchbox", { name: "Search chats" }), { target: { value: "cart" } });

  expect(screen.queryByRole("button", { name: /Add login/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Fix cart rounding/ })).toBeInTheDocument();
});

it("offers only New chat as the folder-flow entry point without an unimplemented shortcut hint", () => {
  window.gentle = makeBridge();
  const choose = vi.fn();
  render(<ChatsContainer onSelectChat={vi.fn()} onNewChat={choose} />);
  expect(screen.queryByRole("button", { name: "Chat in another folder…" })).not.toBeInTheDocument();
  expect(screen.queryByText("Ctrl+N")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(choose).toHaveBeenCalledTimes(1);
});

it("labels the list as Projects", () => {
  window.gentle = makeBridge();
  render(<ChatsContainer onSelectChat={vi.fn()} onNewChat={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
});

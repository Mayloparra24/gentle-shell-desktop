// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CHAT_STATE, MESSAGE_ROLE, type ChatState, type ChatSummary, type GentleBridge } from "@shared/bridge-types";
import { ConversationContainer, type ActiveChat } from "./ConversationContainer";

const READY_CHAT: ActiveChat = { kind: "ready", state: { messages: [], working: false, pendingDialogs: [], activity: 0, helpers: { summary: { running: 0, queued: 0, waiting: 0, finished: 0 }, tasks: [] } } };

const EXISTING_CHAT: ChatSummary = {
  id: "chat-1",
  title: "Refactor the store",
  cwd: "/tmp/project",
  updatedAt: "2026-09-21T09:00:00.000Z",
  messageCount: 3,
  state: CHAT_STATE.IDLE,
};

const EMPTY_HELPERS = { summary: { running: 0, queued: 0, waiting: 0, finished: 0 }, tasks: [] };

function emptyState(): ChatState {
  return { messages: [], working: false, pendingDialogs: [], activity: 0, helpers: EMPTY_HELPERS };
}

function makeBridge(overrides: Partial<GentleBridge> = {}): GentleBridge {
  return {
    listDirectory: vi.fn().mockResolvedValue({ status: "no-chat-folder" }),
    readFile: vi.fn().mockResolvedValue({ status: "no-chat-folder" }),
    gitSummary: vi.fn().mockResolvedValue({ status: "no-chat-folder" }),
    gitPlan: async () => { throw new Error("Git writes unavailable in fixture"); },
    gitTrust: async () => { throw new Error("Git writes unavailable in fixture"); },
    gitApply: async () => { throw new Error("Git writes unavailable in fixture"); },
    listChats: vi.fn().mockResolvedValue([]),
    openChat: vi.fn().mockResolvedValue(emptyState()),
    newChat: vi.fn().mockResolvedValue(emptyState()),
    chooseFolder: vi.fn().mockResolvedValue({ status: "cancelled" }),
    startChat: vi.fn().mockResolvedValue({ status: "cancelled" }),
    sendMessage: vi.fn().mockResolvedValue({ queued: true }),
    abort: vi.fn().mockResolvedValue(undefined),
    answerDialog: vi.fn().mockResolvedValue(undefined),
    onState: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
    setupStatus: vi.fn().mockResolvedValue({ needsChoice: false, detection: { found: false, dir: "", hasAuth: false, hasModels: false } }),
    chooseHome: vi.fn().mockResolvedValue(undefined),
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

describe("ConversationContainer", () => {
  it("still renders the opened conversation and sends messages when reporting workspace readiness", async () => {
    const state: ChatState = { ...emptyState(), messages: [{ id: "opened", role: MESSAGE_ROLE.ASSISTANT, text: "Existing conversation" }] };
    const bridge = makeBridge({ openChat: vi.fn().mockResolvedValue(state) });
    window.gentle = bridge;
    const selected: ActiveChat = { kind: "existing", chat: EXISTING_CHAT };
    const ready = vi.fn();
    render(<ConversationContainer activeChat={selected} onChatReady={ready} />);
    expect(await screen.findByText("Existing conversation")).toBeInTheDocument();
    expect(ready).toHaveBeenCalledExactlyOnceWith(selected);
    expect(bridge.openChat).toHaveBeenCalledExactlyOnceWith("chat-1");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(bridge.sendMessage).toHaveBeenCalledExactlyOnceWith("hello");
  });
  it("opens models for the exact trimmed profiles command but sends arguments and other text normally", async () => {
    const bridge = makeBridge({ listCommands: vi.fn().mockResolvedValue([]) });
    window.gentle = bridge;
    const onOpenModels = vi.fn();
    render(<ConversationContainer activeChat={READY_CHAT} onOpenModels={onOpenModels} />);
    await screen.findByRole("textbox");
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "  /gentle:profiles  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onOpenModels).toHaveBeenCalledTimes(1);
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(field).toHaveValue("");
    for (const text of ["/gentle:profiles help", "hello"]) {
      fireEvent.change(field, { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(bridge.sendMessage).toHaveBeenCalledWith(text);
    }
    expect(onOpenModels).toHaveBeenCalledTimes(1);
  });
  it("sends a picked command and its arguments through the normal bridge path", async () => {
    const bridge = makeBridge({ listCommands: vi.fn().mockResolvedValue([{ name: "commit-message", source: "prompt" }]) });
    window.gentle = bridge;
    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "/" } });
    fireEvent.click(await screen.findByText("/commit-message"));
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "/commit-message staged changes" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(bridge.listCommands).toHaveBeenCalledTimes(1);
    expect(bridge.sendMessage).toHaveBeenCalledWith("/commit-message staged changes");
    expect(field).toHaveValue("");
  });
  it("uses an already host-started chat without calling bridge.newChat again", async () => {
    const bridge = makeBridge();
    window.gentle = bridge;
    const ready = vi.fn();

    render(<ConversationContainer activeChat={READY_CHAT} onChatReady={ready} />);

    await vi.waitFor(() => expect(ready).toHaveBeenCalledExactlyOnceWith(READY_CHAT));
    expect(bridge.newChat).not.toHaveBeenCalled();
    expect(bridge.openChat).not.toHaveBeenCalled();
  });

  it("calls bridge.openChat(id) for an existing activeChat", async () => {
    const bridge = makeBridge();
    window.gentle = bridge;

    render(<ConversationContainer activeChat={{ kind: "existing", chat: EXISTING_CHAT }} />);

    await vi.waitFor(() => expect(bridge.openChat).toHaveBeenCalledWith("chat-1"));
    expect(bridge.newChat).not.toHaveBeenCalled();
  });

  it("re-opens when activeChat changes", async () => {
    const bridge = makeBridge();
    window.gentle = bridge;

    const { rerender } = render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this draft" } });

    rerender(<ConversationContainer activeChat={{ kind: "existing", chat: EXISTING_CHAT }} />);
    await vi.waitFor(() => expect(bridge.openChat).toHaveBeenCalledWith("chat-1"));
    expect(screen.getByRole("textbox")).toHaveValue("keep this draft");
  });

  it("renders only the pushed ChatState", async () => {
    let pushState: (state: ChatState) => void = () => {};
    const bridge = makeBridge({
      onState: vi.fn((callback: (state: ChatState) => void) => {
        pushState = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    pushState({
      messages: [{ id: "m1", role: MESSAGE_ROLE.ASSISTANT, text: "Hello there", streaming: false }],
      working: false,
      pendingDialogs: [],
      activity: 0,
      helpers: EMPTY_HELPERS,
    });

    expect(await screen.findByText("Hello there")).toBeInTheDocument();
  });

  it("calls bridge.sendMessage with the trimmed draft on submit", async () => {
    const bridge = makeBridge();
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    fireEvent.change(screen.getByPlaceholderText("Tell Gentle what you need…"), { target: { value: "  hi Gentle  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(bridge.sendMessage).toHaveBeenCalledWith("hi Gentle");
  });

  it("shows an onError push in the status line without adding a message", async () => {
    let pushError: (message: string) => void = () => {};
    const bridge = makeBridge({
      onError: vi.fn((callback: (message: string) => void) => {
        pushError = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    pushError("Gentle is still working");

    expect(await screen.findByRole("status")).toHaveTextContent("Gentle is still working");
    expect(screen.queryByText(/still working/, { selector: ".gc-message__text" })).not.toBeInTheDocument();
  });

  it("shows a pushed ChatState.lastError in the status line", async () => {
    let pushState: (state: ChatState) => void = () => {};
    const bridge = makeBridge({
      onState: vi.fn((callback: (state: ChatState) => void) => {
        pushState = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    pushState({ messages: [], working: false, pendingDialogs: [], activity: 0, helpers: EMPTY_HELPERS, lastError: "pi exited unexpectedly" });

    expect(await screen.findByRole("status")).toHaveTextContent("pi exited unexpectedly");
  });

  it("forwards a dialog answer to bridge.answerDialog with the dialog id", async () => {
    let pushState: (state: ChatState) => void = () => {};
    const bridge = makeBridge({
      onState: vi.fn((callback: (state: ChatState) => void) => {
        pushState = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    pushState({
      messages: [],
      working: false,
      pendingDialogs: [{ id: "dlg-1", method: "confirm", title: "Delete the file?" }],
      activity: 0,
      helpers: EMPTY_HELPERS,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));

    expect(bridge.answerDialog).toHaveBeenCalledWith("dlg-1", { confirmed: true });
  });

  it("calls bridge.abort() on Escape while working", async () => {
    let pushState: (state: ChatState) => void = () => {};
    const bridge = makeBridge({
      onState: vi.fn((callback: (state: ChatState) => void) => {
        pushState = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    pushState({ messages: [], working: true, pendingDialogs: [], activity: 0, helpers: EMPTY_HELPERS });

    const textarea = screen.getByPlaceholderText("Tell Gentle what you need…");
    await vi.waitFor(() => expect(textarea).toHaveAttribute("readonly"));
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(bridge.abort).toHaveBeenCalled();
  });

  it("guards the open/new effect against a stale resolution when the selection changes before it settles", async () => {
    let resolveFirst: (state: ChatState) => void = () => {};
    const firstChat: ChatSummary = { ...EXISTING_CHAT, id: "chat-1", title: "First chat" };
    const secondChat: ChatSummary = { ...EXISTING_CHAT, id: "chat-2", title: "Second chat" };

    const bridge = makeBridge({
      openChat: vi.fn((id: string) => {
        if (id === "chat-1") {
          return new Promise<ChatState>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(emptyState());
      }),
    });
    window.gentle = bridge;

    const { rerender } = render(<ConversationContainer activeChat={{ kind: "existing", chat: firstChat }} />);
    await vi.waitFor(() => expect(bridge.openChat).toHaveBeenCalledWith("chat-1"));

    rerender(<ConversationContainer activeChat={{ kind: "existing", chat: secondChat }} />);
    await vi.waitFor(() => expect(bridge.openChat).toHaveBeenCalledWith("chat-2"));

    // The stale first request resolves after the second one was already
    // requested; its state must never overwrite what belongs to chat-2.
    resolveFirst({
      messages: [{ id: "stale", role: MESSAGE_ROLE.ASSISTANT, text: "stale reply", streaming: false }],
      working: false,
      pendingDialogs: [],
      activity: 0,
      helpers: EMPTY_HELPERS,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("stale reply")).not.toBeInTheDocument();
  });

  it("does not call sendMessage when the draft is only whitespace", async () => {
    const bridge = makeBridge();
    window.gentle = bridge;

    render(<ConversationContainer activeChat={READY_CHAT} />);
    await screen.findByRole("textbox");

    fireEvent.change(screen.getByPlaceholderText("Tell Gentle what you need…"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  const HELPERS_WITH_TASKS = {
    summary: { running: 1, queued: 0, waiting: 0, finished: 0 },
    tasks: [
      {
        id: "helper-1",
        agent: "researcher",
        label: "Look into the failing test",
        prompt: "p",
        status: "running" as const,
        createdAt: "2026-09-22T10:00:00.000Z",
        startedAt: "2026-09-22T10:00:00.000Z",
        turns: 1,
        toolCalls: 0,
        thread: { version: 0, dropped: 0, items: [] },
      },
    ],
  };

  it("reports helpers upward without rendering the old strip or Helpers tab", async () => {
    let pushState: (state: ChatState) => void = () => {};
    const bridge = makeBridge({
      onState: vi.fn((callback: (state: ChatState) => void) => {
        pushState = callback;
        return () => {};
      }),
    });
    window.gentle = bridge;

    const onStateChange = vi.fn();
    render(<ConversationContainer activeChat={READY_CHAT} onStateChange={onStateChange} />);
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledWith(READY_CHAT, READY_CHAT.state));
    const state = { ...emptyState(), helpers: HELPERS_WITH_TASKS };
    act(() => pushState(state));
    await vi.waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(READY_CHAT, state));
    expect(screen.queryByText(/Helpers ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });


});

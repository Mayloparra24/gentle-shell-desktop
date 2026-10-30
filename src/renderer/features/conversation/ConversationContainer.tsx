import { useEffect, useState } from "react";
import type { ChatState, ChatSummary, DialogAnswer } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { Button } from "@renderer/shared/ui/atoms/Button";
import { Composer } from "./components/Composer";
import { ConversationHeader } from "./components/ConversationHeader";
import { MessageThread } from "./components/MessageThread";
import { StatusLine } from "./components/StatusLine";
import "./ConversationContainer.css";

/**
 * Which chat is open right now. App.tsx owns this as small local state (no
 * global store for M1, see odd/tasks/desktop-m1-chat-core.md) and passes it
 * down; ChatsContainer only reports selection intent up to App, it never
 * calls chat.open/chat.new itself, because GentleBridge tracks exactly one
 * "currently open" chat.
 */
export type ActiveChat = { readonly kind: "none" } | { readonly kind: "ready"; readonly state: ChatState } | { readonly kind: "existing"; readonly chat: ChatSummary };

export interface ConversationContainerProps {
  readonly activeChat: ActiveChat;
  readonly onOpenModels?: () => void;
  readonly onChooseFolder?: () => void;
  readonly onChatReady?: (chat: ActiveChat) => void;
  readonly onStateChange?: (chat: ActiveChat, state: ChatState) => void;
}

function emptyChatState(): ChatState {
  return {
    messages: [],
    working: false,
    pendingDialogs: [],
    activity: 0,
    helpers: { summary: { running: 0, queued: 0, waiting: 0, finished: 0 }, tasks: [] },
  };
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Conversation container: ONE source of truth for the thread is the pushed
 * `ChatState` (messages, working, pendingDialogs, lastError) — nothing is
 * derived or invented locally. Errors (ChatState.lastError and
 * bridge.onError pushes) render in a dedicated StatusLine, never as a
 * synthetic ChatMessage appended to the thread.
 */
export function ConversationContainer({ activeChat, onOpenModels, onChatReady, onChooseFolder, onStateChange }: ConversationContainerProps) {
  const bridge = useBridge();
  const [chatState, setChatState] = useState<ChatState>(emptyChatState());
  const [bridgeError, setBridgeError] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");

  // Subscribes once: GentleBridge pushes state/error for whichever chat is
  // currently open, independent of which activeChat this render owns.
  useEffect(() => {
    const unsubscribeState = bridge.onState((state) => {
      setChatState(state);
      onStateChange?.(activeChat, state);
    });
    const unsubscribeError = bridge.onError(setBridgeError);
    return () => {
      unsubscribeState();
      unsubscribeError();
    };
  }, [bridge, activeChat, onStateChange]);

  // Opens the selected saved chat, or displays the chat already started by the folder dialog.
  // Guarded against stale resolutions: if the selection changes again
  // before this request settles (e.g. quickly clicking two chats), its
  // resolved/rejected result must not clobber the state that belongs to
  // the newer selection.
  useEffect(() => {
    setBridgeError(undefined);
    setChatState(emptyChatState());
    let cancelled = false;
    if (activeChat.kind === "none") return;
    const opening = activeChat.kind === "ready" ? Promise.resolve(activeChat.state)
      : bridge.openChat(activeChat.chat.id);
    opening
      .then((state) => {
        if (!cancelled) {
          setChatState(state);
          onStateChange?.(activeChat, state);
          onChatReady?.(activeChat);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setBridgeError(errorText(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, activeChat, onChatReady, onStateChange]);

  const handleSend = (): void => {
    const text = draft.trim();
    if (text.length === 0 || chatState.working) return;

    setDraft("");
    if (text === "/gentle:profiles") {
      onOpenModels?.();
      return;
    }
    bridge
      .sendMessage(text)
      .then((result) => {
        if (!result.queued) setBridgeError(result.reason ?? "Gentle did not send the message");
      })
      .catch((cause: unknown) => setBridgeError(errorText(cause)));
  };

  const handleAbort = (): void => {
    bridge.abort().catch((cause: unknown) => setBridgeError(errorText(cause)));
  };

  const handleAnswerDialog = (id: string, answer: DialogAnswer): void => {
    bridge.answerDialog(id, answer).catch((cause: unknown) => setBridgeError(errorText(cause)));
  };

  const error = bridgeError ?? chatState.lastError;

  if (activeChat.kind === "none") return (
    <section className="gc-conversation gc-conversation--empty">
      <span className="gc-conversation__mark" aria-hidden="true">✿</span>
      <p>Start a chat in any folder</p>
      <Button variant="ghost" onClick={onChooseFolder}>New chat</Button>
    </section>
  );

  return (
    <section className="gc-conversation">
      <ConversationHeader
        working={chatState.working}
      />
      <StatusLine error={error} />
      <MessageThread messages={chatState.messages} dialogs={chatState.pendingDialogs} onAnswerDialog={handleAnswerDialog} />
      <Composer
        value={draft}
        working={chatState.working}
        onChange={setDraft}
        onSend={handleSend}
        onAbort={handleAbort}
        loadCommands={() => bridge.listCommands()}
        commandsResetKey={activeChat}
      />
    </section>
  );
}

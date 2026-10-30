import { useEffect, useState } from "react";
import type { ChatSummary } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { ChatList } from "./components/ChatList";
import "./ChatsContainer.css";

export interface ChatsContainerProps {
  /** Notifies the parent (App) that a sidebar chat was picked; App owns the currentChat state. */
  readonly onSelectChat: (chat: ChatSummary) => void;
  /** Notifies the parent that "New chat" was clicked. */
  readonly onNewChat: () => void;
  /** The currently open chat's id, for highlighting; undefined while a fresh chat is open. */
  readonly selectedChatId?: string;
}

/**
 * Sidebar container: owns the bridge listChats() call and the search
 * filter, and hands plain ChatSummary props to the presentational ChatList
 * (container/presentational split). Does not call chat.open/chat.new
 * itself — ConversationContainer owns "the currently open chat" per
 * GentleBridge's single-current-chat shape, so this only reports selection
 * intent up to App.
 */
export function ChatsContainer({ onSelectChat, onNewChat, selectedChatId }: ChatsContainerProps) {
  const bridge = useBridge();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    bridge
      .listChats()
      .then((loaded) => {
        if (!cancelled) setChats(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const needle = query.trim().toLowerCase();
  const visibleChats = needle === "" ? chats : chats.filter((chat) => chat.title.toLowerCase().includes(needle));

  return (
    <aside className="gc-chats" aria-label="Projects and chats">
      <button type="button" className="gc-chats__new" onClick={onNewChat}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        New chat
      </button>
      <input
        type="search"
        className="gc-chats__search"
        aria-label="Search chats"
        placeholder="Search chats"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <h2 className="gc-chats__heading">Projects</h2>
      {error && <p className="gc-chats__error">Chats are not available yet: {error}</p>}
      <ChatList chats={visibleChats} selectedId={selectedChatId} onSelect={onSelectChat} />
    </aside>
  );
}

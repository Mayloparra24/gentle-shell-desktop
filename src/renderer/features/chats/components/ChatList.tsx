import type { ChatSummary } from "@shared/bridge-types";
import { groupChatsByProject } from "@shared/chatGrouping";
import { ChatListItem } from "./ChatListItem";
import "./ChatList.css";

export interface ChatListProps {
  readonly chats: readonly ChatSummary[];
  readonly selectedId?: string;
  readonly onSelect: (chat: ChatSummary) => void;
}

// Presentational: groups chats by project folder (@shared/chatGrouping) and
// renders a ChatListItem per chat. ChatsContainer owns the bridge call, the
// search filter and the selected-chat callback.
export function ChatList({ chats, selectedId, onSelect }: ChatListProps) {
  const groups = groupChatsByProject(chats);

  return (
    <div className="gc-chat-list">
      {groups.map((group) => (
        <section key={group.label + group.chats[0]?.cwd} className="gc-chat-list__group">
          <h3 className="gc-chat-list__project" aria-label={group.label}><span>{group.label}</span><small>{group.chats.length}</small></h3>
          <ul className="gc-chat-list__items">
            {group.chats.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

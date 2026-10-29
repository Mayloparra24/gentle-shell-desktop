import { CHAT_STATE, type ChatSummary } from "@shared/bridge-types";
import "./ChatListItem.css";

const STATE_LABEL: Record<ChatSummary["state"], string> = {
  [CHAT_STATE.IDLE]: "idle",
  [CHAT_STATE.WORKING]: "working",
  [CHAT_STATE.NEEDS_YOU]: "needs you",
};

export interface ChatListItemProps {
  readonly chat: ChatSummary;
  readonly selected?: boolean;
  readonly onSelect: (chat: ChatSummary) => void;
}

// Presentational only — receives props, talks to nothing. ChatsContainer
// (through ChatList) owns the bridge call and passes ChatSummary values
// down. A <button> (not a clickable <div>) so the list is keyboard- and
// screen-reader-navigable without extra ARIA plumbing. State is shown as a
// colored dot plus a text label, never by color alone.
export function ChatListItem({ chat, selected = false, onSelect }: ChatListItemProps) {
  const classes = ["gc-chat-list-item", selected && "gc-chat-list-item--selected"].filter(Boolean).join(" ");

  return (
    <li>
      <button type="button" className={classes} aria-current={selected || undefined} onClick={() => onSelect(chat)}>
        <span className={`gc-chat-list-item__dot gc-chat-list-item__dot--${chat.state}`} aria-hidden="true" />
        <span className="gc-chat-list-item__text">
          <span className="gc-chat-list-item__title">{chat.title}</span>
          <span className="gc-chat-list-item__state">{STATE_LABEL[chat.state]}</span>
        </span>
      </button>
    </li>
  );
}

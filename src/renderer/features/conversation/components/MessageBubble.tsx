import { MESSAGE_ROLE, NOTICE_LEVEL, type ChatMessage } from "@shared/bridge-types";
import { Markdown } from "@renderer/shared/markdown/Markdown";
import "./MessageBubble.css";

export interface MessageBubbleProps {
  readonly message: ChatMessage;
}

// Presentational only. The "no tool output, no thinking shown" filtering
// happens in T2's reducer before a message ever reaches this component.
// Assistant replies render through <Markdown> (sanitized HTML — see
// renderMarkdown.ts) since a model naturally replies in Markdown
// (`**bold**`, `` `code` ``, `- lists`); user messages and command notices
// stay literal plain text so nothing a human typed or an extension printed
// is ever reinterpreted as markup.
export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === MESSAGE_ROLE.NOTICE) {
    const level = message.level ?? NOTICE_LEVEL.INFO;
    return (
      <div
        role={level === NOTICE_LEVEL.ERROR ? "alert" : "status"}
        className={`gc-message gc-message--notice gc-message--notice-${level}`}
      >
        <p className="gc-message__text">{message.text}</p>
      </div>
    );
  }

  const isUser = message.role === MESSAGE_ROLE.USER;

  return (
    <div className={`gc-message gc-message--${isUser ? "user" : "assistant"}`}>
      {isUser ? <p className="gc-message__text">{message.text}</p> : <Markdown text={message.text} />}
    </div>
  );
}

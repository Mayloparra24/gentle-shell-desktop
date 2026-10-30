import { Pill, PILL_TONE } from "@renderer/shared/ui/atoms/Pill";
import "./ConversationHeader.css";

export interface ConversationHeaderProps {
  /** The open chat's title; the title bar no longer carries it. */
  readonly title?: string;
  readonly working: boolean;
}

export function ConversationHeader({ title, working }: ConversationHeaderProps) {
  return (
    <header className="gc-conversation-header">
      {title && <h2 className="gc-conversation-header__title">{title}</h2>}
      {working && <Pill tone={PILL_TONE.WORKING}>Working…</Pill>}
    </header>
  );
}

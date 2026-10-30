import { BrandMark } from "./BrandMark";
import "./TopBar.css";

export interface TopBarProps {
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
  readonly onToggleLeft: () => void;
  readonly onToggleRight: () => void;
  readonly onOpenSettings?: () => void;
  readonly settingsButtonRef?: React.Ref<HTMLButtonElement>;
}

type PanelSide = "left" | "right";

function PanelIcon({ side }: { readonly side: PanelSide }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === "left" ? "M9 4v16" : "M15 4v16"} />
    </svg>
  );
}

const isMac = (): boolean => typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");

// The window's own title bar (the native one is hidden, see windowChrome in the main process): brand and the
// two panel toggles, with Settings on the right. The middle stays empty on purpose: it is the drag area, and the
// chat title and folder already live in the conversation tab and the status bar. The toggles expose their state
// with aria-pressed (pressed = panel visible).
export function TopBar({ leftOpen, rightOpen, onToggleLeft, onToggleRight, onOpenSettings, settingsButtonRef }: TopBarProps) {
  return (
    <header className="gc-topbar" data-window-drag data-mac={isMac() || undefined}>
      <div className="gc-topbar__start">
        <span className="gc-topbar__brand">
          <span className="gc-topbar__mark">
            <BrandMark />
          </span>
          Gentle Shell Desktop
        </span>
        <button type="button" className="gc-topbar__toggle" aria-label="Toggle chat list" aria-pressed={leftOpen} onClick={onToggleLeft}>
          <PanelIcon side="left" />
        </button>
      </div>
      <div className="gc-topbar__end">
        <button type="button" className="gc-topbar__toggle" aria-label="Settings" aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus(); onOpenSettings?.(); }} ref={settingsButtonRef}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button type="button" className="gc-topbar__toggle" aria-label="Toggle side panel" aria-pressed={rightOpen} onClick={onToggleRight}>
          <PanelIcon side="right" />
        </button>
      </div>
    </header>
  );
}

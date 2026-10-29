import { THEMES, type ThemeId } from "@renderer/shared/theme/themes";
import "./TopBar.css";

export interface TopBarProps {
  readonly title: string;
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
  readonly onToggleLeft: () => void;
  readonly onToggleRight: () => void;
  readonly themeId: ThemeId;
  readonly onChangeTheme: (themeId: ThemeId) => void;
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

// Presentational: brand, the two panel toggles and the open chat's title.
// The toggles expose their state with aria-pressed (pressed = panel visible).
export function TopBar({ title, leftOpen, rightOpen, onToggleLeft, onToggleRight, themeId, onChangeTheme, onOpenSettings, settingsButtonRef }: TopBarProps) {
  return (
    <header className="gc-topbar">
      <div className="gc-topbar__start">
        <span className="gc-topbar__brand">
          <span className="gc-topbar__mark" aria-hidden="true">
            ✿
          </span>{" "}
          gentle web
        </span>
        <button type="button" className="gc-topbar__toggle" aria-label="Toggle chat list" aria-pressed={leftOpen} onClick={onToggleLeft}>
          <PanelIcon side="left" />
        </button>
      </div>
      <h2 className="gc-topbar__title">{title}</h2>
      <div className="gc-topbar__end">
        <button type="button" className="gc-topbar__settings" aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus(); onOpenSettings?.(); }} ref={settingsButtonRef}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2-1 3 2 3-2 2 1 3-2-1-3 2-2-2-3-3-1-1-3z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
          Settings
        </button>
        <select
          className="gc-topbar__theme"
          aria-label="Theme"
          value={themeId}
          onChange={(event) => onChangeTheme(event.target.value as ThemeId)}
        >
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
        <button type="button" className="gc-topbar__toggle" aria-label="Toggle side panel" aria-pressed={rightOpen} onClick={onToggleRight}>
          <PanelIcon side="right" />
        </button>
        </div>
    </header>
  );
}

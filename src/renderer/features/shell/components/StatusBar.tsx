import "./StatusBar.css";

export interface StatusBarInfo {
  readonly cwd?: string;
  readonly branch?: string;
}

export interface StatusBarProps {
  readonly info: StatusBarInfo;
}

// Only facts exposed by the active chat and its workspace belong here.
export function StatusBar({ info }: StatusBarProps) {
  const folder = info.cwd?.split(/[\\/]/).filter(Boolean).pop() || info.cwd;
  return (
    <footer className="gc-status-bar" aria-label="Status bar">
      <span className="gc-status-bar__segment gc-status-bar__brand">
        <span aria-hidden="true">✿</span>Gentle Shell Desktop
      </span>
      <span className="gc-status-bar__segment" title={info.cwd || undefined}>{folder || "No folder chosen"}</span>
      {folder && info.branch && <span className="gc-status-bar__segment gc-status-bar__branch">{info.branch}</span>}
    </footer>
  );
}

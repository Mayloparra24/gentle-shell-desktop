import "./StatusBar.css";

export interface StatusBarInfo {
  readonly cwd: string;
  readonly branch: string;
  /** Uncommitted changes: shows a trailing `*` after the branch. */
  readonly dirty: boolean;
  readonly model: string;
  readonly effort: string;
  readonly profile: string;
  readonly contextPercent: number;
  readonly cost: string;
  readonly workflow: string;
}

export interface StatusBarProps {
  readonly info: StatusBarInfo;
  /** True while everything except the cwd is placeholder data (no bridge source yet). */
  readonly sample?: boolean;
  readonly onOpenModels?: () => void;
}

const SAMPLE_TITLE = "Sample value · not connected yet";

// Presentational: one line of session facts at the bottom of the window.
// Segments other than the cwd are marked with a tooltip while they are
// sample data, so nobody mistakes them for a live reading.
export function StatusBar({ info, sample = false, onOpenModels }: StatusBarProps) {
  const title = sample ? SAMPLE_TITLE : undefined;
  const modelsTitle = sample ? `${SAMPLE_TITLE}. Click to open the models screen.` : "Click to open the models screen.";

  return (
    <footer className="gc-status-bar" aria-label="Status bar">
      <span className="gc-status-bar__segment gc-status-bar__brand">
        <span aria-hidden="true">✿</span>gentle shell
      </span>
      <span className="gc-status-bar__segment">{info.cwd}</span>
      <span className="gc-status-bar__segment gc-status-bar__branch" title={title}>
        {info.dirty ? `${info.branch} *` : info.branch}
      </span>
      <button type="button" className="gc-status-bar__segment gc-status-bar__model" title={modelsTitle}
        aria-label={`Open models screen (model ${info.model})`} onClick={onOpenModels}>
        {info.model}
      </button>
      <button type="button" className="gc-status-bar__segment" title={modelsTitle}
        aria-label={`Open models screen (effort ${info.effort})`} onClick={onOpenModels}>
        effort {info.effort}
      </button>
      <button type="button" className="gc-status-bar__segment" title={modelsTitle}
        aria-label={`Open models screen (profile ${info.profile})`} onClick={onOpenModels}>
        profile {info.profile}
      </button>
      <span className="gc-status-bar__segment gc-status-bar__context" title={title}>
        ctx {info.contextPercent}%
      </span>
      <span className="gc-status-bar__segment" title={title}>
        {info.cost}
      </span>
      <span className="gc-status-bar__segment gc-status-bar__workflow" title={title}>
        {info.workflow}
      </span>
    </footer>
  );
}

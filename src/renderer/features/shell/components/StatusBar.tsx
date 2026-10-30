import type { ChatState } from "@shared/bridge-types";
import "./StatusBar.css";

export interface StatusBarInfo {
  readonly cwd?: string;
  readonly branch?: string;
  readonly session?: ChatState["session"];
  readonly memory?: string;
}

export interface StatusBarProps {
  readonly info: StatusBarInfo;
  readonly onOpenModels?: () => void;
}

// Only facts exposed by the active chat and its workspace belong here.
export function StatusBar({ info, onOpenModels }: StatusBarProps) {
  const folder = info.cwd?.split(/[\\/]/).filter(Boolean).pop() || info.cwd;
  const { model, effort, context } = info.session ?? {};
  return (
    <footer className="gc-status-bar" aria-label="Status bar">
      <span className="gc-status-bar__segment" title={info.cwd || undefined}>
        <StatusIcon path="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />{folder || "No folder chosen"}
      </span>
      {folder && info.branch && <span className="gc-status-bar__segment gc-status-bar__branch">branch: {info.branch}</span>}
      {model && <button type="button" className="gc-status-bar__segment" title="Models and profiles" onClick={onOpenModels}>
        <StatusIcon path="M6 6h12v12H6zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />{model}{effort ? ` · ${effort}` : ""}
      </button>}
      {context && <span className="gc-status-bar__segment">
        {context.percent === null || context.tokens === null ? "context —" : <>
          context <span className="gc-status-bar__context" role="meter" aria-label="Context window used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={context.percent}>
            <i style={{ width: `${Math.max(0, Math.min(100, context.percent))}%` }} />
          </span>{Math.round(context.percent)}% · {abbreviateTokens(context.tokens)} / {abbreviateTokens(context.window)}
        </>}
      </span>}
      {info.memory && <span className="gc-status-bar__segment">
        <StatusIcon path="M12 5a3 3 0 0 0-5-2 4 4 0 0 0-3 6 4 4 0 0 0 0 7 4 4 0 0 0 8 3V5m0 0a3 3 0 0 1 5-2 4 4 0 0 1 3 6 4 4 0 0 1 0 7 4 4 0 0 1-8 3M7 7c0 2 2 3 5 3m5-3c0 2-2 3-5 3M7 16c0-2 2-3 5-3m5 3c0-2-2-3-5-3" />{info.memory}
      </span>}
    </footer>
  );
}

function StatusIcon({ path }: { readonly path: string }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

function abbreviateTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : String(tokens);
}

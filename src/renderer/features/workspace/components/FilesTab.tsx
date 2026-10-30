import { TextField } from "@renderer/shared/ui/atoms/TextField";
import type { GitState, ListingState } from "../WorkspaceDataContainer";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { GitStatus } from "./GitStatus";
import "./FilesTab.css";

export interface FilesTabProps {
  readonly git?: GitState;
  readonly folderName?: string;
  readonly listings: Readonly<Record<string, ListingState>>;
  readonly expanded: ReadonlySet<string>;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onToggle: (path: string) => void;
  readonly onRetry: (path: string) => void;
}

export function FilesTab(props: FilesTabProps) {
  function directory(path: string) {
    const listing = props.listings[path];
    if (!listing || listing.status === "loading") return <p>Loading…</p>;
    if (listing.status === "no-chat-folder") return <p>Choose a folder to see its files.</p>;
    if (listing.status === "error") return <div><p>{listing.message}</p><button type="button" onClick={() => props.onRetry(path)}>Retry</button></div>;
    const entries = [...listing.entries].sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory"))
      .filter(entry => entry.name.toLowerCase().includes(props.query.toLowerCase()));
    return <>
      {listing.entries.length === 0 && <p>This folder is empty.</p>}
      <ul className="gc-files__list" aria-label={path || "Files"}>
        {entries.map(entry => {
          const childPath = path ? `${path}/${entry.name}` : entry.name;
          const expandable = entry.kind === "directory" && entry.name !== ".git" && entry.name !== "node_modules";
          const open = props.expanded.has(childPath);
          const change = entry.kind === "file" && props.git?.status === "ready" ? props.git.changed.find(change => change.path === childPath) : undefined;
          return <li key={entry.name}>
            {expandable ? <button type="button" className="gc-files__row" aria-expanded={open} onClick={() => props.onToggle(childPath)}>
              <WorkspaceIcon name={open ? "down" : "right"} /><WorkspaceIcon name="folder" /><span className="gc-files__name">{entry.name}</span>
            </button> : <div className="gc-files__row"><WorkspaceIcon name={entry.kind === "directory" ? "folder" : /\.(ts|tsx|js|json|css)$/i.test(entry.name) ? "code" : "file"} /><span className="gc-files__name">{entry.name}</span>
              {change && <GitStatus code={change.code} />}
              {entry.kind === "file" && entry.size !== undefined && <small className="gc-files__size">{humanSize(entry.size)}</small>}
            </div>}
            {expandable && open && directory(childPath)}
          </li>;
        })}
      </ul>
      {listing.truncated && <small>Showing the first 500 entries</small>}
    </>;
  }
  return <div className="gc-files">
    <div className="gc-files__heading"><span>{props.folderName || "Files"}</span><button type="button" aria-label="Refresh files" onClick={() => props.onRetry("")}><WorkspaceIcon name="refresh" /></button></div>
    <TextField type="search" aria-label="Search files" placeholder="Search files" value={props.query}
      onChange={event => props.onQueryChange(event.target.value)} />
    {directory("")}
  </div>;
}

function humanSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), 4);
  return `${(bytes / 1000 ** unit).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}

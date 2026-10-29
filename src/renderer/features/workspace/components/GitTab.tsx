import { Button } from "@renderer/shared/ui/atoms/Button";
import type { GitState } from "../WorkspaceDataContainer";
import "./GitTab.css";

export interface GitTabProps {
  readonly git: GitState;
  readonly onRefresh: () => void;
}

export function GitTab({ git, onRefresh }: GitTabProps) {
  if (git.status === "loading") return <p>Loading…</p>;
  if (git.status === "error") return <div><p>{git.message}</p><Button type="button" onClick={onRefresh}>Retry</Button></div>;
  if (git.status !== "ready") {
    const messages = {
      "no-chat-folder": "Choose a folder to see its Git status.",
      "not-a-repository": "This folder is not a Git repository.",
      "git-unavailable": "Git is not installed or not on PATH.",
    };
    return <p>{messages[git.status]}</p>;
  }
  return <div className="gc-git">
    <div className="gc-git__branch"><span className="gc-git__branch-info">{git.branch}</span>
      <Button type="button" onClick={onRefresh}>Refresh</Button></div>
    <h3 className="gc-git__heading">Changes · {git.changed.length}</h3>
    {git.changed.length === 0 && <p>No changes.</p>}
    <ul className="gc-git__changes" aria-label="Changes">
      {git.changed.map(change => <li key={change.path} className="gc-git__change">
        <span>{change.path}</span><span title={change.code}>{statusWords(change.code)}</span>
      </li>)}
    </ul>
    {git.truncatedChanges && <small>Showing the first 500 changes</small>}
    <h3 className="gc-git__heading">Recent commits</h3>
    {git.commits.length === 0 && <p>No commits yet.</p>}
    <ul className="gc-git__changes" aria-label="Recent commits">
      {git.commits.map(commit => <li key={commit.hash} className="gc-git__change">
        <span title={commit.hash}>{commit.hash.slice(0, 7)}</span><span>{commit.subject}</span><small>{commit.relativeTime}</small>
      </li>)}
    </ul>
  </div>;
}

function statusWords(code: string): string {
  if (code === "??") return "untracked";
  const names: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", U: "unmerged", T: "type changed" };
  return [...new Set([...code.trim()].map(letter => names[letter] ?? letter))].join(", ");
}

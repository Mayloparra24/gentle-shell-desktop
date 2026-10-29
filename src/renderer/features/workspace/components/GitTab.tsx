import { useState } from "react";
import { Button } from "@renderer/shared/ui/atoms/Button";
import { TextField } from "@renderer/shared/ui/atoms/TextField";
import type { GitSnapshot } from "../types";
import "./GitTab.css";

export interface GitTabProps {
  readonly git: GitSnapshot;
}

export function GitTab({ git }: GitTabProps) {
  const [message, setMessage] = useState("");
  return (
    <div className="gc-git">
      <div className="gc-git__branch">
        <div className="gc-git__branch-info">
          <div>{git.branch}</div>
          <div className="gc-git__upstream">→ {git.upstream} · {git.ahead} ahead</div>
        </div>
        <Button type="button" className="gc-git__pr" disabled title="Not connected yet">Create PR</Button>
      </div>
      <h3 className="gc-git__heading">Changes · {git.changes.length}</h3>
      <ul className="gc-git__changes" aria-label="Changes">
        {git.changes.map((change) => (
          <li key={change.path} className="gc-git__change">
            <span>{change.path}</span><span className={`gc-git__status gc-git__status--${change.status}`}>{change.status}</span>
          </li>
        ))}
      </ul>
      <TextField multiline rows={2} aria-label="Commit message" placeholder="Commit message"
        value={message} onChange={(event) => setMessage(event.target.value)} />
      {/* No mutation actions are enabled until real bridge methods exist. */}
      <Button type="button" className="gc-git__commit" variant="ghost" disabled title="Not connected yet">Commit</Button>
    </div>
  );
}

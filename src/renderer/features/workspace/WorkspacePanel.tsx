import { useId, useState, type KeyboardEvent } from "react";
import { FilesTab } from "./components/FilesTab";
import { OddTab } from "./components/OddTab";
import { GitTab } from "./components/GitTab";
import type { WorkspaceSnapshot } from "./types";
import "./WorkspacePanel.css";

export const WORKSPACE_TAB = { FILES: "files", ODD: "odd", GIT: "git" } as const;
export type WorkspaceTab = (typeof WORKSPACE_TAB)[keyof typeof WORKSPACE_TAB];

export interface WorkspacePanelProps {
  readonly snapshot: WorkspaceSnapshot;
}

const tabs = [WORKSPACE_TAB.FILES, WORKSPACE_TAB.ODD, WORKSPACE_TAB.GIT];
const labels = { files: "Files", odd: "ODD", git: "Git" };

// Owns only local tab state; bridge data is supplied by the parent.
export function WorkspacePanel({ snapshot }: WorkspacePanelProps) {
  const [active, setActive] = useState<WorkspaceTab>(WORKSPACE_TAB.ODD);
  const id = useId();

  function navigate(event: KeyboardEvent<HTMLButtonElement>, tab: WorkspaceTab) {
    const index = tabs.indexOf(tab);
    let next: WorkspaceTab | undefined;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === "Home") next = tabs[0];
    if (event.key === "End") next = tabs[tabs.length - 1];
    if (next) {
      event.preventDefault();
      setActive(next);
      document.getElementById(`${id}-${next}-tab`)?.focus();
    }
  }

  return (
    <section className="gc-workspace" aria-label="Workspace">
      <div className="gc-workspace__tabs" role="tablist" aria-label="Workspace tabs">
        {tabs.map((tab) => (
          <button key={tab} type="button" role="tab" id={`${id}-${tab}-tab`}
            aria-controls={`${id}-${tab}-panel`} aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1} className="gc-workspace__tab"
            onClick={() => setActive(tab)} onKeyDown={(event) => navigate(event, tab)}>
            {labels[tab]}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab} role="tabpanel" id={`${id}-${tab}-panel`}
          aria-labelledby={`${id}-${tab}-tab`} hidden={active !== tab}
          tabIndex={0} className="gc-workspace__pane">
          {tab === WORKSPACE_TAB.FILES && <FilesTab files={snapshot.files} />}
          {tab === WORKSPACE_TAB.ODD && <OddTab odd={snapshot.odd} />}
          {tab === WORKSPACE_TAB.GIT && <GitTab git={snapshot.git} />}
        </div>
      ))}
      <footer className="gc-workspace__footer">Sample data · not connected yet</footer>
    </section>
  );
}

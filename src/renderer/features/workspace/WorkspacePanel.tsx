import { useId, useState, type KeyboardEvent } from "react";
import { WorkspaceDataContainer } from "./WorkspaceDataContainer";
import { OddTab } from "./components/OddTab";
import type { WorkspaceSnapshot } from "./types";
import "./WorkspacePanel.css";

export const WORKSPACE_TAB = { FILES: "files", ODD: "odd", GIT: "git" } as const;
export type WorkspaceTab = (typeof WORKSPACE_TAB)[keyof typeof WORKSPACE_TAB];

export interface WorkspacePanelProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly chatId?: string;
  readonly ready?: boolean;
}

const tabs = [WORKSPACE_TAB.FILES, WORKSPACE_TAB.ODD, WORKSPACE_TAB.GIT];
const labels = { files: "Files", odd: "ODD", git: "Git" };

// Keeps tab navigation separate from the bridge-backed data container.
export function WorkspacePanel({ snapshot, chatId = "new", ready = true }: WorkspacePanelProps) {
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
            aria-controls={`${id}-${tab === "odd" ? "odd" : "data"}-panel`} aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1} className="gc-workspace__tab"
            onClick={() => setActive(tab)} onKeyDown={(event) => navigate(event, tab)}>
            {labels[tab]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-odd-panel`} aria-labelledby={`${id}-odd-tab`}
        hidden={active !== WORKSPACE_TAB.ODD} tabIndex={0} className="gc-workspace__pane">
        <OddTab odd={snapshot.odd} />
      </div>
      <div role="tabpanel" id={`${id}-data-panel`}
        aria-labelledby={`${id}-${active === "git" ? "git" : "files"}-tab`}
        hidden={active === WORKSPACE_TAB.ODD} tabIndex={0} className="gc-workspace__pane">
        <WorkspaceDataContainer key={`${chatId}-${ready}`} tab={active} ready={ready} />
      </div>
      <footer className="gc-workspace__footer">Sample data · not connected yet</footer>
    </section>
  );
}

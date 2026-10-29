import { useId, useState, type KeyboardEvent } from "react";
import { WorkspaceDataContainer, type GitState } from "./WorkspaceDataContainer";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import "./WorkspacePanel.css";

export const WORKSPACE_TAB = { FILES: "files", GIT: "git" } as const;
export type WorkspaceTab = (typeof WORKSPACE_TAB)[keyof typeof WORKSPACE_TAB];

export interface WorkspacePanelProps {
  readonly chatId?: string;
  readonly ready?: boolean;
  readonly onGitChange?: (git: GitState) => void;
}

const tabs = [WORKSPACE_TAB.FILES, WORKSPACE_TAB.GIT];
const labels = { files: "Files", git: "Git" };

// Keeps tab navigation separate from the bridge-backed data container.
export function WorkspacePanel({ chatId = "new", ready = true, onGitChange }: WorkspacePanelProps) {
  const bridge = useBridge();
  const [active, setActive] = useState<WorkspaceTab>(WORKSPACE_TAB.FILES);
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
            aria-controls={`${id}-data-panel`} aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1} className="gc-workspace__tab"
            onClick={() => setActive(tab)} onKeyDown={(event) => navigate(event, tab)}>
            {labels[tab]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-data-panel`}
        aria-labelledby={`${id}-${active === "git" ? "git" : "files"}-tab`}
        tabIndex={0} className="gc-workspace__pane">
        <WorkspaceDataContainer key={`${chatId}-${ready}`} tab={active} ready={ready} onGitChange={onGitChange} />
      </div>
      {bridge === mockBridge && <footer className="gc-workspace__footer">Preview data</footer>}
    </section>
  );
}

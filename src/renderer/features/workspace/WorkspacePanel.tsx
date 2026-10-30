import { useCallback, useId, useState, type KeyboardEvent } from "react";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { WorkspaceDataContainer, type GitState } from "./WorkspaceDataContainer";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import "./WorkspacePanel.css";

export const WORKSPACE_TAB = { FILES: "files", GIT: "git" } as const;
export type WorkspaceTab = (typeof WORKSPACE_TAB)[keyof typeof WORKSPACE_TAB];

export interface WorkspacePanelProps {
  readonly chatId?: string;
  readonly cwd?: string;
  readonly ready?: boolean;
  readonly onGitChange?: (git: GitState) => void;
  readonly onOpenFile?: (path: string) => void;
}

const tabs = [WORKSPACE_TAB.FILES, WORKSPACE_TAB.GIT];
const labels = { files: "Files", git: "Git" };

// Keeps tab navigation separate from the bridge-backed data container.
export function WorkspacePanel({ chatId = "new", cwd, ready = true, onGitChange, onOpenFile }: WorkspacePanelProps) {
  const bridge = useBridge();
  const [active, setActive] = useState<WorkspaceTab>(WORKSPACE_TAB.FILES);
  const id = useId();
  const [gitSnapshot, setGitSnapshot] = useState<{ chatId: string; git: GitState }>();
  const receiveGit = useCallback((git: GitState) => {
    setGitSnapshot({ chatId, git });
    onGitChange?.(git);
  }, [chatId, onGitChange]);
  const git = ready && gitSnapshot?.chatId === chatId ? gitSnapshot.git : undefined;
  const changeCount = git?.status === "ready" ? git.changed.length : 0;

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
            aria-label={labels[tab]} aria-controls={`${id}-data-panel`} aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1} className="gc-workspace__tab"
            onClick={() => setActive(tab)} onKeyDown={(event) => navigate(event, tab)}>
            <WorkspaceIcon name={tab === "files" ? "folder" : "branch"} />{labels[tab]}
            {tab === "git" && changeCount > 0 && <span className="gc-workspace__count" aria-hidden="true">{changeCount}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-data-panel`}
        aria-labelledby={`${id}-${active === "git" ? "git" : "files"}-tab`}
        tabIndex={0} className="gc-workspace__pane">
        <WorkspaceDataContainer key={`${chatId}-${ready}`} tab={active} ready={ready} cwd={cwd} onGitChange={receiveGit} onOpenFile={onOpenFile} />
      </div>
      {bridge === mockBridge && <footer className="gc-workspace__footer">Preview data</footer>}
    </section>
  );
}

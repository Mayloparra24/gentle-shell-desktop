import { useId, useRef, useState } from "react";
import type { HelpersActivity } from "@shared/bridge-types";
import { trapTab, useModalFocus } from "@renderer/features/settings/useModalFocus";
import { formatElapsed, formatMetaLine, formatSummaryLine } from "./format";
import { HelperThread } from "./components/HelperThread";
import "@renderer/features/settings/SettingsDialog.css";
import "./AgentsDialog.css";

export interface AgentsDialogProps {
  readonly activity?: HelpersActivity;
  readonly onClose: () => void;
}

export function AgentsDialog({ activity, onClose }: AgentsDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const tasks = activity?.tasks ?? [];
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  useModalFocus(ref);
  return <div className="gc-settings-scrim">
    <div className="gc-settings gc-agents" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={ref} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      trapTab(event);
    }}>
      <header className="gc-agents__header"><h2 id={`${id}-title`}>Agents & jobs</h2><button type="button" aria-label="Close agents and jobs" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
      {!selected ? <div className="gc-agents__empty"><h3>No agents or jobs yet</h3><p>Helpers started by Gentle appear here while they work.</p></div> : <div className="gc-agents__body">
        <div className="gc-agents__list-pane">
          {activity && Object.values(activity.summary).some((count) => count > 0) && <p className="gc-agents__summary">{formatSummaryLine(activity.summary)}</p>}
          <div className="gc-agents__list" role="group" aria-label="Agents">
            {tasks.map((task, index) => <button type="button" className="gc-agents__row" key={task.id} aria-current={task.id === selected.id ? "true" : undefined}
              ref={(node) => { rows.current[index] = node; }} onClick={() => setSelectedId(task.id)} onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const next = (index + (event.key === "ArrowDown" ? 1 : -1) + tasks.length) % tasks.length;
                setSelectedId(tasks[next]!.id); rows.current[next]?.focus();
              }}>
              <span className="gc-agents__dot" data-status={task.status} title={task.status} />
              <span className="gc-agents__label"><strong>{task.label}</strong><small>{formatMetaLine(task)}</small></span>
              <span className="gc-agents__tag">Agent</span>
            </button>)}
          </div>
        </div>
        <section className="gc-agents__detail" aria-label="Selected agent">
          <h3><span className="gc-agents__dot" data-status={selected.status} />{selected.label}{" "}<span className="gc-agents__tag">Agent</span></h3>
          <p className="gc-agents__sub">{[selected.agent, formatElapsed(selected)].filter(Boolean).join(" · ")}</p>
          <dl className="gc-agents__values">
            <div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Turns</dt><dd>{selected.turns}</dd></div>
            <div><dt>Tool calls</dt><dd>{selected.toolCalls}</dd></div><div><dt>Last step</dt><dd>{selected.lastStep ?? "—"}</dd></div>
          </dl>
          <h4>Task</h4><p className="gc-agents__prompt">{selected.prompt}</p>
          <h4>Thread</h4><HelperThread task={selected} showToolDetails={false} followLive={false} showHeader={false} />
        </section>
      </div>}
    </div>
  </div>;
}

import { useId, useRef, useState } from "react";
import type { FinishedJob, HelpersActivity, JobsActivity } from "@shared/bridge-types";
import { trapTab, useModalFocus } from "@renderer/features/settings/useModalFocus";
import { formatElapsed, formatMetaLine, formatSummaryLine } from "./format";
import { HelperThread } from "./components/HelperThread";
import "@renderer/features/settings/SettingsDialog.css";
import "./AgentsDialog.css";

export interface AgentsDialogProps {
  readonly activity?: HelpersActivity;
  readonly jobs?: JobsActivity;
  readonly onClose: () => void;
}

export function AgentsDialog({ activity, jobs, onClose }: AgentsDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<"All" | "Agents" | "Jobs">("All");
  const allTasks = activity?.tasks ?? [];
  const finished = jobs?.finished ?? [];
  const running = jobs?.running ?? 0;
  const jobCount = finished.length + running;
  const activeFilter = jobCount > 0 ? filter : "All";
  const tasks = activeFilter === "Jobs" ? [] : allTasks;
  const visibleJobs = activeFilter === "Agents" ? [] : finished;
  const items = [...tasks.map(task => `agent:${task.id}`), ...visibleJobs.map(job => `job:${job.id}`)];
  const currentId = items.includes(selectedId ?? "") ? selectedId : items[0];
  const selected = tasks.find(task => `agent:${task.id}` === currentId);
  const selectedJob = visibleJobs.find(job => `job:${job.id}` === currentId);
  const summary = { running: (activity?.summary.running ?? 0) + running, queued: activity?.summary.queued ?? 0,
    waiting: activity?.summary.waiting ?? 0, finished: (activity?.summary.finished ?? 0) + finished.length };
  const moveRow = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    setSelectedId(items[next]); rows.current[next]?.focus();
  };
  useModalFocus(ref);
  return <div className="gc-settings-scrim">
    <div className="gc-settings gc-agents" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={ref} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      trapTab(event);
    }}>
      <header className="gc-agents__header"><h2 id={`${id}-title`}>Agents & jobs</h2><button type="button" aria-label="Close agents and jobs" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
      {allTasks.length === 0 && jobCount === 0 ? <div className="gc-agents__empty"><h3>No agents or jobs yet</h3><p>Helpers started by Gentle appear here while they work.</p></div> : <div className="gc-agents__body">
        <div className="gc-agents__list-pane">
          {jobCount > 0 && <div className="gc-agents__filters" role="tablist" aria-label="Filter agents and jobs">
            {(["All", "Agents", "Jobs"] as const).map((name, index, names) => <button type="button" role="tab" key={name}
              aria-selected={activeFilter === name} tabIndex={activeFilter === name ? 0 : -1}
              onClick={() => setFilter(name)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
                setFilter(names[next]!);
                (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
              }}>{name} {name === "All" ? allTasks.length + jobCount : name === "Agents" ? allTasks.length : jobCount}</button>)}
          </div>}
          {Object.values(summary).some((count) => count > 0) && <p className="gc-agents__summary">{formatSummaryLine(summary)}</p>}
          <div className="gc-agents__list" role="group" aria-label={jobCount > 0 ? "Agents and jobs" : "Agents"}>
            {running > 0 && activeFilter !== "Agents" && <div className="gc-agents__running"><span className="gc-agents__dot" data-status="running" /><div>{running} job{running === 1 ? "" : "s"} running<small>Details appear when each job finishes.</small></div></div>}
            {tasks.map((task, index) => <button type="button" className="gc-agents__row" key={task.id} aria-current={`agent:${task.id}` === currentId ? "true" : undefined}
              ref={(node) => { rows.current[index] = node; }} onClick={() => setSelectedId(`agent:${task.id}`)} onKeyDown={event => moveRow(event, index)}>
              <span className="gc-agents__dot" data-status={task.status} title={task.status} />
              <span className="gc-agents__label"><strong>{task.label}</strong><small>{formatMetaLine(task)}</small></span>
              <span className="gc-agents__tag">Agent</span>
            </button>)}
            {visibleJobs.map((job, index) => <button type="button" className="gc-agents__row" key={`job:${job.id}`}
              aria-current={`job:${job.id}` === currentId ? "true" : undefined}
              ref={node => { rows.current[tasks.length + index] = node; }} onClick={() => setSelectedId(`job:${job.id}`)} onKeyDown={event => moveRow(event, tasks.length + index)}>
              <span className="gc-agents__dot" data-status={jobTone(job)} title={job.status} />
              <span className="gc-agents__label"><strong>{job.label}</strong><small>{job.status}</small></span><span className="gc-agents__tag">Job</span>
            </button>)}
          </div>
        </div>
        {selectedJob && <JobDetail job={selectedJob} />}
        {selected && <section className="gc-agents__detail" aria-label="Selected agent">
          <h3><span className="gc-agents__dot" data-status={selected.status} />{selected.label}{" "}<span className="gc-agents__tag">Agent</span></h3>
          <p className="gc-agents__sub">{[selected.agent, formatElapsed(selected)].filter(Boolean).join(" · ")}</p>
          <dl className="gc-agents__values">
            <div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Turns</dt><dd>{selected.turns}</dd></div>
            <div><dt>Tool calls</dt><dd>{selected.toolCalls}</dd></div><div><dt>Last step</dt><dd>{selected.lastStep ?? "—"}</dd></div>
          </dl>
          <h4>Task</h4><p className="gc-agents__prompt">{selected.prompt}</p>
          <h4>Thread</h4><HelperThread task={selected} showToolDetails={false} followLive={false} showHeader={false} />
        </section>}
      </div>}
    </div>
  </div>;
}

function jobTone(job: FinishedJob): string {
  return job.status === "exited" ? job.exitCode === 0 ? "done" : job.exitCode === undefined ? "exited" : "failed" : job.status;
}

function JobDetail({ job }: { readonly job: FinishedJob }) {
  return <section className="gc-agents__detail" aria-label="Selected job">
    <h3><span className="gc-agents__dot" data-status={jobTone(job)} />{job.label} <span className="gc-agents__tag">Job</span></h3>
    <p className="gc-agents__sub">Background command</p>
    <dl className="gc-agents__values gc-agents__values--job">
      <div><dt>Status</dt><dd>{job.status}</dd></div><div><dt>Exit code</dt><dd>{job.exitCode ?? "—"}</dd></div><div><dt>Kind</dt><dd>{job.kind}</dd></div>
    </dl>
    <h4>Command</h4><pre className="gc-agents__command">{job.command ?? "—"}</pre>
    <h4>Last output</h4><pre className="gc-agents__log">{job.lastOutput ?? "—"}</pre>
    <h4>Full output</h4><p className="gc-agents__command">{job.outputPath ?? "—"}</p>
  </section>;
}

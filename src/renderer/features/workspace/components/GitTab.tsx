import { useEffect, useRef, useState } from "react";
import type { GitWritePlan, GitWriteRequest } from "@shared/git-write-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { GitWriteConfirmation } from "./GitWriteConfirmation";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { GitStatus } from "./GitStatus";
import { Button } from "@renderer/shared/ui/atoms/Button";
import type { GitState } from "../WorkspaceDataContainer";
import "./GitTab.css";

export interface GitTabProps {
  readonly git: GitState;
  readonly onRefresh: () => void;
}

export function GitTab({ git, onRefresh }: GitTabProps) {
  const bridge = useBridge();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; warning: boolean }>();
  const [dialog, setDialog] = useState<{ plan: GitWritePlan; request: GitWriteRequest; token: number }>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const alive = useRef(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const previous = useRef(git);
  if (previous.current !== git) { previous.current = git; generation.current += 1; }
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; }; }, []);
  useEffect(() => { setDialog(undefined); setBusy(false); setApplying(false); locked.current = false; }, [git]);
  useEffect(() => {
    if (busy || dialog || !restoreFocus.current) return;
    const target = trigger.current?.isConnected && !trigger.current.matches(":disabled") ? trigger.current : root.current?.querySelector<HTMLElement>('button[aria-label="Refresh"]');
    if (target) { target.focus(); restoreFocus.current = false; }
  }, [busy, dialog, git]);
  const contextId = git.status === "ready" ? git.contextId : undefined;
  function valid(token: number) { return alive.current && generation.current === token; }
  function release() { locked.current = false; restoreFocus.current = true; setBusy(false); setApplying(false); }
  function refresh() { if (applying) return; generation.current += 1; setDialog(undefined); onRefresh(); }
  function failed() { setOutcome({ text: "Git operation failed. Check repository state and existing credentials in a terminal before trying a new action. No write was retried; effects may be uncertain.", warning: true }); }
  async function apply(plan: GitWritePlan, token: number, context: string) {
    if (!valid(token)) return;
    setDialog(undefined);
    setApplying(true);
    try {
      const result = await bridge.gitApply(context, plan.planId);
      if (!valid(token)) return;
      setOutcome({ text: result.status === "partial" ? "Sync partially completed: pull succeeded, push did not complete. Inspect local and remote state before a new action. No retry was attempted." : `${plan.kind} completed.`, warning: result.status === "partial" });
      if (plan.kind === "commit" && result.status === "success") setMessage("");
    } catch { if (valid(token)) failed(); }
    if (valid(token)) { release(); onRefresh(); }
  }
  async function prepare(request: GitWriteRequest, token: number, context: string) {
    try {
      const plan = await bridge.gitPlan(context, request);
      if (!valid(token)) return;
      if (plan.needsTrust || (request.kind !== "stage" && request.kind !== "unstage")) setDialog({ plan, request, token });
      else await apply(plan, token, context);
    } catch { if (valid(token)) { failed(); release(); } }
  }
  function start(request: GitWriteRequest) {
    if (!contextId || locked.current) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    locked.current = true; setBusy(true); setOutcome(undefined);
    void prepare(request, generation.current, contextId);
  }
  async function confirm() {
    if (!dialog || !contextId || !valid(dialog.token)) return;
    const captured = dialog;
    setDialog(undefined);
    if (!captured.plan.needsTrust) { await apply(captured.plan, captured.token, contextId); return; }
    try {
      await bridge.gitTrust(contextId, captured.plan.planId);
      if (valid(captured.token)) await prepare(captured.request, captured.token, contextId);
    } catch { if (valid(captured.token)) { failed(); release(); } }
  }
  const notice = outcome && <p role={outcome.warning ? "alert" : "status"} className={outcome.warning ? "gc-git__warning" : undefined}>{outcome.text}</p>;
  if (git.status === "loading") return <div>{notice}<p>Loading…</p></div>;
  if (git.status === "error") return <div>{notice}<p>{git.message}</p><Button type="button" onClick={refresh}>Retry</Button></div>;
  if (git.status !== "ready") {
    const messages = {
      "no-chat-folder": "Choose a folder to see its Git status.",
      "not-a-repository": "This folder is not a Git repository.",
      "git-unavailable": "Git is not installed or not on PATH.",
    };
    return <div>{notice}<p>{messages[git.status]}</p></div>;
  }
  const staged = git.changed.filter(change => change.code[0] !== " " && change.code[0] !== "?");
  const unstaged = git.changed.filter(change => change.code === "??" || change.code[1] !== " ");
  const groups = contextId ? [{ name: "Staged changes", files: staged, action: "unstage" as const }, { name: "Unstaged changes", files: unstaged, action: "stage" as const }] : [{ name: "Changes", files: git.changed, action: undefined }];
  return <div className="gc-git" ref={root}>
    {notice}
    {dialog && dialog.token === generation.current && <GitWriteConfirmation key={dialog.plan.planId} plan={dialog.plan} onCancel={() => { setDialog(undefined); release(); }} onConfirm={() => void confirm()} />}
    <div inert={dialog !== undefined}>
    <div className="gc-git__branch"><span className="gc-git__branch-info"><WorkspaceIcon name="branch" /><span>{git.branch}</span></span>
      <Button type="button" variant="ghost" aria-label="Refresh" disabled={applying} onClick={refresh}><WorkspaceIcon name="refresh" /></Button></div>
    <h3 className="gc-git__heading">Changes · {git.changed.length}</h3>
    {git.changed.length === 0 && <p>No changes.</p>}
    {groups.map(group => <section key={group.name}>
    {contextId && <h3 className="gc-git__heading">{group.name} · {group.files.length}</h3>}
    <ul className="gc-git__changes" aria-label={group.name}>
      {group.files.map(change => <li key={change.path} className="gc-git__change">
        <span className="gc-git__path" title={change.path}><span>{change.path.split("/").at(-1)}</span>{change.path.includes("/") && <small>{change.path.slice(0, change.path.lastIndexOf("/"))}</small>}</span>
        <GitStatus code={change.code} />
        {group.action && <Button type="button" variant="ghost" disabled={busy} aria-label={`${group.action === "stage" ? "Stage" : "Unstage"} ${change.path}`} onClick={() => start({ kind: group.action!, path: change.path })}>{group.action === "stage" ? "Stage" : "Unstage"}</Button>}
      </li>)}
    </ul></section>)}
    {git.truncatedChanges && <small>Showing the first 500 changes</small>}
    {contextId && <div className="gc-git__writes">
      <label>Commit message<textarea value={message} maxLength={20000} disabled={busy} onChange={event => setMessage(event.target.value)} /></label>
      <Button type="button" disabled={busy || !message.trim() || !staged.length} onClick={() => start({ kind: "commit", message })}>Commit staged</Button>
      <div className="gc-git__remote">{(["push", "pull", "sync"] as const).map(kind => <Button key={kind} type="button" variant="ghost" disabled={busy} onClick={() => start({ kind })}>{kind[0]!.toUpperCase() + kind.slice(1)}</Button>)}</div>
      <small>Pull and Sync require a clean worktree; pull is fast-forward only.</small>
    </div>}
    <h3 className="gc-git__heading">Recent commits</h3>
    {git.commits.length === 0 && <p>No commits yet.</p>}
    <ul className="gc-git__changes" aria-label="Recent commits">
      {git.commits.map(commit => <li key={commit.hash} className="gc-git__commit">
        <code title={commit.hash}>{commit.hash.slice(0, 7)}</code><span title={commit.subject}>{commit.subject}</span><small>{commit.relativeTime}</small>
      </li>)}
    </ul>
    </div>
  </div>;
}

import { useId, useRef } from "react";
import type { GitWritePlan } from "@shared/git-write-types";
import { Button } from "@renderer/shared/ui/atoms/Button";
import { trapTab, useModalFocus } from "../../settings/useModalFocus";
import "./GitWriteConfirmation.css";

export function GitWriteConfirmation({ plan, onCancel, onConfirm }: {
  readonly plan: GitWritePlan; readonly onCancel: () => void; readonly onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const consumed = useRef(false);
  const id = useId();
  useModalFocus(ref);
  function finish(callback: () => void) {
    if (consumed.current) return;
    consumed.current = true;
    callback();
  }
  return <div className="gc-git-confirm" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-details`} ref={ref} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); finish(onCancel); }
    trapTab(event);
  }}>
    <div className="gc-git-confirm__box">
      <h3 id={`${id}-title`}>{plan.needsTrust ? "Trust repository for this session?" : `Confirm ${plan.kind}`}</h3>
      <div id={`${id}-details`}>
        <p>Repository: <strong>{plan.repository}</strong></p>
        {plan.needsTrust ? <p>Trust lasts for this app session and must be renewed if repository identity or Git configuration changes. Configured hooks, filters, signing tools and credential programs can run with your privileges. Trust does not execute this action.</p> : <>
          <p>Branch: <strong>{plan.branch}</strong></p><p>{plan.summary}</p>
          {plan.kind === "commit" && <><h4>Staged files</h4><ul>{plan.files.map(file => <li key={file.path}>{file.path}</li>)}</ul><h4>Commit message</h4><pre>{plan.message}</pre></>}
          {plan.remote && <><p>Remote: {plan.remote.name}</p><p>Destination: {plan.remote.destination}</p>{plan.remote.pullUrl && <p>Pull from: {plan.remote.pullUrl}</p>}{plan.remote.pushUrl && <p>Push to: {plan.remote.pushUrl}</p>}</>}
          <p>Writes are never retried automatically. Inspect repository and remote state after any failure or uncertain result.</p>
        </>}
      </div>
      <div className="gc-git-confirm__actions"><Button type="button" variant="ghost" onClick={() => finish(onCancel)}>Cancel</Button><Button type="button" onClick={() => finish(onConfirm)}>{plan.needsTrust ? "Trust for this session" : "Confirm"}</Button></div>
    </div>
  </div>;
}

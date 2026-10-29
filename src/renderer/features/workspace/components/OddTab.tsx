import type { OddSnapshot } from "../types";
import "./OddTab.css";

export interface OddTabProps {
  readonly odd: OddSnapshot;
}

const markers = { done: "✓", current: "●", pending: "○" };

export function OddTab({ odd }: OddTabProps) {
  return (
    <div className="gc-odd">
      <ol className="gc-odd__phases" aria-label="Phases">
        {odd.phases.map((phase) => (
          <li key={phase.name} className={`gc-odd__phase gc-odd__phase--${phase.state}`}
            aria-current={phase.state === "current" ? "step" : undefined}>
            {phase.name}
          </li>
        ))}
      </ol>
      <h3 className="gc-odd__heading">{odd.title}</h3>
      <p className="gc-odd__document">{odd.document}</p>
      <ol className="gc-odd__tasks" aria-label="Tasks">
        {odd.tasks.map((task) => (
          <li key={task.title} className={`gc-odd__task gc-odd__task--${task.state}`}
            aria-current={task.state === "current" ? "step" : undefined}>
            <span className="gc-odd__marker" role="img" aria-label={task.state}>{markers[task.state]}</span>
            <div><span>{task.title}</span>{task.detail && <small>{task.detail}</small>}</div>
          </li>
        ))}
      </ol>
      <h3 className="gc-odd__heading gc-odd__heading--checks">Checks</h3>
      <dl className="gc-odd__checks">
        {odd.checks.map((check) => (
          <div key={check.label} className="gc-odd__check">
            <dt>{check.label}</dt><dd className={`gc-odd__value gc-odd__value--${check.tone}`}>{check.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

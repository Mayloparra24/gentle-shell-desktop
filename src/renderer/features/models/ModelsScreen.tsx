import { useId, useRef, useState } from "react";
import type { ProfileInfo, ProfilesSnapshot } from "@shared/bridge-types";
import "./ModelsScreen.css";

interface ModelsScreenProps {
  snapshot?: ProfilesSnapshot;
  onBack: () => void;
  onRetry: () => void;
}

export function ModelsScreen({ snapshot, onBack, onRetry }: ModelsScreenProps) {
  return (
    <section className="gc-models" aria-label="Models">
      <div className="gc-models__wrap">
        <button type="button" className="gc-models__back" onClick={onBack}>← Back to chat</button>
        <h1>Models</h1>
        <p className="gc-models__lead">Profiles decide which model and effort each agent uses. Same screen as <code>/gentle:profiles</code> in gentle-shell.</p>
        {!snapshot ? <div className="gc-models__skeleton" aria-label="Loading profiles" role="status"><span /><span /><span /></div>
          : snapshot.status === "error" ? <div className="gc-models__error" role="alert"><p>{snapshot.message ?? "Could not read profiles."}</p><button type="button" onClick={onRetry}>Retry</button></div>
          : snapshot.status === "unsupported" ? <p role="status">{snapshot.message ?? "This profiles format is not supported by this version."}</p>
          : snapshot.status === "none" || snapshot.profiles.length === 0 ? <div><h2>No profiles yet</h2><p>{snapshot.message ?? "gentle-shell creates profiles when you use /gentle:profiles."}</p></div>
          : <ProfileTabs key={snapshot.active} snapshot={snapshot} />}
      </div>
    </section>
  );
}

function ProfileTabs({ snapshot }: { snapshot: ProfilesSnapshot }) {
  const id = useId();
  const [selected, setSelected] = useState(() => Math.max(0, snapshot.profiles.findIndex((profile) => profile.name === snapshot.active)));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const profile = snapshot.profiles[selected] ?? snapshot.profiles[0];
  if (!profile) return null;
  return <>
    <div className="gc-models__tabs" role="tablist" aria-label="Profiles">
      {snapshot.profiles.map((item, index) => <button type="button" role="tab" key={item.name}
        id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1}
        ref={(node) => { tabs.current[index] = node; }} onClick={() => setSelected(index)} onKeyDown={(event) => {
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % snapshot.profiles.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + snapshot.profiles.length) % snapshot.profiles.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = snapshot.profiles.length - 1;
          else return;
          event.preventDefault(); setSelected(next); tabs.current[next]?.focus();
        }}>
        {item.name}{item.name === snapshot.active && <span className="gc-models__star" title="Default for new sessions" aria-label="Default for new sessions">★</span>}
      </button>)}
    </div>
    <div className="gc-models__card" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}>
      <h2>{profile.name}</h2>
      <p className="gc-models__note">{profile.name === snapshot.active ? "Default for new sessions." : "Saved profile."}</p>
      <p className="gc-models__notice" role="status">Read-only for now. To change profiles, use /gentle:profiles in gentle-shell.</p>
      <ProfileTable profile={profile} />
      <p className="gc-models__legend">★ default for new sessions</p>
    </div>
  </>;
}

function ProfileTable({ profile }: { profile: ProfileInfo }) {
  const rows = [...(profile.orchestrator ? [{ agent: "Orchestrator", ...profile.orchestrator }] : []), ...profile.agents];
  return <div className="gc-models__table-scroll"><table>
    <thead><tr><th scope="col">Agent</th><th scope="col">Model</th><th scope="col">Effort</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index} className={profile.orchestrator && index === 0 ? "gc-models__orchestrator" : undefined}>
      <th scope="row">{row.agent}</th>
      <td>{row.model ?? <span className="gc-models__inherit">inherit</span>}</td>
      <td>{row.thinking ?? <span className="gc-models__inherit">inherit</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}

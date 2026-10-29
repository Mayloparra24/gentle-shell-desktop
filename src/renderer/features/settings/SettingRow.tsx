import type { SettingRowDefinition } from "./catalog";
import type { SettingsRowState } from "./useSettings";
import "./SettingRow.css";

export function SettingRow({ definition, state, onChange, onRetry }: {
  definition: SettingRowDefinition;
  state: SettingsRowState;
  onChange: (value: string) => void;
  onRetry: () => void;
}) {
  if (state.unavailable) return null;
  const disabled = state.loading || state.pending || definition.readOnly;
  return (
    <div className="gc-setting-row">
      <div>
        <div className="gc-setting-row__title">{definition.title}</div>
        <p>{definition.description}</p>
        <div className="gc-setting-row__meta">
          <code>{definition.command}</code>
          {state.loading ? <span className="gc-setting-row__skeleton" aria-label="Loading current value" /> : <span>current: <span className={state.value ? "gc-setting-row__value" : "gc-setting-row__unknown"}>{state.value ?? "unknown"}</span></span>}
          {!state.loading && !state.value && !state.error && <button type="button" onClick={onRetry}>Retry</button>}
          {state.applied && <span className="gc-setting-row__applied" role="status">Applied</span>}
        </div>
        {state.error && <div className="gc-setting-row__error" role="alert">{state.error} <button type="button" disabled={state.pending || state.loading} onClick={onRetry}>Retry</button></div>}
      </div>
      {definition.options ? (
        <div className="gc-settings-segment" role="group" aria-label={definition.title}>
          {definition.options.map((value) => <button type="button" key={value} aria-pressed={state.value === value} disabled={disabled} onClick={() => { if (state.value !== value) onChange(value); }}>{value}</button>)}
        </div>
      ) : (
        <button type="button" className="gc-setting-row__switch" role="switch" aria-label={definition.title} aria-checked={state.value === "on"} disabled={disabled || !state.value} onClick={() => onChange(state.value === "on" ? "off" : "on")} />
      )}
    </div>
  );
}

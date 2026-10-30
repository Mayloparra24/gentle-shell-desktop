import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { DiagnosticKind, HomeMode, HomeStatus, SettingKey } from "@shared/bridge-types";
import { THEMES, type ThemeId } from "@renderer/shared/theme/themes";
import { DIAGNOSTICS, SECTIONS, SETTING_ROWS } from "./catalog";
import { SettingRow } from "./SettingRow";
import type { SettingsRows } from "./useSettings";
import { trapTab, useModalFocus } from "./useModalFocus";
import "./SettingsDialog.css";

export interface SettingsDialogProps {
  rows: SettingsRows;
  error?: string;
  onReload: () => void;
  onRetry: (key: SettingKey) => void;
  onChange: (key: SettingKey, value: string) => void;
  onClose: () => void;
  onOpenModels?: () => void;
  themeId: ThemeId;
  onChangeTheme: (id: ThemeId) => void;
  home?: HomeStatus;
  homePending: boolean;
  homeError?: string;
  onChooseHome: (mode: HomeMode) => void;
  onRetryHome: () => void;
  diagnostic: { pending: boolean; output?: string; error?: string };
  onDiagnostic: (kind: DiagnosticKind) => void;
  confirmation?: ReactNode;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const id = useId();
  const [section, setSection] = useState<string>("Home");
  const [themeApplied, setThemeApplied] = useState(false);
  const themeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useModalFocus(ref);
  useEffect(() => () => clearTimeout(themeTimer.current), []);
  return (
    <div className="gc-settings-scrim">
      <div className="gc-settings" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={ref} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); props.onClose(); }
        trapTab(event);
      }}>
        <div className="gc-settings__layout" inert={!!props.confirmation}>
          <header><h2 id={`${id}-title`}>Settings</h2><button type="button" aria-label="Close settings" onClick={props.onClose}>✕</button></header>
          <nav aria-label="Settings sections">
            {SECTIONS.map((name) => <button type="button" key={name} aria-current={section === name ? "true" : undefined} onClick={() => {
              setSection(name);
              const target = document.getElementById(`${id}-${name}`);
              if (target && scroll.current) scroll.current.scrollTop = target.offsetTop - scroll.current.offsetTop;
            }}>{name}</button>)}
          </nav>
          <div className="gc-settings__scroll" ref={scroll}>
            <p className="gc-settings__intro">Most settings belong to gentle-shell, so your terminal sees the same values. Changes run silently and do not appear in your chat.</p>
            {props.error && <div className="gc-settings__error" role="alert">{props.error} <button type="button" onClick={props.onReload}>Retry</button></div>}
            {SECTIONS.map((name) => (
              <section className="gc-settings__section" id={`${id}-${name}`} key={name} aria-labelledby={`${id}-${name}-heading`}>
                <h3 id={`${id}-${name}-heading`}>{name}</h3>
                {name === "Home" && <>
                  <h4>Where Gentle Shell Desktop keeps your setup</h4>
                  <p>Your sign-in, models, packages and chats live in one home. Choose which one this app uses.</p>
                  {!props.home && !props.homeError && <span className="gc-setting-row__skeleton" aria-label="Loading current value" />}
                  {props.home && <div className="gc-settings__homes" role="radiogroup" aria-label="Home">
                    {([{ mode: "link", label: ".pi", detail: "Your pi setup" }, { mode: "isolated", label: ".gentle-shell", detail: "Gentle's own space" }] as const).map(({ mode, label, detail }) => {
                      const current = props.home!.mode === mode;
                      const missing = mode === "link" && !props.home!.detection.found;
                      return <button type="button" className="gc-settings__home" role="radio" aria-checked={current} disabled={props.homePending || missing} key={mode} onClick={() => { if (!current) props.onChooseHome(mode); }}>
                        <span className="gc-settings__radio" aria-hidden="true" />
                        <span><strong>{label}</strong><small>{detail}{current ? " · current" : ""}</small>
                          {current ? <code>{props.home!.dir}</code> : mode === "link" ? <code>{props.home!.detection.dir}</code> : null}
                          {missing && <small>No pi folder detected. Use Gentle's own space instead.</small>}
                        </span>
                      </button>;
                    })}
                  </div>}
                  {props.homeError && <div role="alert" className="gc-settings__error">{props.homeError} <button type="button" disabled={props.homePending} onClick={props.onRetryHome}>Retry</button></div>}
                  <div className="gc-settings__note"><b>What switching does:</b> the chat list reloads from the chosen home and the open chat closes. Nothing is copied, moved or deleted, and you can switch back at any time.</div>
                </>}
                {name === "Models" && <div className="gc-setting-row">
                  <div><div className="gc-setting-row__title">Profiles, models and effort</div><p>View the profiles, models and effort used by each agent, as in /gentle:profiles in gentle-shell.</p></div>
                  <button type="button" className="gc-settings__button" onClick={props.onOpenModels}>Open models →</button>
                </div>}
                {name === "Appearance" && <div className="gc-setting-row">
                  <div><div className="gc-setting-row__title">Theme</div><p>Colors for this window. Saved in this browser</p><div className="gc-setting-row__meta">current: {props.themeId} {themeApplied && <span role="status" className="gc-setting-row__applied">Applied</span>}</div></div>
                  <div role="group" aria-label="Theme" className="gc-settings-segment">{THEMES.map((theme) => <button type="button" aria-pressed={props.themeId === theme.id} key={theme.id} onClick={() => {
                    if (props.themeId === theme.id) return;
                    props.onChangeTheme(theme.id); setThemeApplied(true);
                    clearTimeout(themeTimer.current);
                    themeTimer.current = setTimeout(() => setThemeApplied(false), 1800);
                  }}>{theme.label}</button>)}</div>
                </div>}
                {SETTING_ROWS.filter((row) => row.section === name).map((definition) => <SettingRow key={definition.key} definition={definition} state={props.rows[definition.key]} onChange={(value) => props.onChange(definition.key, value)} onRetry={() => props.onRetry(definition.key)} />)}
                {name === "Diagnostics" && <>
                  {DIAGNOSTICS.map((diagnostic) => <div className="gc-setting-row" key={diagnostic.kind}><div><div className="gc-setting-row__title">{diagnostic.title}</div><p>{diagnostic.description}</p><div className="gc-setting-row__meta"><code>{diagnostic.command}</code></div></div><button type="button" className="gc-settings__button" disabled={props.diagnostic.pending} onClick={() => props.onDiagnostic(diagnostic.kind)}>{diagnostic.title}</button></div>)}
                  {(props.diagnostic.pending || props.diagnostic.output !== undefined) && <pre className="gc-settings__output" role="status" aria-live="polite">{props.diagnostic.pending ? "Running diagnostics…" : props.diagnostic.output}</pre>}
                  {props.diagnostic.error && <div className="gc-settings__error" role="alert">{props.diagnostic.error}</div>}
                </>}
              </section>
            ))}
          </div>
        </div>
        {props.confirmation}
      </div>
    </div>
  );
}

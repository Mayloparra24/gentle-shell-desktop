import { useEffect, useRef, useState } from "react";
import type { DiagnosticKind, HomeMode, HomeStatus, SettingKey } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import type { ThemeId } from "@renderer/shared/theme/themes";
import { riskText } from "./catalog";
import { Confirmation } from "./Confirmation";
import { SettingsDialog } from "./SettingsDialog";
import { errorText, useSettings } from "./useSettings";
import "./SettingsContainer.css";

export interface SettingsContainerProps {
  onClose: () => void;
  onOpenModels?: () => void;
  onHomeChanged: () => void;
  homeVersion: number;
  themeId: ThemeId;
  onChangeTheme: (id: ThemeId) => void;
}

export function SettingsContainer({ onClose, onOpenModels, onHomeChanged, homeVersion, themeId, onChangeTheme }: SettingsContainerProps) {
  const bridge = useBridge();
  const settings = useSettings(bridge, homeVersion);
  const [home, setHome] = useState<HomeStatus>();
  const [homePending, setHomePending] = useState(false);
  const [homeError, setHomeError] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<{ pending: boolean; output?: string; error?: string }>({ pending: false });
  const [confirmation, setConfirmation] = useState<{ key: SettingKey; value: string; text: string }>();
  const generation = useRef(0);
  const homeBusy = useRef(false);
  const diagnosticBusy = useRef(false);

  useEffect(() => {
    const epoch = ++generation.current;
    setConfirmation(undefined);
    setDiagnostic({ pending: false });
    diagnosticBusy.current = false;
    bridge.homeStatus().then((status) => {
      if (generation.current === epoch) setHome(status);
    }).catch((cause: unknown) => {
      if (generation.current === epoch) setHomeError(errorText(cause));
    });
    return () => { generation.current += 1; };
  }, [bridge, homeVersion]);

  async function chooseHome(mode: HomeMode) {
    if (homeBusy.current) return;
    homeBusy.current = true;
    setHomePending(true); setHomeError(undefined);
    const epoch = generation.current;
    try {
      await bridge.chooseHome(mode);
      const status = await bridge.homeStatus();
      if (generation.current === epoch) setHome(status);
      // A persisted switch must reset App even if the user has closed this dialog.
      onHomeChanged();
    } catch (cause) {
      if (generation.current === epoch) setHomeError(`Could not switch home: ${errorText(cause)}`);
    } finally {
      homeBusy.current = false;
      if (generation.current === epoch) setHomePending(false);
    }
  }

  async function retryHome() {
    const epoch = generation.current;
    setHomeError(undefined);
    try {
      const status = await bridge.homeStatus();
      if (generation.current === epoch) setHome(status);
    } catch (cause) {
      if (generation.current === epoch) setHomeError(errorText(cause));
    }
  }

  async function runDiagnostic(kind: DiagnosticKind) {
    if (diagnosticBusy.current) return;
    diagnosticBusy.current = true;
    const epoch = generation.current;
    setDiagnostic({ pending: true });
    try {
      const output = await bridge.runDiagnostic(kind);
      if (generation.current === epoch) setDiagnostic({ pending: false, output });
    } catch (cause) {
      if (generation.current === epoch) setDiagnostic({ pending: false, error: errorText(cause) });
    } finally {
      if (generation.current === epoch) diagnosticBusy.current = false;
    }
  }

  function change(key: SettingKey, value: string) {
    if (homePending || settings.rows[key].loading || settings.rows[key].pending || settings.rows[key].value === value) return;
    const text = riskText(key, value);
    if (text) setConfirmation({ key, value, text });
    else void settings.change(key, value);
  }

  return <SettingsDialog rows={settings.rows} error={settings.error} onReload={settings.reload} onRetry={settings.retry} onChange={change}
    onOpenModels={() => { onClose(); onOpenModels?.(); }} onClose={onClose} themeId={themeId} onChangeTheme={onChangeTheme} home={home} homePending={homePending} homeError={homeError}
    onChooseHome={chooseHome} onRetryHome={retryHome} diagnostic={diagnostic} onDiagnostic={runDiagnostic}
    confirmation={confirmation && <Confirmation text={confirmation.text} onCancel={() => setConfirmation(undefined)} onConfirm={() => {
      void settings.change(confirmation.key, confirmation.value); setConfirmation(undefined);
    }} />} />;
}

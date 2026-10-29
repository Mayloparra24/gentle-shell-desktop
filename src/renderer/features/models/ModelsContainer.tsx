import { useEffect, useState } from "react";
import type { ProfilesSnapshot } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { ModelsScreen } from "./ModelsScreen";
import "./ModelsContainer.css";

export function ModelsContainer({ onBack }: { onBack: () => void }) {
  const bridge = useBridge();
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSnapshot(undefined);
    bridge.readProfiles().then((result) => {
      if (!cancelled) setSnapshot(result);
    }).catch((cause: unknown) => {
      if (!cancelled) setSnapshot({ status: "error", message: cause instanceof Error ? cause.message : String(cause), profiles: [] });
    });
    return () => { cancelled = true; };
  }, [bridge, attempt]);
  return <ModelsScreen snapshot={snapshot} onBack={onBack} onRetry={() => setAttempt((value) => value + 1)} />;
}

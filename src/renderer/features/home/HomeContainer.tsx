import { useEffect, useRef, useState } from "react";
import type { HomeMode, HomeStatus } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { HomeSwitcher } from "./components/HomeSwitcher";
import "./HomeContainer.css";

export interface HomeContainerProps {
  readonly onChanged: (status: HomeStatus) => void;
}

export function HomeContainer({ onChanged }: HomeContainerProps) {
  const bridge = useBridge();
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const switching = useRef(false);

  useEffect(() => {
    let cancelled = false;
    bridge.homeStatus().then((loaded) => {
      if (!cancelled) setStatus(loaded);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(`Could not load home: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return () => {
      cancelled = true;
      request.current += 1;
      switching.current = false;
    };
  }, [bridge]);

  const handleChange = async (mode: HomeMode): Promise<void> => {
    if (switching.current || mode === status?.mode) return;
    switching.current = true;
    const current = ++request.current;
    setPending(true);
    setError(null);
    try {
      await bridge.chooseHome(mode);
      if (current !== request.current) return;
      const loaded = await bridge.homeStatus();
      if (current !== request.current) return;
      setStatus(loaded);
      onChanged(loaded);
    } catch (cause: unknown) {
      if (current === request.current) {
        setError(`Could not switch home: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    } finally {
      if (current === request.current) {
        switching.current = false;
        setPending(false);
      }
    }
  };

  return (
    <div className="gc-home">
      {status && <HomeSwitcher status={status} disabled={pending} onChange={handleChange} />}
      {error && <p className="gc-home__error" role="alert">{error}</p>}
    </div>
  );
}

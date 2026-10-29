import { useCallback, useEffect, useRef, useState } from "react";
import type { SlashCommand } from "@shared/bridge-types";

export type CommandsStatus = "idle" | "loading" | "ready" | "error";

export function useSlashCommands(load: () => Promise<SlashCommand[]>, resetKey: unknown) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [status, setStatus] = useState<CommandsStatus>("idle");
  const [error, setError] = useState<string>();
  const loader = useRef(load);
  loader.current = load;
  const generation = useRef(0);
  const requested = useRef(false);
  const started = useRef(false);

  const ensureLoaded = useCallback(() => {
    requested.current = true;
    if (started.current) return;
    started.current = true;
    const current = generation.current;
    setStatus("loading");
    // Promise wrapping also turns a synchronous loader throw into an error state.
    Promise.resolve().then(() => loader.current()).then((result) => {
      if (current !== generation.current) return;
      setCommands(result);
      setStatus("ready");
    }).catch((cause: unknown) => {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });
  }, []);

  useEffect(() => {
    started.current = false;
    setCommands([]);
    setError(undefined);
    setStatus("idle");
    if (requested.current) ensureLoaded();
    return () => { generation.current += 1; };
  }, [resetKey, ensureLoaded]);

  return { commands, status, error, ensureLoaded };
}

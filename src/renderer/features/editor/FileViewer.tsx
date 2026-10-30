import { Fragment, useEffect, useRef, useState } from "react";
import type { FileReadResult, FileViewerStatus } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { EditorIcon } from "./EditorIcon";
import "./FileViewer.css";

export interface FileViewerProps {
  readonly path?: string;
  readonly onStatusChange?: (status: FileViewerStatus | undefined) => void;
}

type ViewerState = FileReadResult | { readonly status: "loading" };

export function FileViewer({ path, onStatusChange }: FileViewerProps) {
  const bridge = useBridge();
  const parent = useRef<HTMLDivElement>(null);
  const callback = useRef(onStatusChange);
  callback.current = onStatusChange;
  const [result, setResult] = useState<ViewerState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setResult({ status: "loading" });
    callback.current?.(undefined);
    const editor = import("./codeMirror");
    void (async () => {
      try {
        const [file, module] = await Promise.all([bridge.readFile(path), editor]);
        if (cancelled) return;
        if (file.status === "ok" && parent.current) {
          destroy = await module.createSourceView(parent.current, file, status => callback.current?.(status), () => cancelled);
          if (cancelled) destroy?.();
        }
        if (!cancelled) setResult(file);
      } catch (cause) {
        if (!cancelled) setResult({ status: "error", message: cause instanceof Error ? cause.message : String(cause) });
      }
    })();
    return () => { cancelled = true; destroy?.(); };
  }, [bridge, path, retry]);

  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return <section className="gc-file-viewer" aria-label={path}>
    <div className="gc-file-viewer__bar">
      <div className="gc-file-viewer__crumbs" aria-label="File path" title={path}>
        {parts.map((part, index) => <Fragment key={index}>
          {index > 0 && <EditorIcon name="right" />}
          {index === parts.length - 1 ? <b>{part}</b> : <span>{part}</span>}
        </Fragment>)}
      </div>
      <span className="gc-file-viewer__tag"><EditorIcon name="lock" />Read-only</span>
    </div>
    {result.status === "loading" && <div className="gc-file-viewer__message gc-file-viewer__loading" role="status">
      <span>Loading source…</span><div className="gc-file-viewer__skeleton" aria-hidden="true"><i /><i /><i /></div>
    </div>}
    {result.status === "too-large" && <p className="gc-file-viewer__message">This file is {Math.ceil(result.size / 1024)} KB; the viewer opens files up to 1 MB.</p>}
    {result.status === "binary" && <p className="gc-file-viewer__message">Binary file; not shown.</p>}
    {result.status === "no-chat-folder" && <p className="gc-file-viewer__message">Choose a folder to see its files.</p>}
    {result.status === "error" && <div className="gc-file-viewer__message"><p>{result.message}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    <div className="gc-file-viewer__source" ref={parent} />
  </section>;
}

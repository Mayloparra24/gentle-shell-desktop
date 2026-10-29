import { useEffect, useId, useRef, useState } from "react";
import type { ChatState, ChatSummary, StartChatSource } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { Button } from "@renderer/shared/ui/atoms/Button";
import { trapTab, useModalFocus } from "@renderer/features/settings/useModalFocus";
import "@renderer/features/settings/SettingsDialog.css";
import "./FolderDialog.css";

export function FolderDialog({ onClose, onStarted }: {
  readonly onClose: () => void;
  readonly onStarted: (chat: ChatState) => void;
}) {
  const bridge = useBridge();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  useModalFocus(ref);
  useEffect(() => {
    let cancelled = false;
    bridge.listChats().then(chats => { if (!cancelled) setChats(chats); }).catch(() => {
      if (!cancelled) { setChats([]); setError("Could not load recent folders."); }
    });
    return () => { cancelled = true; };
  }, [bridge]);

  const seen = new Set<string>();
  const recent = [...(chats ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .filter(chat => {
      if (!chat.cwd || seen.has(chat.cwd)) return false;
      seen.add(chat.cwd);
      return true;
    }).slice(0, 8);

  async function start(source: StartChatSource) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await bridge.startChat(source);
      if (result.status === "chosen") onStarted(result.chat);
      else if (result.status === "error") setError(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setPending(false); }
  }

  return <div className="gc-settings-scrim">
    <div className="gc-folder-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} ref={ref}
      onKeyDown={event => {
        if (event.key === "Escape" && !pending) { event.preventDefault(); onClose(); }
        trapTab(event);
      }}>
      <header><h2 id={`${id}-title`}>Choose a folder</h2></header>
      <div className="gc-folder-dialog__body" aria-busy={pending}>
        <h3>Recent folders</h3>
        {!chats ? <p>Loading recent folders…</p> : recent.length === 0 ? <p>No recent folders yet.</p> :
          <ul aria-label="Recent folders">{recent.map(chat => <li key={chat.id}>
            <button type="button" disabled={pending} onClick={() => void start({ source: "fromChat", id: chat.id })}>
              <span>{chat.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? chat.cwd}</span>
              <small>{chat.cwd}</small>
            </button>
          </li>)}</ul>}
        {error && <p role="alert" className="gc-folder-dialog__error">{error}</p>}
      </div>
      <footer>
        <Button disabled={pending} onClick={() => void start({ source: "browse" })}>Browse…</Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      </footer>
    </div>
  </div>;
}

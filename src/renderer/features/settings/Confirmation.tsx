import { useId, useRef } from "react";
import { trapTab, useModalFocus } from "./useModalFocus";
import "./Confirmation.css";

export function Confirmation({ text, onCancel, onConfirm }: { text: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useModalFocus(ref);
  return (
    <div className="gc-settings-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-risk`} ref={ref} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      trapTab(event);
    }}>
      <div className="gc-settings-confirm__box">
        <h3 id={`${id}-title`}>Turn this on?</h3>
        <p id={`${id}-risk`}>{text}</p>
        <div className="gc-settings-confirm__actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="gc-settings-confirm__turn-on" onClick={onConfirm}>Turn on</button>
        </div>
      </div>
    </div>
  );
}

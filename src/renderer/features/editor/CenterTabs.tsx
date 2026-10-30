import { useRef, type KeyboardEvent } from "react";
import { EditorIcon } from "./EditorIcon";
import "./CenterTabs.css";

export interface CenterTabsProps {
  readonly id: string;
  readonly title: string;
  readonly paths: readonly string[];
  readonly active?: string;
  readonly onSelect: (path?: string) => void;
  readonly onClose: (path: string) => void;
}

export function CenterTabs({ id, title, paths, active, onSelect, onClose }: CenterTabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const views = [undefined, ...paths];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = views.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      onSelect(views[next]);
      list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }
  }
  return <div className="gc-center-tabs" role="tablist" aria-label="Open views" ref={list}>
    {views.map((path, index) => {
      const name = path?.split(/[\\/]/).at(-1) || title;
      return <div className="gc-center-tabs__item" data-selected={active === path} key={path === undefined ? "chat" : `file:${path}`}>
        <button className="gc-center-tabs__tab" type="button" role="tab" id={`${id}-tab-${index}`}
          aria-selected={active === path} aria-controls={`${id}-panel-${index}`} tabIndex={active === path ? 0 : -1}
          title={path ?? title} onClick={() => onSelect(path)} onKeyDown={event => navigate(event, index)}>
          <EditorIcon name={path ? "code" : "chat"} /><span>{name}</span>
        </button>
        {path && <button className="gc-center-tabs__close" type="button" aria-label={`Close ${name}`} onClick={() => {
          onClose(path);
          requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
        }}><EditorIcon name="close" /></button>}
      </div>;
    })}
  </div>;
}

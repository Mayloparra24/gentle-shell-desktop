import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { SlashCommand } from "@shared/bridge-types";
import { Button } from "@renderer/shared/ui/atoms/Button";
import { TextField } from "@renderer/shared/ui/atoms/TextField";
import { CommandMenu } from "@renderer/features/commands/components/CommandMenu";
import { visibleCommands } from "@renderer/features/commands/hiddenCommands";
import { filterCommands } from "@renderer/features/commands/filterCommands";
import { useSlashCommands } from "@renderer/features/commands/useSlashCommands";
import "./Composer.css";

export interface ComposerProps {
  readonly value: string;
  readonly working: boolean;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onAbort: () => void;
  readonly loadCommands?: () => Promise<SlashCommand[]>;
  readonly commandsResetKey?: unknown;
}

const emptyCommands = (): Promise<SlashCommand[]> => Promise.resolve([]);

/** Draft and bridge calls belong to the parent; only menu interaction lives here.
 * readOnly (not disabled) keeps the Escape abort shortcut reachable while working.
 */
export function Composer({ value, working, onChange, onSend, onAbort, loadCommands = emptyCommands, commandsResetKey }: ComposerProps) {
  const canSend = !working && value.trim().length > 0;
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const selectionPending = useRef(false);
  const menuId = useId();
  const { commands, status, error, ensureLoaded } = useSlashCommands(loadCommands, commandsResetKey);
  const matchesToken = /^\/\S*$/.test(value);
  const filtered = filterCommands(visibleCommands(commands, showAll), matchesToken ? value.slice(1) : "");
  const active = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  useEffect(() => {
    setOpen(matchesToken);
    setActiveIndex(0);
    if (matchesToken) ensureLoaded();
  }, [value, matchesToken, ensureLoaded]);

  useEffect(() => {
    if (!open) setShowAll(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!selectionPending.current) return;
    selectionPending.current = false;
    field.current?.focus();
    field.current?.setSelectionRange(value.length, value.length);
  }, [value]);

  useEffect(() => {
    if (open) document.getElementById(`${menuId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, menuId, active]);

  const pick = (command: SlashCommand): void => {
    if (working) return;
    selectionPending.current = true;
    onChange(`/${command.name} `);
    setOpen(false);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (open) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (filtered.length) setActiveIndex((active + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        const command = filtered[active];
        if (command) {
          event.preventDefault();
          pick(command);
          return;
        }
      }
    }
    if (event.key === "Escape") {
      if (working) onAbort();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <form className="gc-composer" onSubmit={handleSubmit} ref={(node) => { field.current = node?.querySelector("textarea") ?? null; }}>
      {open && <CommandMenu id={menuId} commands={filtered} activeIndex={active} status={status} error={error} onPick={pick} showAll={showAll} onToggleShowAll={() => { setShowAll(!showAll); setActiveIndex(0); }} />}
      <div className="gc-composer__box">
        <TextField
          multiline
          rows={1}
          aria-label="Message"
          aria-controls={open ? menuId : undefined}
          aria-activedescendant={open && filtered.length ? `${menuId}-${active}` : undefined}
          aria-autocomplete="list"
          placeholder="Tell Gentle what you need…"
          value={value}
          readOnly={working}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="button"
          variant="ghost"
          aria-label="Commands"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? menuId : undefined}
          onClick={() => {
            if (!value && !working) onChange("/");
            setActiveIndex(0);
            setOpen(true);
            ensureLoaded();
            field.current?.focus();
          }}
        >
          /
        </Button>
        <Button type="submit" className="gc-composer__send" disabled={!canSend}>
          Send
        </Button>
      </div>
      <p className="gc-composer__hints">
        <span>Enter to send</span>
        <span>Shift+Enter for a new line</span>
        <span>Esc to stop the agent</span>
        <span>/ for commands · ↑↓ to choose · Enter/Tab to insert · Esc to close</span>
      </p>
    </form>
  );
}

import type { SlashCommand } from "@shared/bridge-types";
import type { CommandsStatus } from "../useSlashCommands";
import "./CommandMenu.css";

export interface CommandMenuProps {
  readonly id: string;
  readonly commands: readonly SlashCommand[];
  readonly activeIndex: number;
  readonly status: CommandsStatus;
  readonly error?: string;
  readonly onPick: (command: SlashCommand) => void;
  readonly showAll?: boolean;
  readonly onToggleShowAll?: () => void;
}

/** Focus stays in the composer; aria-activedescendant identifies the active row. */
export function CommandMenu({ id, commands, activeIndex, status, error, onPick, showAll = false, onToggleShowAll }: CommandMenuProps) {
  return (
    <div className="gc-command-menu">
      <div id={id} role="listbox" aria-label="Commands" className="gc-command-menu__list" aria-busy={status === "loading"}>
        {commands.map((command, index) => (
          <div
            key={`${command.source}:${command.name}`}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className="gc-command-menu__option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(command)}
          >
            <span className="gc-command-menu__name">/{command.name}</span>
            <span className="gc-command-menu__description">{command.description}</span>
            <span className="gc-command-menu__source">{command.source}</span>
          </div>
        ))}
      </div>
      <div role="status" className="gc-command-menu__status">
        {error !== undefined ? `Could not load commands: ${error}` : status === "loading" ? "Loading commands…" : commands.length === 0 ? "No commands match" : null}
      </div>
      <div className="gc-command-menu__footer">
        <p>Pi's built-in commands such as /model are not available here.</p>
        <button type="button" className="gc-command-menu__toggle" aria-pressed={showAll} onMouseDown={(event) => event.preventDefault()} onClick={onToggleShowAll}>
          {showAll ? "Hide advanced commands" : "Show all commands"}
        </button>
      </div>
    </div>
  );
}

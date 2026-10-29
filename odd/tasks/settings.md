# Settings modal

Build the Settings modal from `design/gentle-web-settings/01-modal-sections.html` on top of the real gentle-shell. Stacked on `feat/home-and-commands`.
Out of scope for this feature: the models screen (own feature, `design/gentle-web-models/`), project trust, audio notifications and prompt history (no RPC command), persona (its `status` opens a dialog), repair commands, versions.

## Specs

- S1: "con ajustes sí" — a `Settings` button with a gear icon in the top bar opens the modal; it has a section list on the left and closes with Esc or the close button.
- S2: Sections and rows: Home (`.pi` / `.gentle-shell`), Appearance (Theme, local to this browser; Animations `quality|performance|potato`), Editing (Vim prompt editing; Double Esc to cancel), Permissions (Permission mode `normal|auto|yolo|super-yolo`; YOLO shown read-only), Workflow (Receipt-driven review; Background subagents), Privacy (Local telemetry), Diagnostics (Run diagnostics, Package status).
- S3: Each setting shows its current value read from the real gentle-shell `status` output. While reading it shows a loading bar; when it cannot be read it shows `unknown` with `Retry`.
- S4: Changing a setting runs the matching gentle-shell command silently (nothing is added to the chat), then reads `status` again to confirm it. A confirmed change shows `Applied`; a failed or unconfirmed change shows the error, keeps the previous value, and offers `Retry`.
- S5: Turning on `yolo` or `super-yolo` as permission mode, or enabling telemetry, asks first in a confirmation dialog with Cancel and the confirm button; Esc cancels.
- S6: YOLO cannot be enabled over RPC (gentle-shell: "activation requires an interactive primary TUI session"), so its row is read-only with that explanation.
- S7: Switching Home persists through `chooseHome`, reloads the chat list from the chosen home and starts a New chat; on failure it shows the error and keeps the previous home; `.pi` is disabled when no pi folder was detected.
- S8: The permission mode text says it applies to new chats, not the open one.
- S9: The web page never sends a command: the bridge exposes typed operations (read settings, set one setting to one allowed value, run one diagnostic) and the main process maps them to commands from a fixed allowlist.
- S10: Compatibility with any installed gentle-shell: a setting is shown only when its command is in gentle-shell's own command list (`get_commands`); a `status` text the app does not recognize reads as `unknown`, never as a guessed value; a write is only reported as applied after `status` confirms it. The app never edits gentle-shell or pi files by itself in this feature, only sends the allowlisted commands.
- S11: Tests and development never run the real gentle-shell; they use fake processes in temporary folders.

## Tasks

- [x] T1 (S3, S4, S6, S9) main and bridge: silent command runner in `PiSession`, settings service with parsers and allowlist, `ChatHost`, IPC, preload, mock bridge — inline — commit: f10811d
- [x] T2 (S1, S2, S3, S4, S5, S6, S8) renderer: Settings modal, sections, rows, states, confirmation — worker — commit: dfd926a
- [x] T3 (S7) Home section wired into `App` (reset chat, remount list) — worker, with T2 — commit: dfd926a

## Log

- L1: (user) "con ajustes sí" — answering "¿Empiezo por Ajustes como propongo, o prefieres arrancar por la pantalla de modelos?"; the design was approved with "me gusta sí".
- L2: (agent) Probed the real gentle-shell (`--isolated --mode rpc`) with read-only `status` commands and no-op writes (same value as already set). `status` replies arrive as `notify` text: `vim: off (decided by …)`, `animations: potato (…)`, `double-esc-cancel: off (…)`, `Permissions: NORMAL — default: NORMAL`, `YOLO OFF`, `receipt-driven development: on (decided by global)`, `background subagents: on (…)`, and telemetry as JSON with `enabled`. Writes: `/gentle:vim enable|disable`, `/gentle:animations <level>`, `/gentle:double-esc-cancel enable|disable`, `/gentle:mode default <mode>` (silent), `/gentle:review-mode`, `/gentle:background-subagents`, `/gentle:telemetry`. `/gentle:yolo` refuses activation over RPC. `/gentle:persona status` opens a dialog and never returns without an answer.
- L3: (agent) Startup `notify` messages (git root warning, assets ready, Ponytail) can arrive during the first command, so each parser selects only the message that matches its own pattern.
- L4: (agent) Finding for the user: this machine's telemetry is enabled by default (source: default).
- L5: (user) "es que no es que no edite ningun archivo, osea que edite lo que hace igual la TUI de gentle-shell osea lo normal, la idea es que cualquier persona que ya tengo gentle-shell instalado y luego descargué gentle-web ya se puede usar despues de elegir la carpeta de origen obvio, no se sí me captas y además esto no afecte nada de gentle-shell ni con lo normal ni con actualizaciones me entiendes?" Also: "No crees archivos en mi .gentle-shell por FAVOR, la idea es que estó sea por aparte y si hace falta algo me preguntas". Principle: gentle-web is a client of the user's installed gentle-shell; it may do what the TUI does, never more, and must not affect gentle-shell in normal use or across updates. Tests and development never run the real gentle-shell.
- L6: (user) "si porque la idea es ir actualizando gentle-web conforme va saliendo release de gentle-shell". Consequence: `src/main/domain/settings/settingsCatalog.ts` is the single table to review on each gentle-shell release (command names, status wording, allowed values); a setting the installed gentle-shell lacks is hidden, an unrecognized status reads as unknown. The wording above was observed on gentle-pi 4.5.0-main (the build installed on the maintainer machine).
- L7: (agent) T2 and T3 were delegated to one `gentle-ai-worker` run. Verified by the parent: 471 of 472 tests pass (the one failure is the existing `launcherLocator` Windows test), `tsc` clean, and a browser check with the mock bridge (no gentle-shell) showed the modal sections, a switch change, the risky-value confirmation (Esc cancels without changing the value), diagnostics output, Esc closing the dialog and focus returning to the Settings button.
- L8: (agent) The worker reported it had read (not changed) a skill file under the forbidden `~/.gentle-shell` while preparing. Nothing was written there and no real gentle-shell was run.
- L9: (agent) Not covered by this feature and not verified against the real gentle-shell: reading real values in the modal, and Home switching against a real session.

# Home switcher and slash commands

Let the user pick which home gentle-web uses (`.pi` or `.gentle-shell`) after first run, and run gentle-shell commands from the chat with `/` or a button. Builds on `feat/web-shell-mvp`.
Out of scope: real Files/Git/ODD data, Commit/PR actions, choosing another folder.

## Specs

- S1: (dropped, see L5) Choosing `.pi` or `.gentle-shell` stays a first-run-only choice, as it was.
- S2: (dropped, see L5) No switcher in the shell after first run.
- S3: "que haya ya la forma de ejecutar los comandos de gentle-shell con / o algún boton en el chat" — typing `/` at the start of the composer opens a menu of commands from pi's `get_commands` (extension commands, prompt templates, skills), filtered as the user types; ArrowUp/ArrowDown move, Enter or Tab inserts `/name `, Esc closes; a `/` button next to Send opens the same menu.
- S4: Sending a picked command goes through the normal send path (`prompt`), so the extension handles it. Built-in pi commands do not exist over RPC; the menu says so in one line instead of listing them.
- S5: If the commands cannot be loaded, the menu shows that and the composer keeps working as plain text.

## Tasks

- [x] T1 (S1, S2) home status in the bridge: shared type, IPC channel, main handler, preload, mock bridge — inline — commit: 1d360ea
- [x] T2 (S3, S5) commands in the bridge: `get_commands` through PiSession and ChatHost, IPC, preload, mock bridge — inline — commit: 1d360ea
- [-] T3 (S1, S2) home switcher UI and App wiring — worker — dropped, reverted in the commit that follows 2d12985
- [x] T4 (S3, S4, S5) composer slash menu and `/` button — worker — commit: ec30f38

## Log

- L1: (user) "si" — to starting with home + commands together, after: "has commit y push para seguir con lo demás, porque la idea es si elegir .pi o .gentle-shell para usar, como habiamos dicho hace tiempo, además veo que hay muchas cosas no funcionales, además que haya ya la forma de ejecutar los comandos de gentle-shell con / o algún boton en el chat"
- L2: (agent) Evidence: home args and the session store are re-read on every call (`ChatHost.performStart`, `createDynamicPiSessionStore`), so a persisted switch applies to the next open/new without a restart. Built-in pi commands are absent over RPC (docs/05-capability-inventory.md C12); `get_commands` lists extension commands, prompt templates and skills (docs/04-rpc-contract.md:120).
- L3: (agent) T3 and T4 were delegated to two `gentle-ai-worker` runs with disjoint edit surfaces. Verified together: 417 of 418 tests pass (the one failure is the existing `launcherLocator` Windows test), `tsc` clean, and a browser check showed the `/` menu filtering and inserting a command and the Home select switching to `.pi`.
- L4: (agent) A first T1/T2 commit accidentally staged the untracked `src/host/` spike files; it was amended before any push, and `src/host/` stays untracked.
- L5: (user) "eso de elegir arriba a la derecha si .pi o .gentle-shell no me gusta, la idea es que sea solo al iniciar por primera vez, como estaba." The home switcher (T3) was reverted; the first-run screen stays the only place to choose. The `homeStatus` bridge method from T1 stays but has no UI caller.
- L6: (agent) Checked against the real gentle-shell on this machine (`--isolated --mode rpc`): `get_commands` returns 107 commands, including every `/gentle:*`. `prompt "/gentle:status"` answers `disposition: "handled"` and the text arrives only as an `extension_ui_request` with `method: "notify"`, which the renderer does not show. `/gentle:commands` (a TUI menu) produces no visible output under RPC.

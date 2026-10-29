# Models screen, read-only first

Build the models screen from `design/gentle-web-models/` (profiles as tabs, a table with the orchestrator and agents) as a read-only view of the profiles gentle-shell already keeps. Stacked on `feat/settings`.
Out of this phase, pending the maintainer's go-ahead because they write his `profiles.json`: editing a model or effort, Save, Use in this session, Make default, New/Rename/Duplicate/Delete, Export/Import/Publish. Also out: the session-in-use marker and the repository pin marker (need live data).

## Specs

- S1: "lo del perfil, modelos y esfuerzos mejor que se pueda desde el chat y abra otra pantalla, y ahi uno configurar perfiles, todo igual como gentle-shell" — the model, effort and profile in the status bar are buttons that open the models screen; typing `/gentle:profiles` in the composer opens it instead of sending a message; Settings has a Models row that opens it.
- S2: The models screen has the profiles as tabs across the top, the active one marked `★`, a back button to the chat, and for the selected profile one table: the orchestrator first, then the agents, each with its model and effort; a route that is empty reads `inherit`.
- S3: States: loading, no profiles file yet (`No profiles yet`, explaining gentle-shell creates one), a profiles file in a format this version does not know (read-only notice, nothing shown as if it were valid), and a read error.
- S4: Read-only: no control changes anything. The screen says so, and says editing profiles stays in gentle-shell's `/gentle:profiles` for now.
- S5: Compatibility: the reader accepts only `kind` `gentle-pi.agent_model_profiles` with `version` 1; anything else is reported as unsupported. It never writes, never creates files, and reads the profiles of the chosen home (`~/.pi/gentle-ai/profiles.json` for `.pi`, `~/.gentle-shell/gentle-ai/profiles.json` for `.gentle-shell`).
- S6: The status bar's model, effort and profile still show sample values until real session data is wired; they keep their "Sample value" tooltip and now also say they open the models screen.

## Tasks

- [ ] T1 (S2, S3, S5) main and bridge: read-only profiles reader, `readProfiles` through `SetupService`, IPC, preload, mock — inline — commit: pending
- [ ] T2 (S1, S2, S3, S4, S6) renderer: models screen, navigation from the status bar, composer and Settings — worker — commit: pending

## Log

- L1: (user) "lo del perfil, modelos y esfuerzos mejor que se pueda desde el chat y abra otra pantalla, y ahi uno configurar perfiles, todo igual como gentle-shell"; then "me gusta sí" on the designs, and "sigamos entonces".
- L2: (agent) Source for the screen and the file: gentle-pi `docs/readme-reference.md` "Agent-model profiles" and `lib/agent-profiles.ts` (kind `gentle-pi.agent_model_profiles`, version 1, `active`, `profiles` as name → { orchestrator?, <agent>: { model, thinking } }). `/gentle:profiles` only opens a terminal screen, so there is no RPC to edit profiles.
- L3: (agent) Decision: phase 1 is read-only because the maintainer asked that nothing be changed in his gentle-shell without asking first; the editing phase needs his explicit go-ahead and a plan for guards (format check, atomic write, backup).
- L4: (agent) Tests never read the real `~/.gentle-shell` or `~/.pi`; the reader takes an injected file reader.

# Web shell MVP (design/gentle-web-mvp/01-tabbed-panel.html)

Implement the Orca-style shell for the renderer: collapsible chat list and side panel, tabbed Files/ODD/Git panel, status bar, theme picker.
Panel data (files, ODD, git, status-bar values other than the cwd) is sample data behind one module until real bridge methods exist; that wiring is out of scope here.

## Specs

- S1: "ocultar los chats que están a la izquierda y darle más espacio al chat principal, o ocultar la derecha para dejar solamente el chat principal" — the top bar has two toggles (`Toggle chat list`, `Toggle side panel`); each hides its panel and the chat takes the space. The choice persists across reloads.
- S2: Right panel with tabs `Files`, `ODD`, `Git`; one tab visible at a time; `ODD` is the default tab.
- S3: Files tab: a `Search files` field and a flat list; folders first (with a `›` chevron), then files; ignored folders dimmed and italic with a `⊘` marker; per-type file icons.
- S4: Left panel groups chats by project (cwd folder name), has `+ New chat`, `Chat in another folder…` (not wired yet: disabled with an explanatory title), and a search field that filters chats by title.
- S5: Composer: placeholder `Tell Gentle what you need…`, a `Send` button inside the box, hints below: `Enter to send`, `Shift+Enter for a new line`, `Esc to stop the agent`; the model is not shown in the composer.
- S6: Status bar at the bottom: `✿ gentle shell`, cwd, branch with `*`, model, `effort`, `profile`, `ctx`, cost, and `ODD · RDD on` on the right.
- S7: "además que se pueda elegir el tema, igual los que tiene gentle-shell" — a theme picker with the gentle-shell themes `Gentle`, `Gentleman-Cute`, `Gentleman-Sexy`; the choice persists.

## Tasks

- [x] T1 (S1) shell layout: top bar, collapsible panels, persisted state — inline — commit: 10efb65
- [x] T2 (S2, S3) right panel: tabs, Files, ODD, Git with sample data — inline — commit: d2c889d
- [x] T3 (S4) left panel: projects, search, chat in another folder — inline — commit: 0ead263
- [x] T4 (S5, S6) composer restyle and status bar — inline — commit: a361b8e
- [x] T5 (S7) themes: registry, tokens, persistence, picker — inline — commit: 35c609f

## Log

- L1: (user, design handoff) "Implement the design artboard design/gentle-web-mvp/01-tabbed-panel.html … Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim. Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source."
- L2: (user, mid-task) "además que se pueda elegir el tema, igual los que tiene gentle-shell"
- L3: (agent) gentle-shell themes read from gentle-pi `themes/`: Gentle, Gentleman-Cute, Gentleman-Sexy. Reading the user's active pi theme stays deferred (ADR 0009); the picker is local to the renderer.
- L4: (agent) T2 was delegated to `gentle-ai-worker`; it returned `partial` only because `tsc` also saw the in-progress `StatusBar` import, which T4 then added. Re-verified after integration: 169 renderer tests and `tsc` clean.
- L5: (agent) Slice boundary: the "past ~400 lines" notice counts the docs commits this branch inherited from `docs/web-host-proposal`; the five feature commits are each well under 400 authored lines. The right panel, status-bar extras and Git/PR/Commit actions use sample data; wiring them needs new bridge methods and a decision on read-only vs real Git.
- L6: (agent) Existing unrelated failure: `src/main/adapters/launcherLocator.test.ts` "skips a PATH entry that has the name but is not executable" fails on Windows without these changes. `piSessionStore.test.ts` timed out once under load and passed on rerun.

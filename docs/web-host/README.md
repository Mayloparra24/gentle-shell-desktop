# Proposal: a web host for Gentle Desktop

> Status: **proposal, not decided.** Written by a community contributor to start a conversation with the maintainers. Nothing here is a maintainer decision, and nothing changes the existing app.

## In one paragraph

Gentle Desktop is an Electron app. This proposal adds a **second host** for the same app: one command starts a small local server and opens the existing React UI in the browser, talking to the `gentle-shell` the user already has installed. The UI, the chat domain and the tests stay as they are. Only the layer that connects the UI to `gentle-shell` is new. A spike shows it works and what it costs (about 800 new lines, no existing file changed). It also shows what is missing before anyone else should use it.

```text
$ gentle-shell-web            # illustrative name; naming is an open question
  listening on http://127.0.0.1:<port>   →  opens the app in your browser
```

## Why

- **It removes the packaging step from the path to a first chat.** Today you run the app from source with Electron. There are no signed builds, and only macOS on Apple silicon has been tested ([`README.md`](../../README.md), "Try it"). A browser host needs Node and the launcher the user already has.
- **It helps contributors verify real behavior.** ADR 0010 already runs the renderer in a browser, but against a mock bridge. The web host runs it against real sessions.
- **It makes the Windows launcher problem visible from a second angle.** On Windows an npm-installed `gentle-shell` resolves to `gentle-shell.cmd`, which Node cannot spawn directly. That is issues [#23](https://github.com/Gentleman-Programming/gentle-shell-desktop/issues/23) and [#24](https://github.com/Gentleman-Programming/gentle-shell-desktop/issues/24), and it blocks both hosts equally.
- **It gives vision question Q9 something concrete to answer.** Q9 asks whether remote or mobile access is in scope. This proposal does **not** answer it: it is loopback-only.

## What this is not

- **Not a terminal in the browser.** Issue [#2](https://github.com/Gentleman-Programming/gentle-shell-desktop/issues/2) considers a terminal in a window and says it "defeats the entire point of a plain-chat, minimalist app", keeping it only as "a possible future 'power mode' toggle, not the default". The web host renders the same chat UI, not the TUI.
- **Not pi's `packages/server`.** Issue #2 marks it "Rejected for now" ("no auth, explicitly marked experimental"). The web host talks to `gentle-shell --mode rpc`, as the desktop does.
- **Not a second UI.** The UI is not copied or redesigned. If it diverged, this proposal would have failed.
- **Not remote access.** It binds to `127.0.0.1` only. There is no flag to change that.
- **Not a replacement for the desktop app.** People who do not want a terminal at all still need the packaged app (issue #2, "Problem or opportunity").

## How it works

The renderer never talks to Electron directly. It calls `useBridge()`, which returns `window.gentle ?? mockBridge` (`src/renderer/shared/bridge/useBridge.ts`). In Electron, the preload script sets `window.gentle`. In the web host, a small script sets it before the app starts, built from the **same** `createBridge(ipc)` the preload uses (`src/preload/bridge.ts`), with the IPC object backed by a WebSocket instead of Electron's `ipcRenderer`.

On the server side, the host rebuilds the object graph that `src/main/index.ts` builds (`ChatHost`, `PiSession`, `AppConfigStore`, `createSetupService`) and reuses `registerHandlers()` unchanged, through thin stand-ins for Electron's `IpcMain` and `WebContents`.

Only two non-test files in `src/main` import `electron`: `src/main/index.ts` and `src/main/ipc/registerHandlers.ts`. The rest of `src/main` (2,267 lines without tests) and the renderer (2,189 lines without tests) are host-agnostic. Measured on `main` at `5ab4a00`.

Diagrams: [diagrams.md](diagrams.md). Slides: [deck.html](deck.html), also in Spanish: [deck.es.html](deck.es.html).

## Evidence

A spike was built on a local branch (not part of this proposal's diff). All results below were observed on one machine: Windows 11, Node v26.8.1, pnpm 11.22.0, `gentle-shell 4.3.0-main.557c674895b1`, pi 1.4.0, an isolated home with 19 existing chats.

| Check | Result | Observed by |
|---|---|---|
| Existing renderer and domain untouched | 13 new files, 0 tracked files modified, nothing staged | spike run, `git diff --stat` empty |
| UI mounts in a real browser (Edge) | `window.gentle` present, 19 chats listed over the socket, no console or CSP errors | spike run |
| Request without token | HTTP `401` | spike run |
| Foreign `Origin` or foreign `Host` | HTTP `403` | spike run |
| WebSocket upgrade with a valid token and a foreign `Origin` | rejected (`403`); the honest case gets `101` | spike run |
| Opening a chat spawns the real child | `gentle-shell.mjs --isolated --mode rpc --session <file>`, parent = the host process | spike run |
| `pnpm typecheck` | clean | spike run |
| `pnpm test` | 350 of 351 passed; the one failure is a pre-existing Windows test in `launcherLocator.test.ts` | spike run |
| **A real conversation: open a new chat, write, get an answer** | **works; the agent also answered a question about using Engram** | **reported by the proposal's author, not reproduced by the spike** |

Size of the spike: 811 lines across 8 source files (`src/host/web/*`, `bin/`, build config) and 380 lines of checks. That count includes a hand-written WebSocket implementation that should be replaced (see below).

## What the spike does not prove

Stated here so nobody has to find it out later:

- **No multi-client behavior.** There is one shared `ChatHost`, so one open chat at a time. This is the existing audit A3, not something the web host adds.
- **No reconnect or resume.** A dropped socket loses the live view.
- **The child outlives the browser.** Closing the tab leaves the `gentle-shell` child running until the host exits.
- **The token is scrubbed from the URL only on the client.** It stays in browser history and network logs until it is exchanged for a session cookie.
- **Static assets are served without the token** (a `<script src>` cannot carry one). They are inert code; all data goes over the authenticated socket.
- **Hand-written WebSocket.** The `ws` package was not hoisted in the workspace, so both ends implement RFC 6455 by hand. A parser we maintain ourselves is attack surface we do not need. Replace with `ws`.
- **No automated tests for the server's authentication.** The checks above ran as scripts. Only the client IPC has unit tests.
- **No TLS and no rate limiting.** Acceptable on loopback, to be revisited before anything else is allowed.
- **Launcher lookup on Windows needs the spawn fix.** The spike only ran with `GENTLE_SHELL_BIN` pointing at the `.mjs` entry. Slice 1 below fixes it.

## Security model

The model is copied from what `gentle-shell` already ships for its own install wizard (`scripts/installer-server.mjs`: loopback bind, a random token compared with `timingSafeEqual`, same-origin headers, and "the browser never sends commands, paths, plans or environment").

| Rule | Why |
|---|---|
| Bind `127.0.0.1` only; no option to change it | Removes LAN exposure by default |
| Random 32-byte token per run, constant-time comparison | A page open in another tab cannot call the host without it |
| Exact `Host` and `Origin` match, **also on the WebSocket upgrade** | Stops DNS rebinding and cross-site WebSocket hijacking |
| The browser sends typed operations (the same channels as the IPC handlers), never a command line, path or environment | The host decides what runs; the page cannot construct execution |
| Token exchanged once for a session cookie, then removed from the URL (planned, slice 3) | Keeps it out of history and logs |
| Child process tied to its connection (planned, slice 3) | No orphaned agents |

A local server in front of an agent with shell access is the real risk of this proposal. If the model above cannot hold, the right answer is to cut scope, not to relax it.

## Plan

Each slice is meant to be reviewable on its own (about 400 authored lines or fewer) and to keep tests and docs with the behavior. Sizes are estimates from the spike.

| # | Slice | Depends on | Surface | Value without the rest |
|---|---|---|---|---|
| 1 | Windows launcher spawn fix | none | `src/main/adapters/nodeProcessSpawner*` | **Yes**: unblocks #23 and #24 for the desktop too. Done on branch `fix/windows-batch-spawn` (`dc39e48`) |
| 2 | Bridge contract and WebSocket IPC client, with tests | none | `src/shared/contract/**`, `src/host/web/wsIpc*` | Makes the existing implicit contract explicit |
| 3 | Web server: `ws`, session cookie, child lifetime, auth tests | 2 | `src/host/web/server*`, `tests/security/**` | Needs a security-minded reviewer who did not write it |
| 4 | Renderer build and browser entry point | 2 | build config, `index.html` | Small |
| 5 | CLI, documentation, CI job per host | 3, 4 | `bin/`, `docs/`, `.github/workflows/` | First time the repo would have CI for either host |
| 6 | Optional: `gentle-shell web` entry point and a pinned UI in the release | 5, and `gentle-shell` maintainers | outside this repository | Only after 1 to 5 are stable |

Slices 2 and 4 can run in parallel after slice 1. Slice 3 is the one that needs the most care. Slice 6 is a separate request to the `gentle-shell` maintainers and nothing here depends on it: until then the command runs on its own.

## Where the code could live

| Option | Good | Costs |
|---|---|---|
| Second entry point in this repository (recommended start) | One set of tests, no version matrix between UI and host | Needs a maintainer's agreement on the folder and a contract rule |
| A separate repository that consumes the UI as a package | Isolates the host's risk | A published UI package, two pipelines, and a conformance job that fails when the UI and the contract drift. Without that job it becomes a fork |
| Inside `gentle-shell` | One install and one version for the user | Puts React, a bundler and browser tests into the CLI repository. Not proposed |

This proposal asks for the first option, as a draft, and keeps the others open.

## How the work can be shared

Ownership by surface avoids two people editing the same files:

| Area | Slices | Needs |
|---|---|---|
| Contract and renderer wiring | 2, 4 | React, TypeScript |
| Server and security | 3 | Node, HTTP and WebSocket, a reviewer other than the author |
| Platform and CI | 1, 5 | Windows, macOS, Linux; GitHub Actions |
| Integration | all | One person who keeps the contract and the host in step |

## Checked against existing documents, issues and PRs (2026-10-23)

No document, issue or PR proposes a web host. The closest mentions:

| Where | What it says | Relation |
|---|---|---|
| Vision Q9, PR [#29](https://github.com/Gentleman-Programming/gentle-shell-desktop/pull/29) (`docs/00-vision.md:135`) | Asks whether mobile or remote access is in scope | Open question; this proposal stays loopback-only and does not answer it |
| Glossary and proposals index, PR #29 (`docs/01-glossary.md:103`, `docs/07-proposals/README.md:39-41`) | A community member linked `herdr-web-ui` as a comparison on 2026-09-30 and asked for a lightweight multiplatform app with remote agents | Listed as "mentioned, not proposed" and out of scope |
| ADR 0010 and `pnpm dev:web` | The renderer already runs in a browser against a mock bridge | The web host is the same idea with a real bridge |
| PR [#30](https://github.com/Gentleman-Programming/gentle-shell-desktop/pull/30), `docs/system-design.md` | Target-state design: one child per conversation, a main-process registry | The host reuses that direction and does not change it |

Searched: the issue and PR bodies and comments of `gentle-shell-desktop`, the Markdown in PRs #29 and #30, and issue search in `gentle-shell`. Discord was not searched; the quotes above come from what PR #29 records.

## Future work (not part of this proposal)

Recorded so it is not lost. None of it is required for the first useful version:

- Separate sessions per browser client, so two tabs do not share one chat (audit A3, F1 in PR #29).
- Hide sessions the user already closed in the terminal (for example with Ctrl+D).
- Running `/gentle:*` commands from the UI.
- Reconnect and resume; a project-folder picker (audit A10).
- Anything beyond loopback.

## Decisions requested from the maintainers

1. **Direction:** is a second host for the same UI acceptable in principle?
2. **Placement:** a second entry point in this repository, a separate repository, or neither?
3. **Q9:** is loopback-only the right limit for now?
4. **Name:** `gentle-shell-web` is a placeholder. Vision Q10 already leaves the product name open.
5. **Review:** who reviews slice 3?

If the answer to 1 is no, slice 1 still stands on its own.

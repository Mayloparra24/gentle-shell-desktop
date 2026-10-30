# Gentle Shell Desktop

Planning and code for the Gentle Shell desktop app: a plain-chat window over pi with per-chat helpers, ODD progress, providers and extensions. Early preview: M1 (chat core) and M2 (per-chat helpers) are done. The feature documents under [`odd/tasks/`](odd/tasks/) record the scope, decisions, checks and evidence for each milestone.

## Try it

Early preview: no signed builds yet, so you run it from source. Tested on macOS (Apple silicon); Windows and Linux builds are configured but not tested yet.

### 1. Requirements

- Node.js 22.19 or newer and [pnpm](https://pnpm.io) 11.
- The `gentle-shell` launcher, which ships with gentle-pi 3.7.0 or newer:

  ```sh
  npm install -g gentle-pi
  gentle-shell --version   # prints gentle-shell, pi and home versions
  ```

  The launcher runs pi with Gentle Shell loaded and never edits your vanilla pi setup.

### 2. Sign in to a model provider

The app uses whatever pi is signed in to. Pick one:

- **You already use pi:** nothing to do. On first run choose "Use my pi setup" and the app reuses `~/.pi/agent` (sign-ins, models, sessions) without touching its `settings.json`.
- **You want it separate, or have no pi:** the app uses its own home, `~/.gentle-shell/agent`. Sign in there once from the terminal:

  ```sh
  gentle-shell --isolated   # opens the terminal UI; run /login, pick a provider, then quit
  ```

### 3. Run the app

```sh
git clone https://github.com/Gentleman-Programming/gentle-shell-desktop
cd gentle-shell-desktop
pnpm install
node node_modules/electron/install.js   # downloads the Electron binary; pnpm may skip it
pnpm dev
```

On first run the window asks where your chats live ("Keep it separate", the recommended choice, uses `~/.gentle-shell/agent`; "Use my pi setup" links to your `~/.pi/agent`). The screen only appears when `~/.pi/agent` exists. The choice is saved; the chat list then shows your existing pi chats, and "New chat" opens a small folder chooser each time: pick a recent folder or use "Browse…" to select another. No chat starts automatically; cancelling the folder dialog leaves your current chat open.

To see the Helpers tab, ask for something that delegates work to a subagent; the helper shows up under that chat within a few seconds.

### Build an app bundle (optional)

```sh
pnpm package   # unsigned build for this OS, under release/
```

On macOS, apps opened from Finder do not get your shell `PATH`, so the app cannot find `gentle-shell` or `node`. Start it from a terminal instead:

```sh
"release/mac-arm64/gentle shell.app/Contents/MacOS/gentle shell"
```

or set `GENTLE_SHELL_BIN` to the launcher's full path (`which gentle-shell`). macOS also blocks unsigned apps on first open: right-click the app, then Open.

### Known limitations

- Stop in the Helpers tab is disabled until gentle-agents exposes a stop command over RPC.
- No ODD progress panel yet (M3), and no providers or extensions screens (M4): sign in and manage packages through `gentle-shell` in the terminal.
- No signing, notarization or auto-update yet (M5).

Found a bug? Open an issue with the bug report form.

## Progress

- M1, chat core: [`odd/tasks/desktop-m1-chat-core.md`](odd/tasks/desktop-m1-chat-core.md)
- M2, per-chat helpers: [`odd/tasks/desktop-m2-helpers.md`](odd/tasks/desktop-m2-helpers.md)

Each feature document records the scope, decisions, tasks, checks and review evidence for its milestone.

## What it shows

### Helpers tab

Each chat header carries a `Chat | Helpers` toggle with the count of
currently running helpers. The Helpers tab lists every subagent that chat
started — queued, running, waiting, done or failed — and, once you pick
one, its narrated thread: Task, Plan, Step N with tool calls collapsed to
one line (a "Show tool details" toggle reveals args/output), and Update or
Note rows. Footer controls: Follow live (auto-scrolls as new activity
arrives), Back to chat, and Stop (disabled until gentle-agents exposes a
stop command over RPC). The tab is per chat, never a global list — a
helper only ever shows under the chat that started it.

The app sets `GENTLE_SHELL_INTERACTIVE_HOST=1` on the pi process it spawns
so gentle-pi publishes helper activity and enables RPC dialogs (gentle-pi
3.7.0 or newer; with an older gentle-pi the Helpers tab stays empty).

### Git tab

The workspace Git tab shows the branch, changed paths (up to 200) and recent commits. With a live chat context, stage or unstage individual files; partially staged paths appear in both groups. **Commit staged** commits only the index using your message. Push, Pull and Sync show a fresh confirmation with the repository, branch and effective redacted remote destination; commits show staged files and the message. Sync pulls then pushes. Pull/Sync require a clean worktree and use fast-forward-only pulls. There is no force, discard, autostash or automatic conflict resolution. Legacy summaries without a context remain read-only.

Before the first write, explicitly trust the canonical repository for this app session. Trust authorizes configured hooks, filters, signing and credential programs with your privileges; repository identity or effective configuration changes require trust again. Cancelling runs no write. Trust itself executes no action: the app replans afterward.

Authentication uses existing system Git/SSH credentials noninteractively. The app stores no secrets and has no integrated login. If interaction is required, check the repository and credentials in a terminal. Real remote authentication has not been verified by these UI tests.

Conflicts, detached HEAD, submodules, active integrations, index locks, ambiguous/unsupported remote targets and repositories exceeding conservative verification limits are refused. See the [engine safety and limits](src/main/adapters/gitWrite.README.md) for exact limits and unsupported states. App locking does not protect against external writers or authorized hooks changing state between checks.

Git refreshes after an attempted apply while retaining its outcome. No mutation is automatically retried. A partial Sync means pull succeeded but push did not complete; failures/timeouts may still have local or remote effects, including uncertain remote success. Inspect both sides before starting a new action. Commit drafts clear only after successful commit.

## Development

```sh
pnpm install       # install dependencies
pnpm dev           # run the Electron + React app
pnpm dev:web       # run the renderer alone in a browser tab (for browser-driven QA), http://localhost:5173
pnpm test          # run the vitest suite once
pnpm test:watch    # run vitest in watch mode
pnpm typecheck     # type-check main, preload and renderer
pnpm build         # build the Electron app (main, preload, renderer)
pnpm package       # build and package an unsigned app for this OS (electron-builder), output under release/
pnpm package:mac   # same, macOS only (dmg + zip)
pnpm package:win   # same, Windows only (nsis)
pnpm package:linux # same, Linux only (AppImage)
pnpm smoke:electron # build, launch the packaged main entry through Playwright, and verify the window actually comes up
```

The app resolves the launcher from `GENTLE_SHELL_BIN` (a path to a gentle-pi checkout's `bin/gentle-shell.mjs`, or another gentle-shell executable) or a `gentle-shell` binary on `PATH`; see `src/main/adapters/launcherLocator.ts`.

On Windows, `.cmd`/`.bat` launchers reject command paths or arguments containing `"`, `%`, `!`, `^`, CR or LF before spawning; ordinary tokens, spaces, empty arguments and ampersands are supported, not arbitrary shell quoting. Set `GENTLE_SHELL_BIN` to the supported `bin/gentle-shell.mjs` entry to bypass batch-shell restrictions (direct JS/executable routes are unchanged).

See "What it shows" above for why the app sets `GENTLE_SHELL_INTERACTIVE_HOST=1`; the spawn itself lives in `src/main/domain/session/PiSession.ts`.

See `src/README.md` for why the source tree is shaped the way it is.

`pnpm dev:local-pi` runs the app against a local gentle-pi checkout (default `../gentle-pi-worktrees/desktop-integration`, override with `GENTLE_SHELL_BIN=<path>/bin/gentle-shell.mjs`), useful when changing gentle-pi and the app together.

## License

[MIT](LICENSE)

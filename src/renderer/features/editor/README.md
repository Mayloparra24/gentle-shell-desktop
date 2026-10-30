# Read workspace files without leaving the chat

Open a chat, then click a file in **Files** (or focus its button and press Enter/Space). The center viewer is read-only: it has no Edit or Save action and never writes to disk.

## Tabs and source

- The chat is always first. Switching to a file keeps the conversation, draft and stream mounted.
- Arrow keys, Home and End move between tabs. Close a file with its **Close <name>** button.
- Up to eight files stay open. Opening a ninth replaces the oldest non-active file; opening an existing file activates it. Closing the active file selects the last remaining file, or the chat.
- Switching chat or home closes the file tabs. The status bar shows the selected file's cursor position, UTF-8 encoding, line endings and language.

## Read limits

The main process resolves paths against the active chat folder, sharing Files' path confinement. Traversal, absolute/UNC paths, alternate data streams, device names and links escaping that folder are refused. Only regular files are read. Files over 1 MiB are rejected before opening, and every read is bounded even if a file grows after stat. A NUL in the first 8 KiB marks a binary file; UTF-8 BOMs are stripped. Errors offer Retry.

`FileViewer` imports the editor loader only when a file opens. CodeMirror core and each language pack are dynamic imports; a view is created once per open file and destroyed on close/unmount. The theme uses the shared CSS tokens, including syntax colors.

## Security model (read this before changing `readFile`)

`readFile` is confined to the active chat's folder with the same checks as `listDirectory` (lexical refusals, then `realpath` containment), plus a stat-then-read bound of 1 MiB that also holds if the file grows while it is read.

**Accepted risk: this is not a race-proof sandbox.** Node resolves the path again at `stat` and at `open`, so someone who can swap a file for a symlink (or a directory for a junction) inside the chat folder in that window can make the viewer return a file from outside it. This was reproduced by the independent verification of this unit. For the old directory listing the same race leaked names and sizes; for file reads it leaks content. It is accepted because the only actor who can do it is a process already writing in the user's chosen folder (typically the agent), which already has the user's own filesystem privileges and can read those files directly. A stat/handle identity comparison would only close part of the window, so it was deliberately not added. Do not present this surface as protection against a hostile local writer.

Also by design: files inside the folder such as `.env` are readable (the boundary is the folder, not a file allowlist); only the first 8 KiB are inspected for NUL bytes; invalid UTF-8 becomes replacement characters.

import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { DirectoryEntry } from "@shared/bridge-types";
import type { WorkspaceReader } from "../ports";

/** Metadata only: never follows entry links to obtain their kind or size. */
export function createWorkspaceReader(): WorkspaceReader {
  return {
    async listDirectory(cwd, relativePath) {
      if (!cwd) return { status: "no-chat-folder" };
      // Check both path dialects, regardless of the host OS; ':' also blocks Windows ADS.
      if (typeof relativePath !== "string" || /[\0:]/.test(relativePath) ||
          path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
          relativePath.split(/[\\/]/).includes("..")) {
        return { status: "error", message: "Invalid relative directory path" };
      }
      try {
        // shortcut: realpath and readdir are separate steps, so a writer racing us could swap a link in between;
        // acceptable for read-only metadata of a folder the user chose, revisit if folders ever become untrusted.
        const root = await realpath(cwd);
        const directory = await realpath(path.join(root, ...relativePath.split(/[\\/]/)));
        const relative = path.relative(root, directory);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          return { status: "error", message: "Directory is outside the chat folder" };
        }
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name));
        const listed: DirectoryEntry[] = [];
        for (const entry of entries.slice(0, 500)) {
          const stat = await lstat(path.join(directory, entry.name));
          listed.push(stat.isFile() ? { name: entry.name, kind: "file", size: stat.size } :
            { name: entry.name, kind: stat.isDirectory() ? "directory" : "other" });
        }
        return { status: "ready", entries: listed, truncated: entries.length > 500 };
      } catch {
        return { status: "error", message: "Could not read directory" };
      }
    },
  };
}

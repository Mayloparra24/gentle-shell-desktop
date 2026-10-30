import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DirectoryEntry } from "@shared/bridge-types";
import type { WorkspaceReader } from "../ports";

function invalidPath(relativePath: string): boolean {
  return typeof relativePath !== "string" || /[\0:]/.test(relativePath) ||
    path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..");
}

async function confinedPath(cwd: string, relativePath: string): Promise<string | undefined> {
  const root = await realpath(cwd);
  const target = await realpath(path.join(root, ...relativePath.split(/[\\/]/)));
  const relative = path.relative(root, target);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? undefined : target;
}

const FILE_LIMIT = 1_048_576;
const languages: Readonly<Record<string, string>> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript", ".json": "json", ".css": "css", ".md": "markdown",
};

/** Read-only workspace access; both operations share the same confinement. */
export function createWorkspaceReader(): WorkspaceReader {
  return {
    async readFile(cwd, relativePath) {
      if (!cwd) return { status: "no-chat-folder" };
      if (invalidPath(relativePath) || !relativePath || relativePath.split(/[\\/]/).some(part =>
        /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:[. ]|$)/i.test(part))) {
        return { status: "error", message: "Invalid file path" };
      }
      try {
        const file = await confinedPath(cwd, relativePath);
        if (!file) return { status: "error", message: "File is outside the chat folder" };
        const metadata = await stat(file);
        if (!metadata.isFile()) return { status: "error", message: "Not a regular file" };
        if (metadata.size > FILE_LIMIT) return { status: "too-large", size: metadata.size };
        const handle = await open(file, "r");
        try {
          const current = await handle.stat();
          if (!current.isFile()) return { status: "error", message: "Not a regular file" };
          if (current.size > FILE_LIMIT) return { status: "too-large", size: current.size };
          // Bound even a file growing after stat; never use an unbounded readFile.
          const buffer = Buffer.alloc(FILE_LIMIT + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
            if (!bytesRead) break;
            length += bytesRead;
          }
          if (length > FILE_LIMIT) return { status: "too-large", size: (await handle.stat()).size };
          if (buffer.subarray(0, Math.min(length, 8192)).includes(0)) return { status: "binary" };
          const text = buffer.subarray(0, length).toString("utf8").replace(/^\ufeff/, "");
          const crlf = text.includes("\r\n");
          const bare = /(?<!\r)\n|\r(?!\n)/.test(text);
          return { status: "ok", path: relativePath.replace(/\\/g, "/"), text,
            eol: crlf ? bare ? "mixed" : "crlf" : "lf", language: languages[path.extname(file).toLowerCase()] };
        } finally { await handle.close(); }
      } catch {
        return { status: "error", message: "Could not read file" };
      }
    },
    async listDirectory(cwd, relativePath) {
      if (!cwd) return { status: "no-chat-folder" };
      // Check both path dialects, regardless of the host OS; ':' also blocks Windows ADS.
      if (invalidPath(relativePath)) {
        return { status: "error", message: "Invalid relative directory path" };
      }
      try {
        // shortcut: realpath and readdir are separate steps, so a writer racing us could swap a link in between;
        // acceptable for read-only metadata of a folder the user chose, revisit if folders ever become untrusted.
        const directory = await confinedPath(cwd, relativePath);
        if (!directory) {
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

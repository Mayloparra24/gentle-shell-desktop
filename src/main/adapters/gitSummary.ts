import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import type { GitSummary } from "@shared/bridge-types";
import type { GitSummaryReader } from "../ports";

type GitExec = (command: string, args: string[], options: ExecFileOptionsWithStringEncoding) => Promise<{ stdout: string }>;
const execute: GitExec = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, options, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr }));
    else resolve({ stdout });
  });
});

/** Fixed argv only; neither a shell nor renderer input is used to construct a command. */
export function createGitSummaryReader(exec: GitExec = execute): GitSummaryReader {
  return {
    async gitSummary(cwd): Promise<GitSummary> {
      if (!cwd) return { status: "no-chat-folder" };
      const run = async (args: string[]) => (await exec("git", ["-C", cwd, ...args], {
        encoding: "utf8", shell: false, windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024,
        // Do not discover an unrelated repository above the chat's filesystem boundary.
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_CEILING_DIRECTORIES: path.dirname(cwd), LC_ALL: "C" },
      })).stdout;
      try {
        // Check locally before invoking Git: discovery must never scan an ancestor workspace.
        try { await lstat(path.join(cwd, ".git")); }
        catch (error) {
          if ((error as { code?: unknown }).code === "ENOENT") return { status: "not-a-repository" };
          throw error;
        }
        await run(["rev-parse", "--is-inside-work-tree"]);
        let branch: string;
        try { branch = (await run(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
        catch (error) {
          if ((error as { code?: unknown }).code !== 1) throw error;
          branch = (await run(["rev-parse", "--short", "HEAD"])).trim();
        }
        const records = (await run(["status", "--porcelain=v1", "-z"])).split("\0");
        const changed: { path: string; code: string }[] = [];
        let changeCount = 0;
        for (let i = 0; i < records.length; i++) {
          const record = records[i]!;
          if (!record) continue;
          const code = record.slice(0, 2);
          changeCount++;
          if (changed.length < 200) changed.push({ path: record.slice(3), code });
          // Porcelain -z emits destination first, then the original path for renames/copies.
          if (/[RC]/.test(code)) i++;
        }
        let hasHead = true;
        try { await run(["rev-parse", "--verify", "--quiet", "HEAD"]); }
        catch (error) {
          if ((error as { code?: unknown }).code !== 1) throw error;
          hasHead = false;
        }
        const commits: { hash: string; subject: string; relativeTime: string }[] = [];
        if (hasHead) {
          const fields = (await run(["log", "-10", "-z", "--format=%h%x00%s%x00%ar"])).split("\0");
          for (let i = 0; i + 2 < fields.length; i += 3) {
            commits.push({ hash: fields[i]!, subject: fields[i + 1]!, relativeTime: fields[i + 2]! });
          }
        }
        return { status: "ready", branch, changed, truncatedChanges: changeCount > 200, commits };
      } catch (error) {
        const failure = error as { code?: unknown; stderr?: string };
        if (failure.code === "ENOENT") return { status: "git-unavailable" };
        if (failure.code === 128 && failure.stderr?.includes("not a git repository")) return { status: "not-a-repository" };
        return { status: "error", message: "Could not read Git summary" };
      }
    },
  };
}

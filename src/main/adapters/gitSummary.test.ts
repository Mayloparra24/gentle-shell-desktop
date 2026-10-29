import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitSummaryReader } from "./gitSummary";

let root: string;
const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "gentle-git-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
async function repo() {
  git("init", "-b", "main");
  await writeFile(path.join(root, "tracked.txt"), "initial");
  git("add", "tracked.txt");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "Initial subject");
}

describe("git summary", () => {
  it("reads branch, dirty paths with spaces, rename destinations and recent commits from a real repo", async () => {
    await repo();
    git("mv", "tracked.txt", "renamed file.txt");
    await writeFile(path.join(root, "untracked space.txt"), "dirty");
    const result = await createGitSummaryReader().gitSummary(root);
    expect(result).toEqual({ status: "ready", branch: "main", changed: [
      { path: "renamed file.txt", code: "R " }, { path: "untracked space.txt", code: "??" },
    ], truncatedChanges: false, commits: [{ hash: git("rev-parse", "--short", "HEAD"), subject: "Initial subject", relativeTime: expect.any(String) }] });
    git("switch", "--detach");
    expect(await createGitSummaryReader().gitSummary(root)).toMatchObject({ status: "ready", branch: git("rev-parse", "--short", "HEAD") });
  });
  it("reports a modified tracked file without altering status", async () => {
    await repo();
    await writeFile(path.join(root, "tracked.txt"), "changed");
    const before = git("status", "--porcelain=v1");
    expect(await createGitSummaryReader().gitSummary(root)).toMatchObject({ status: "ready", changed: [{ path: "tracked.txt", code: " M" }] });
    expect(git("status", "--porcelain=v1")).toBe(before);
  });
  it("caps changes at 200 and commits at 10", async () => {
    await repo();
    for (let i = 0; i < 11; i++) git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", `Commit ${i}`);
    await Promise.all(Array.from({ length: 201 }, (_, i) => writeFile(path.join(root, `f${i}`), "")));
    const result = await createGitSummaryReader().gitSummary(root);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.changed).toHaveLength(200);
    expect(result.truncatedChanges).toBe(true);
    expect(result.commits).toHaveLength(10);
    expect(result.commits[0]?.subject).toBe("Commit 10");
  });
  it("handles an unborn repository", async () => {
    git("init", "-b", "main");
    expect(await createGitSummaryReader().gitSummary(root)).toEqual({ status: "ready", branch: "main", changed: [], truncatedChanges: false, commits: [] });
  });
  it("distinguishes no folder, non-repository, missing git, and execution errors", async () => {
    expect(await createGitSummaryReader().gitSummary(undefined)).toEqual({ status: "no-chat-folder" });
    expect(await createGitSummaryReader().gitSummary(root)).toEqual({ status: "not-a-repository" });
    await repo();
    const exec = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    expect(await createGitSummaryReader(exec).gitSummary(root)).toEqual({ status: "git-unavailable" });
    expect(exec).toHaveBeenCalledWith("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], expect.objectContaining({ timeout: 5000, maxBuffer: 1048576, encoding: "utf8", shell: false, env: expect.objectContaining({ GIT_OPTIONAL_LOCKS: "0" }) }));
    exec.mockRejectedValue(new Error("timeout"));
    expect(await createGitSummaryReader(exec).gitSummary(root)).toEqual({ status: "error", message: "Could not read Git summary" });
  });
});

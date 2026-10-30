import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitWriteService, type GitWriteContext } from "./gitWrite";
import type { GitWriteRequest } from "@shared/git-write-types";

let root: string;
let cwd: string;
let service: ReturnType<typeof createGitWriteService>;
let context: GitWriteContext;
const env = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_|^(SSH_ASKPASS|SSH_ASKPASS_REQUIRE)$/i.test(key)));
const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], {
  encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024,
  env: { ...env(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "absent-config"), GIT_TERMINAL_PROMPT: "0" },
}).trim();
const git = (...args: string[]) => gitAt(cwd, ...args);
async function file(name: string, content: string) { await writeFile(path.join(cwd, name), content); }
async function commit(message = "seed") { git("add", "--all"); git("commit", "-m", message); }
async function ready(request: GitWriteRequest) {
  let plan = await service.plan(context, request);
  if (plan.needsTrust) { await service.trust(context, plan.planId); plan = await service.plan(context, request); }
  return plan;
}
async function apply(request: GitWriteRequest) { return service.apply(context, (await ready(request)).planId); }
async function effects() {
  return { head: git("rev-parse", "HEAD"), index: git("ls-files", "--stage"),
    files: await readFile(path.join(cwd, "a.txt"), "utf8"), status: git("status", "--porcelain=v1"),
    remote: existsSync(path.join(root, "remote.git")) ? gitAt(path.join(root, "remote.git"), "show-ref") : "" };
}
async function rejected(id: string, message: RegExp) {
  const before = await effects();
  await expect(service.apply(context, id)).rejects.toThrow(message);
  expect(await effects()).toEqual(before);
}
async function remote() {
  gitAt(root, "init", "--bare", "remote.git");
  git("remote", "add", "origin", path.join(root, "remote.git"));
  git("push", "-u", "origin", "main");
  gitAt(root, "clone", "-b", "main", path.join(root, "remote.git"), "peer");
  gitAt(path.join(root, "peer"), "config", "user.name", "test");
  gitAt(path.join(root, "peer"), "config", "user.email", "test@example.invalid");
}
async function peerCommit() {
  await writeFile(path.join(root, "peer", "peer.txt"), "remote change");
  gitAt(path.join(root, "peer"), "add", "peer.txt");
  gitAt(path.join(root, "peer"), "commit", "-m", "remote change");
  gitAt(path.join(root, "peer"), "push");
}
async function script(name: string, body: string) {
  const target = path.join(root, name).replace(/\\/g, "/");
  await writeFile(target, `#!/bin/sh\n${body}\n`); await chmod(target, 0o755); return target;
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "gentle-write-"));
  gitAt(root, "init", "-b", "main", "repo"); cwd = path.join(root, "repo");
  git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid");
  // The service preserves normal user config; these local values make fixtures deterministic.
  git("config", "commit.gpgsign", "false"); git("config", "core.autocrlf", "false");
  await file("a.txt", "initial\n"); await commit();
  service = createGitWriteService(); context = { cwd, generation: 1, isCurrent: () => true, isBusy: () => false };
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

// Real Git processes and local remotes need headroom under parallel suite load on Windows.
describe("Git write service", { timeout: 30_000 }, () => {
  it("requires trust without running configured status/filter/hook programs; trust never stages", async () => {
    const marker = path.join(root, "fired").replace(/\\/g, "/");
    const program = await script("program.sh", `echo fired > '${marker}'`);
    const index = git("ls-files", "--stage");
    git("config", "core.fsmonitor", program); git("config", "filter.test.clean", program);
    await file(".gitattributes", "*.txt filter=test\n"); await file("a.txt", "changed\n");
    const plan = await service.plan(context, { kind: "stage", path: "a.txt" });
    expect(plan).toMatchObject({ needsTrust: true, files: [], kind: "stage" });
    expect(existsSync(marker)).toBe(false);
    await expect(service.apply(context, plan.planId)).rejects.toThrow(/trust/i);
    const second = await service.plan(context, { kind: "stage", path: "a.txt" });
    await service.trust(context, second.planId);
    expect(git("-c", "core.fsmonitor=false", "ls-files", "--stage")).toBe(index); expect(existsSync(marker)).toBe(false);
    await expect(service.trust(context, second.planId)).rejects.toThrow(/plan/i);
  });

  it("stages literal hostile filenames, unstages, handles deletion and commits staged-only", async () => {
    const hostile = process.platform === "win32" ? "[a].txt" : ":(glob)*";
    await file(hostile, "literal"); await file("--all", "option"); await file("a.txt", "unstaged\n");
    await apply({ kind: "stage", path: hostile });
    expect(git("diff", "--cached", "--name-only")).toBe(hostile);
    await apply({ kind: "unstage", path: hostile }); expect(git("diff", "--cached", "--name-only")).toBe("");
    await apply({ kind: "stage", path: "--all" });
    await apply({ kind: "commit", message: "--not-an-option\n\nbody" });
    expect(git("show", "HEAD:a.txt")).toBe("initial"); expect(await readFile(path.join(cwd, "a.txt"), "utf8")).toBe("unstaged\n");
    expect(git("show", "HEAD:--all")).toBe("option");
    await rm(path.join(cwd, "a.txt")); await apply({ kind: "stage", path: "a.txt" });
    expect(git("diff", "--cached", "--name-status")).toBe("D\ta.txt");
    await apply({ kind: "unstage", path: "a.txt" }); expect(git("diff", "--cached", "--name-only")).toBe("");
    for (const bad of ["../outside", "/absolute", ".", "a.txt\0evil"]) {
      const before = git("ls-files", "--stage");
      await expect(service.plan(context, { kind: "stage", path: bad })).rejects.toThrow(/path/i);
      expect(git("ls-files", "--stage")).toBe(before);
    }
  }, 30_000);

  it("unstages in an unborn repository without deleting the working file", async () => {
    gitAt(root, "init", "-b", "main", "unborn"); cwd = path.join(root, "unborn"); context.cwd = cwd;
    await file("a.txt", "new"); await apply({ kind: "stage", path: "a.txt" });
    await apply({ kind: "unstage", path: "a.txt" }); expect(git("ls-files")).toBe("");
    expect(await readFile(path.join(cwd, "a.txt"), "utf8")).toBe("new");
  });

  it("consumes plans once and rejects expiry, generation, busy and changed files without effects", async () => {
    await file("a.txt", "first\n");
    const first = await ready({ kind: "stage", path: "a.txt" }); await file("a.txt", "second\n");
    await rejected(first.planId, /changed|stale/i); await rejected(first.planId, /plan/i);
    const expired = await ready({ kind: "stage", path: "a.txt" });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 300_000); await rejected(expired.planId, /expired|plan/i); vi.restoreAllMocks();
    const switched = await ready({ kind: "stage", path: "a.txt" }); context.generation++;
    await rejected(switched.planId, /generation|stale/i);
    const busy = await ready({ kind: "stage", path: "a.txt" }); context.isBusy = () => true; await rejected(busy.planId, /busy/i);
    context.isBusy = () => false; const stale = await ready({ kind: "stage", path: "a.txt" });
    context.isCurrent = () => false; await rejected(stale.planId, /current|stale/i);
  });

  it("checks host generation again after asynchronous preparation and blocks concurrent operations", async () => {
    await file("a.txt", "change"); await ready({ kind: "stage", path: "a.txt" });
    let calls = 0; context.isCurrent = () => ++calls === 1;
    await expect(service.plan(context, { kind: "stage", path: "a.txt" })).rejects.toThrow(/current|stale/i);
    context.isCurrent = () => true;
    const plan = await ready({ kind: "stage", path: "a.txt" });
    const active = service.apply(context, plan.planId);
    await expect(service.plan(context, { kind: "stage", path: "a.txt" })).rejects.toThrow(/busy/i); await active;
  });

  it("invalidates trust and existing plans after effective included config changes", async () => {
    const include = path.join(root, "included.config"); await writeFile(include, "[test]\n value = one\n"); git("config", "include.path", include);
    await file("a.txt", "change"); const plan = await ready({ kind: "stage", path: "a.txt" });
    await writeFile(include, "[test]\n value = two\n"); await rejected(plan.planId, /config|trust|changed/i);
    expect((await service.plan(context, { kind: "stage", path: "a.txt" })).needsTrust).toBe(true);
  });

  it("rejects locks, in-progress integration, detached HEAD and missing upstream", async () => {
    await file("a.txt", "change"); const plan = await ready({ kind: "stage", path: "a.txt" });
    await file(".git/index.lock", "external"); await rejected(plan.planId, /lock/i);
    expect(await readFile(path.join(cwd, ".git/index.lock"), "utf8")).toBe("external"); await rm(path.join(cwd, ".git/index.lock"));
    await file(".git/MERGE_HEAD", git("rev-parse", "HEAD"));
    await expect(service.plan(context, { kind: "stage", path: "a.txt" })).rejects.toThrow(/progress|merge/i); await rm(path.join(cwd, ".git/MERGE_HEAD"));
    await expect(service.plan(context, { kind: "push" })).rejects.toThrow(/upstream/i);
    git("switch", "--detach"); await expect(service.plan(context, { kind: "commit", message: "x" })).rejects.toThrow(/detach/i);
  });

  it("sanitizes inherited Git redirection and refuses config changes at trust time", async () => {
    const old = process.env.GIT_INDEX_FILE; process.env.GIT_INDEX_FILE = path.join(root, "redirect-index");
    try {
      await file("a.txt", "change"); const trust = await service.plan(context, { kind: "stage", path: "a.txt" });
      git("config", "test.changed", "yes"); await expect(service.trust(context, trust.planId)).rejects.toThrow(/config|changed/i);
      await apply({ kind: "stage", path: "a.txt" }); expect(existsSync(process.env.GIT_INDEX_FILE)).toBe(false);
      expect(git("diff", "--cached", "--name-only")).toBe("a.txt");
    } finally { if (old === undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE = old; }
  });

  it("pushes explicitly to the displayed effective pushurl without following configured extra refspecs", async () => {
    await remote(); gitAt(root, "init", "--bare", "push.git");
    git("config", "remote.origin.pushurl", path.join(root, "push.git")); git("config", "remote.origin.push", "HEAD:refs/heads/unwanted");
    git("config", "branch.MAIN.remote", "not-the-current-branch"); git("config", "branch.MAIN.merge", "refs/heads/wrong");
    await file("a.txt", "local change"); await commit();
    const plan = await ready({ kind: "push" }); expect(plan.remote?.pushUrl).toBe(path.join(root, "push.git").replace(/\\/g, "/"));
    expect(plan.remote?.destination).toBe("refs/heads/main"); await service.apply(context, plan.planId);
    expect(gitAt(path.join(root, "push.git"), "rev-parse", "refs/heads/main")).toBe(git("rev-parse", "HEAD"));
    expect(gitAt(path.join(root, "push.git"), "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
  });

  it("pulls fast-forward only, rejects dirty pull and divergence with unchanged effects", async () => {
    await remote(); await peerCommit(); await apply({ kind: "pull" }); expect(git("log", "-1", "--format=%s")).toBe("remote change");
    await file("a.txt", "dirty"); const before = await effects();
    await expect(service.plan(context, { kind: "pull" })).rejects.toThrow(/clean/i); expect(await effects()).toEqual(before);
    await commit("local"); await writeFile(path.join(root, "peer", "peer.txt"), "second");
    gitAt(path.join(root, "peer"), "commit", "-am", "second"); gitAt(path.join(root, "peer"), "push");
    const plan = await ready({ kind: "pull" }); await rejected(plan.planId, /failed/i);
  });

  it("reports partial Sync when pull succeeded but push hook failed, without retry", async () => {
    await remote(); await peerCommit();
    const hook = await script("reject-push.sh", "exit 1"); git("config", "core.hooksPath", root.replace(/\\/g, "/"));
    await writeFile(path.join(root, "pre-push"), await readFile(hook)); await chmod(path.join(root, "pre-push"), 0o755);
    const result = await apply({ kind: "sync" }); expect(result).toMatchObject({ status: "partial", pulled: true, pushed: false });
    expect(git("log", "-1", "--format=%s")).toBe("remote change");
  });

  it("rejects stale HEAD/index/branch and unmerged entries without additional effects", async () => {
    await file("a.txt", "change");
    const indexPlan = await ready({ kind: "stage", path: "a.txt" }); git("add", "a.txt");
    await rejected(indexPlan.planId, /changed/i);
    const headPlan = await ready({ kind: "commit", message: "planned" }); git("commit", "-m", "external");
    await rejected(headPlan.planId, /changed/i);
    await file("a.txt", "next"); const branchPlan = await ready({ kind: "stage", path: "a.txt" }); git("switch", "-c", "other");
    await rejected(branchPlan.planId, /branch|changed/i);
    // update-index --index-info creates a conflict without an active MERGE_HEAD.
    const object = git("rev-parse", "HEAD:a.txt");
    execFileSync("git", ["-C", cwd, "update-index", "--index-info"], {
      input: `0 ${"0".repeat(40)}\ta.txt\n100644 ${object} 1\ta.txt\n100644 ${object} 2\ta.txt\n100644 ${object} 3\ta.txt\n`, env: env(), timeout: 5000,
    });
    const before = await effects();
    await expect(ready({ kind: "stage", path: "a.txt" })).rejects.toThrow(/unmerged/i); expect(await effects()).toEqual(before);
  });

  it("preserves explicitly trusted filters and hooks without executing them during trust", async () => {
    const marker = path.join(root, "filter-marker").replace(/\\/g, "/");
    const filter = await script("filter.sh", `echo x >> '${marker}'\ncat`);
    git("config", "filter.test.clean", `'${filter}'`); await file(".gitattributes", "*.txt filter=test\n");
    await file("a.txt", "filtered\n"); const plan = await service.plan(context, { kind: "stage", path: "a.txt" });
    await service.trust(context, plan.planId); expect(existsSync(marker)).toBe(false);
    await apply({ kind: "stage", path: "a.txt" }); expect(existsSync(marker)).toBe(true);
    const hookMarker = path.join(root, "hook-marker").replace(/\\/g, "/");
    const hook = await script("pre-commit", `echo x >> '${hookMarker}'`); git("config", "core.hooksPath", path.dirname(hook));
    await apply({ kind: "commit", message: "trusted programs" }); expect(await readFile(hookMarker, "utf8")).toBe("x\n");
  });

  it("rejects chained URL rewrites rather than displaying a different transport target", async () => {
    await remote();
    const first = path.join(root, "alias-one").replace(/\\/g, "/");
    const second = path.join(root, "alias-two").replace(/\\/g, "/");
    git("config", `url.${first}.insteadOf`, "alias:"); git("config", `url.${second}.insteadOf`, first);
    git("config", "remote.origin.url", "alias:");
    await expect(ready({ kind: "push" })).rejects.toThrow(/rewrite|target/i);
  });

  it("rejects unsafe remote helpers without execution and redacts remote credentials", async () => {
    await remote(); const marker = path.join(root, "remote-fired").replace(/\\/g, "/");
    git("config", "remote.origin.url", `ext::sh -c 'echo x > ${marker}'`);
    await expect(ready({ kind: "push" })).rejects.toThrow(/remote|protocol/i); expect(existsSync(marker)).toBe(false);
    git("config", "remote.origin.url", "https://user:supersecret@example.invalid/repo");
    const plan = await ready({ kind: "push" }); expect(JSON.stringify(plan)).not.toContain("supersecret");
    expect(plan.remote?.pushUrl).not.toContain("user:");
  });
});

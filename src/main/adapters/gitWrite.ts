import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import type { GitWriteFile, GitWritePlan, GitWriteRemote, GitWriteRequest, GitWriteResult } from "@shared/git-write-types";

/** Constructed by the host, never from renderer-supplied cwd or lifecycle callbacks. */
export interface GitWriteContext {
  cwd: string;
  generation: number;
  isCurrent(): boolean;
  isBusy(): boolean;
}
export interface GitWriteService {
  plan(context: GitWriteContext, request: GitWriteRequest): Promise<GitWritePlan>;
  trust(context: GitWriteContext, planId: string): Promise<void>;
  apply(context: GitWriteContext, planId: string): Promise<GitWriteResult>;
}
interface Identity { cwd: string; root: string; gitDir: string; commonDir: string; config: string; key: string; branch: string }
interface Snapshot { fingerprint: string; head: string; files: GitWriteFile[] }
interface Target { display: GitWriteRemote; pull?: string; push?: string }
interface Stored {
  public: GitWritePlan; request: GitWriteRequest; identity: Identity; generation: number;
  snapshot?: Snapshot; target?: Target;
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
class SafeGitError extends Error {}
function fail(message: string): never { throw new SafeGitError(message); }
async function redacted<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof SafeGitError) throw error; fail("Could not safely inspect or modify this repository. Plan again after checking it in a terminal."); }
}
const TTL = 120_000;
const MAX_PLANS = 64;
const MAX_FILES = 10_000;
const MAX_BYTES = 64 * 1024 * 1024;

function environment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^GIT_/i.test(key) && !/^(SSH_ASKPASS|SSH_ASKPASS_REQUIRE|GCM_INTERACTIVE)$/i.test(key)));
  return { ...env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "",
    SSH_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never", GCM_INTERACTIVE: "never", LC_ALL: "C" };
}
// No shell, no raw Git diagnostics (which may include credentials, hook output or file contents).
function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["--literal-pathspecs", "-c", "core.askPass=", "-C", cwd, ...args], {
      encoding: "utf8", shell: false, windowsHide: true, env: environment(), timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024, killSignal: "SIGKILL",
    }, (error, stdout) => {
      if (error) reject(new SafeGitError("Git operation failed. Check repository state and existing credentials in a terminal; no automatic retry was attempted."));
      else resolve(stdout);
    });
  });
}
async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; fail("Could not inspect repository state."); }
}
async function identity(context: GitWriteContext): Promise<Identity> {
  const cwd = await realpath(context.cwd).catch(() => fail("Repository folder unavailable."));
  const root = await realpath((await run(cwd, ["rev-parse", "--show-toplevel"])).trim());
  const gitDir = await realpath((await run(root, ["rev-parse", "--absolute-git-dir"])).trim());
  const commonDir = await realpath(path.resolve(root, (await run(root, ["rev-parse", "--git-common-dir"])).trim()));
  // These commands only inspect identity/config, never status, filters, hooks or authentication.
  const config = hash(await run(root, ["config", "--includes", "--null", "--show-origin", "--show-scope", "--list"]));
  let branch = "";
  try { branch = (await run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); } catch { /* detached */ }
  return { cwd, root, gitDir, commonDir, config, branch, key: hash(JSON.stringify([cwd, root, gitDir, commonDir])) };
}
function validRequest(request: GitWriteRequest): GitWriteRequest {
  if (!request || !["stage", "unstage", "commit", "push", "pull", "sync"].includes(request.kind)) fail("Invalid Git operation.");
  if (request.kind === "stage" || request.kind === "unstage") {
    const name = request.path;
    if (typeof name !== "string" || !name || /[\0\\\r\n]/.test(name) || /^[a-z]:|^\//i.test(name)
      || name.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) fail("Invalid repository path.");
    return { kind: request.kind, path: name };
  }
  if (request.kind === "commit") {
    if (typeof request.message !== "string" || !request.message.trim() || request.message.includes("\0") || request.message.length > 20_000) fail("A nonempty commit message is required (maximum 20000 characters).");
    return { kind: request.kind, message: request.message };
  }
  return { kind: request.kind };
}
async function writable(id: Identity): Promise<void> {
  for (const name of ["index.lock", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "BISECT_LOG"]) {
    if (await exists(path.join(id.gitDir, name))) fail(name === "index.lock" ? "Repository index.lock exists; it was not removed." : "Repository integration is in progress.");
  }
}
async function state(id: Identity): Promise<Snapshot> {
  await writable(id);
  if (!id.branch) fail("Detached HEAD is not supported for Git writes.");
  const status = await run(id.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]);
  const files = status.split("\0").filter(Boolean).map(record => ({ code: record.slice(0, 2), path: record.slice(3) }));
  if (files.some(file => /U/.test(file.code) || ["AA", "DD"].includes(file.code))) fail("Unmerged paths are not supported.");
  const entries = await run(id.root, ["ls-files", "--stage", "-z"]);
  if (entries.split("\0").some(entry => entry.startsWith("160000 "))) fail("Repositories with submodules are not supported for Git writes.");
  const names = [...new Set((await run(id.root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean))].sort();
  if (names.length > MAX_FILES) fail("Repository exceeds the write verification file limit.");
  let bytes = 0;
  const content: string[] = [];
  for (const name of names) {
    const absolute = path.resolve(id.root, name);
    if (!absolute.startsWith(id.root + path.sep)) fail("Unsafe repository path.");
    if (!await exists(absolute)) { content.push(JSON.stringify([name, "missing"])); continue; }
    const parent = await realpath(path.dirname(absolute));
    if (parent !== id.root && !parent.startsWith(id.root + path.sep)) fail("Repository path escapes through a directory symlink.");
    const stat = await lstat(absolute);
    bytes += stat.size;
    if (bytes > MAX_BYTES || (!stat.isFile() && !stat.isSymbolicLink())) fail("Repository exceeds supported write verification limits.");
    // Do not follow symlinks out of the repository. Git tracks the link text, not its target.
    content.push(JSON.stringify([name, stat.mode, stat.isSymbolicLink() ? await readlink(absolute) : hash(await readFile(absolute))]));
  }
  let head = "";
  // A missing HEAD is valid only on an unborn branch, not an arbitrary rev-parse failure.
  const refs = await run(id.root, ["for-each-ref", "--format=%(refname) %(objectname)", `refs/heads/${id.branch}`]);
  if (refs.trim()) head = (await run(id.root, ["rev-parse", "--verify", "HEAD"])).trim();
  const indexFile = path.join(id.gitDir, "index");
  const index = await exists(indexFile) ? hash(await readFile(indexFile)) : "unborn";
  return { head, files, fingerprint: hash(JSON.stringify([id.branch, head, index, status, entries, content])) };
}
function safeUrl(value: string, root: string): string {
  if (!value || /[\0\r\n]/.test(value) || value.startsWith("-") || value.includes("::")) fail("Unsafe remote protocol or destination.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const protocol = new URL(value).protocol;
    if (!["https:", "http:", "ssh:", "git:", "file:"].includes(protocol)) fail("Unsafe remote protocol.");
    return value;
  }
  if (/^[a-z]:[\\/]/i.test(value) || path.isAbsolute(value)) return value.replace(/\\/g, "/");
  if (/^(?:[^@/:\s]+@)?[^/:\s]+:[^\s]+$/.test(value)) return value; // scp-style SSH
  if (value.includes(":")) fail("Unsafe remote protocol.");
  return path.resolve(root, value).replace(/\\/g, "/");
}
function displayUrl(value: string): string {
  // Suppress userinfo and query/fragment tokens. The raw target never crosses the service boundary.
  if (value.includes("://")) {
    const url = new URL(value); url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.toString();
  }
  return value.replace(/^[^/@]+@(?=[^/]+:)/, "");
}
async function target(id: Identity, kind: GitWriteRequest["kind"]): Promise<Target | undefined> {
  if (!["push", "pull", "sync"].includes(kind)) return undefined;
  // --get-all exits 1 for an absent setting; listing keeps execution failures visible.
  const records = (await run(id.root, ["config", "--includes", "--null", "--list"])).split("\0");
  const config = (key: string): string[] => records
    // Git normalizes section/variable names, but subsection names (branches/remotes) are case-sensitive.
    .filter(record => record.slice(0, record.indexOf("\n")) === key)
    .map(record => record.slice(record.indexOf("\n") + 1));
  const single = (values: string[], label: string): string => {
    if (values.length !== 1 || !values[0]) fail(`Missing or ambiguous upstream ${label}.`);
    return values[0]!;
  };
  const remote = single(await config(`branch.${id.branch}.remote`), "remote");
  if (remote === "." || remote.startsWith("-") || /[\s\0]/.test(remote)) fail("Unsupported upstream remote.");
  const destination = single(await config(`branch.${id.branch}.merge`), "destination");
  if (!destination.startsWith("refs/heads/")) fail("Unsupported upstream destination.");
  await run(id.root, ["check-ref-format", destination]);
  const pushNames = await config(`branch.${id.branch}.pushremote`);
  const pushRemote = pushNames.length ? single(pushNames, "push remote") : (await config("remote.pushdefault")).at(-1) || remote;
  if (pushRemote.startsWith("-") || /[\s\0]/.test(pushRemote)) fail("Unsafe push remote.");
  const get = async (name: string, push: boolean) => {
    const urls = (await run(id.root, ["remote", "get-url", ...(push ? ["--push"] : []), "--all", name])).trim().split(/\r?\n/);
    if (urls.length !== 1) fail("Ambiguous remote URLs.");
    const resolved = safeUrl(urls[0]!, id.root);
    // Passing the expanded URL to Git must not apply a second insteadOf/pushInsteadOf rule.
    // --get-url exits before transport setup (no network or credential helper).
    const repeated = (await run(id.root, ["ls-remote", "--get-url", resolved])).trim();
    const pushRewrite = push && records.some(record => {
      const split = record.indexOf("\n"); const key = record.slice(0, split); const prefix = record.slice(split + 1);
      if (!key.toLowerCase().startsWith("url.") || !key.toLowerCase().endsWith(".pushinsteadof") || !resolved.startsWith(prefix)) return false;
      return key.slice(4, -14) + resolved.slice(prefix.length) !== resolved;
    });
    if (safeUrl(repeated, id.root) !== resolved || pushRewrite) fail("Remote target has chained URL rewrites; use an unambiguous destination.");
    return resolved;
  };
  const pull = kind !== "push" ? await get(remote, false) : undefined;
  const push = kind !== "pull" ? await get(pushRemote, true) : undefined;
  return { pull, push, display: { name: kind === "pull" ? remote : pushRemote, destination,
    ...(pull ? { pullUrl: displayUrl(pull) } : {}), ...(push ? { pushUrl: displayUrl(push) } : {}) } };
}

export function createGitWriteService(): GitWriteService {
  const plans = new Map<string, Stored>();
  const trusted = new Map<string, string>();
  let applying = false;
  function guard(context: GitWriteContext, generation = context.generation) {
    if (!context.isCurrent() || context.generation !== generation) fail("Stale chat generation; repository is no longer current.");
    if (context.isBusy()) fail("Git writes are blocked while the agent is busy.");
  }
  function available(context: GitWriteContext) { guard(context); if (applying) fail("Git write service is busy."); }
  function isTrusted(id: Identity) {
    if (trusted.get(id.key) !== id.config) { trusted.delete(id.key); return false; }
    return true;
  }
  function take(planId: string): Stored {
    const stored = plans.get(planId); plans.delete(planId);
    if (!stored || stored.public.expiresAt <= Date.now()) fail("Git plan is missing, consumed or expired; plan again.");
    return stored;
  }
  async function same(context: GitWriteContext, stored: Stored) {
    guard(context, stored.generation);
    const fresh = await identity(context);
    if (fresh.key !== stored.identity.key || fresh.config !== stored.identity.config || fresh.branch !== stored.identity.branch) {
      trusted.delete(stored.identity.key); fail("Repository identity, branch or config changed; plan and trust again.");
    }
    guard(context, stored.generation);
    return fresh;
  }
  const service: GitWriteService = {
    async plan(context, input) {
      available(context);
      const generation = context.generation;
      const request = validRequest(input);
      const id = await identity(context);
      const needsTrust = !isTrusted(id);
      const snapshot = needsTrust ? undefined : await state(id);
      const remote = needsTrust ? undefined : await target(id, request.kind);
      if (snapshot) {
        if (["pull", "sync"].includes(request.kind) && snapshot.files.length) fail("Pull and Sync require a clean worktree and index.");
        if (["push", "pull", "sync"].includes(request.kind) && !snapshot.head) fail("Remote operations require an existing commit.");
        if (request.path) {
          const file = snapshot.files.find(file => file.path === request.path);
          if (!file || (request.kind === "unstage" && [" ", "?"].includes(file.code[0]!))) fail("Path is not eligible in fresh repository status.");
        }
        if (request.kind === "commit" && !snapshot.files.some(file => ![" ", "?"].includes(file.code[0]!))) fail("No staged changes to commit.");
      }
      // Re-read config after preparation, before exposing a preview prepared with trusted programs.
      const final = await identity(context);
      if (final.key !== id.key || final.config !== id.config || final.branch !== id.branch) { trusted.delete(id.key); fail("Repository config or identity changed during planning."); }
      guard(context, generation);
      if (applying) fail("Git write service is busy.");
      for (const [key, value] of plans) if (value.public.expiresAt <= Date.now()) plans.delete(key);
      while (plans.size >= MAX_PLANS) plans.delete(plans.keys().next().value!);
      const files = snapshot?.files.filter(file => request.path ? file.path === request.path :
        request.kind !== "commit" || ![" ", "?"].includes(file.code[0]!)) ?? [];
      const plan: GitWritePlan = { planId: randomUUID(), kind: request.kind, repository: id.root, branch: id.branch,
        needsTrust, expiresAt: Date.now() + TTL, files,
        ...(!needsTrust && request.message ? { message: request.message } : {}),
        summary: needsTrust ? "Trust this repository for this session before previewing or writing. Git may execute configured hooks, filters and signing tools." :
          request.kind === "commit" ? "Commit staged changes only." : `${request.kind}${request.path ? `: ${request.path}` : ""}`,
        ...(remote ? { remote: remote.display } : {}) };
      // Store separately from renderer-visible mutable objects.
      plans.set(plan.planId, { public: structuredClone(plan), request, identity: id, generation, snapshot, target: remote });
      return plan;
    },
    async trust(context, planId) {
      available(context); const stored = take(planId);
      const id = await same(context, stored);
      if (!stored.public.needsTrust) fail("This plan does not request repository trust.");
      available(context);
      while (trusted.size >= MAX_PLANS) trusted.delete(trusted.keys().next().value!);
      trusted.set(id.key, id.config);
    },
    async apply(context, planId) {
      // Consume even rejected attempts; retry always needs a fresh user-visible plan.
      const stored = take(planId);
      available(context);
      if (stored.public.needsTrust) fail("Repository trust is required; trust and plan again.");
      applying = true;
      try {
        const id = await same(context, stored);
        if (!isTrusted(id)) fail("Repository trust is no longer valid.");
        const snapshot = await state(id);
        const remote = await target(id, stored.request.kind);
        if (snapshot.fingerprint !== stored.snapshot?.fingerprint || JSON.stringify(remote) !== JSON.stringify(stored.target)) fail("Repository state or remote changed since planning.");
        const mutate = async (args: string[]) => {
          await same(context, stored);
          if (stored.public.expiresAt <= Date.now()) fail("Git plan expired before mutation.");
          // Local trusted external writers can still race this last check; this is not a filesystem transaction.
          await writable(id);
          guard(context, stored.generation);
          await run(id.root, args);
        };
        const request = stored.request;
        let pulled = false;
        let pushed = false;
        let source = snapshot.head;
        if (request.kind === "stage") await mutate(["add", "--", request.path!]);
        if (request.kind === "unstage") await mutate(snapshot.head ? ["reset", "--quiet", "HEAD", "--", request.path!] : ["rm", "--cached", "--force", "--", request.path!]);
        if (request.kind === "commit") await mutate(["-c", "submodule.recurse=false", "commit", "-m", request.message!]);
        if (request.kind === "pull" || request.kind === "sync") {
          await mutate(["-c", "submodule.recurse=false", "pull", "--ff-only", "--no-rebase", "--no-autostash", "--recurse-submodules=no", "--no-tags", remote!.pull!, remote!.display.destination]);
          pulled = true;
        }
        if (request.kind === "push" || request.kind === "sync") {
          try {
            if (pulled) {
              const afterPull = await state(id);
              if (afterPull.files.length) fail("Repository is no longer clean after pull.");
              source = afterPull.head;
            }
            await mutate(["push", "--porcelain", "--no-force", "--no-mirror", "--no-follow-tags", "--recurse-submodules=no", remote!.push!, `${source}:${remote!.display.destination}`]);
            pushed = true;
          } catch (error) {
            if (!pulled) throw error;
            return { kind: request.kind, status: "partial", pulled, pushed: false,
              message: "Pull succeeded, but push did not complete. Inspect repository and remote state before planning again; no retry was attempted." };
          }
        }
        return { kind: request.kind, status: "success", pulled, pushed, message: "Git operation completed." };
      } finally { applying = false; }
    },
  };
  return {
    plan: (context, request) => redacted(() => service.plan(context, request)),
    trust: (context, planId) => redacted(() => service.trust(context, planId)),
    apply: (context, planId) => redacted(() => service.apply(context, planId)),
  };
}

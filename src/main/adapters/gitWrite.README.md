# Git write engine (G1)

`createGitWriteService()` is a standalone main-process service. Keep one instance per host/session. Shared serializable contracts live in `@shared/git-write-types`; the host dependency interface and host-only context are exported from `gitWrite.ts`.

## Host integration (G2)

```ts
const gitWrites = createGitWriteService();
const generation = currentGeneration;
const context = {
  cwd: capturedChatFolder, // authoritative host value, never an IPC argument
  generation,
  isCurrent: () => currentGeneration === generation,
  isBusy: () => agentTurnIsActive,
};
const plan = await gitWrites.plan(context, { kind: "commit", message: "Fix parser" });
// Send only the returned serializable plan to the renderer.
if (plan.needsTrust) {
  // After explicit repository trust confirmation:
  await gitWrites.trust(context, plan.planId);
  // Trust executes no requested action. Replan before preview/confirmation/apply.
} else {
  // After confirmation for commit/push/pull/sync (stage/unstage need no second dialog):
  const result = await gitWrites.apply(context, plan.planId);
}
```

The host must capture a generation in each context, reject renderer cwd/argv, validate IPC shapes, and hold its lifecycle lock from **before calling apply until its promise settles**. That lock must prevent chat switches and `sendMessage`/agent starts. The engine checks current/busy callbacks after asynchronous preparation and immediately before each mutation, but cannot supply the host lock. The instance also refuses concurrent GUI applies/plans while an apply is running. UI confirmation, IPC, read-panel changes, and host lifecycle locking are G2/G3, not implemented here.

## Trust and plans

- Trust is session-scoped and binds canonical chat folder, canonical worktree/Git/common directories, and the complete effective included configuration with origins/scopes. A changed identity/config requires explicit trust again. Trust permits configured hooks, filters, fsmonitor and signing tools; those programs have the user's privileges.
- Before trust, only Git identity/config reads run. Trust-only plans have no files, remote preview or commit message and cannot be applied. Trust consumes its plan without executing an action.
- Plans expire after two minutes and are single-use, including rejected apply attempts. Both plans and trust records are capped at 64 (oldest evicted). Replan after any refusal; no mutation is automatically retried.
- Revalidation checks host generation/busy state, identity/config/branch, HEAD, exact index bytes, status, tracked/untracked nonignored file contents and symlink text, and effective remote targets. Ignored files are not fingerprinted. Planning does not fetch or inspect live server refs; a remote can advance after confirmation and Git's fast-forward/nonforce checks remain authoritative.
- Repository verification is conservatively limited to 10,000 files and 64 MiB of worktree file sizes, with 4 MiB maximum output and 15 seconds per Git command. Submodule-bearing repositories, directory-symlink escapes, detached HEAD, conflicts, index locks and integration/rebase/sequencer/bisect states are refused. Lockfiles are never removed. Limits may reject otherwise valid repositories.

## Operations and destinations

- `stage` / `unstage`: one eligible path from fresh status, global literal pathspec semantics and `--` separation. Deletions can be staged. Unborn unstage removes only the index entry, retaining the working file. Renames are represented as separate old/new paths.
- `commit`: requires a nonempty message (up to 20,000 characters) and staged changes; never uses `-a`. Returned preview includes staged paths and the message. Trusted hooks retain their normal ability to modify the repository.
- `pull`: clean index/worktree, existing HEAD and exactly one upstream remote/branch; explicit URL/ref, `--ff-only --no-rebase --no-autostash`, no recursive submodules or tags.
- `push`: explicit source object ID and `refs/heads/...` destination, no force/mirror/follow-tags/recursive submodules. Uses branch pushRemote, then remote.pushDefault, then upstream remote. The destination branch is the configured upstream merge branch; configured extra push refspecs are intentionally ignored.
- `sync`: pull then push; if pull succeeds and the push phase fails (including a lifecycle/config refusal), returns `{ status: "partial", pulled: true, pushed: false }`. No rollback or retry. Failed commands/timeouts can have partial local or remote effects; inspect before replanning.
- Effective `insteadOf`/`pushInsteadOf` and pushurl targets must match the displayed transport target. Multiple URLs/upstreams, helper protocols and chained rewrites are refused. Local paths/file, SSH (including scp-style), HTTP(S), and native Git URLs are accepted. URL userinfo/query/fragment credentials are redacted; raw URLs remain private to the engine. Sync displays both fetch and push targets when they differ.

Inherited `GIT_*` overrides and askpass variables are removed. Normal HOME/PATH/system Git/SSH-agent credentials remain available. Terminal prompts, GUI askpass and Git Credential Manager interaction are suppressed. No app secrets or login are stored. Git diagnostics and unexpected filesystem errors are replaced by safe error messages; a failure directs users to check the repository and existing credentials in a terminal. Trusted credential helpers/SSH commands must support noninteractive execution; configured programs can still fail or hang until the command timeout. The timeout kills the Git process, not a guaranteed entire descendant process tree.

## Safety boundary and checks

This is a **local-trusted writer**, not a sandbox or filesystem transaction. External processes and authorized hooks/filters can modify files/config between checks and Git execution (residual TOCTOU). The host lock coordinates app actions only; do not describe it as protection against malicious external writers. Remote success may also be uncertain after transport failure. Inspect state instead of repeating a write blindly.

Real fixture tests use temporary repositories/bare remotes, not user repositories or real network targets, and tear down their own directories. They exercise the public service and Git's public interfaces for refusals, trust, stale state, literal filenames, staging/unstaging/deletion/unborn history, staged-only commits, effective push URLs, ff-only pull/divergence, hooks/filters and partial Sync.

```text
node node_modules/vitest/vitest.mjs run src/main/adapters/gitWrite.test.ts
node node_modules/typescript/bin/tsc --build --force
```

No shared Git-summary implementation was changed; its separate inherited-environment boundary remains adjacent work for the parent to assess.

// Sample data until real bridge methods exist; never represents the user's live workspace.
import type { WorkspaceSnapshot } from "./types";

export const PREVIEW_WORKSPACE: WorkspaceSnapshot = {
  files: [
    { name: ".agents", kind: "folder" },
    { name: ".git", kind: "folder", ignored: true },
    { name: ".vscode", kind: "folder" },
    { name: "emails", kind: "folder" },
    { name: "lib", kind: "folder" },
    { name: "odd", kind: "folder" },
    { name: "pages", kind: "folder" },
    { name: "node_modules", kind: "folder", ignored: true },
    { name: ".gitignore", kind: "file" },
    { name: ".mcp.json", kind: "file" },
    { name: "package.json", kind: "file" },
    { name: "pnpm-lock.yaml", kind: "file" },
    { name: "README.md", kind: "file" },
    { name: "tsconfig.json", kind: "file" },
  ],
  odd: {
    phases: [
      { name: "Explore", state: "done" },
      { name: "Plan", state: "done" },
      { name: "Build", state: "current" },
      { name: "Verify", state: "pending" },
      { name: "Deliver", state: "pending" },
    ],
    title: "Login with magic link",
    document: "odd/tasks/magic-link-login.md",
    tasks: [
      { title: "Generate a one-time link that expires", state: "done", detail: "commit 3f1c2a9 · tests green" },
      { title: "Verify the link and open a session", state: "done", detail: "commit 8b0e7d1 · tests green" },
      { title: "Send the login email", state: "current", detail: "in progress · 2 helpers" },
      { title: 'Add "Email me a link" to the login page', state: "pending" },
      { title: "Run all checks and open the pull request", state: "pending" },
    ],
    checks: [
      { label: "Tests", value: "42 passed", tone: "green" },
      { label: "Types", value: "clean", tone: "green" },
      { label: "Review", value: "after task 5", tone: "neutral" },
      { label: "Changed lines", value: "212 / 400", tone: "amber" },
    ],
  },
  git: {
    branch: "feat/magic-link-login",
    upstream: "origin/main",
    ahead: 2,
    changes: [
      { path: "emails/magic-link.tsx", status: "A" },
      { path: "lib/mailer.ts", status: "M" },
      { path: "lib/links.ts", status: "M" },
      { path: "lib/old-token.ts", status: "D" },
    ],
  },
};

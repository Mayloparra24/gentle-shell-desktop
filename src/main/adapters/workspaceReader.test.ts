import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspaceReader } from "./workspaceReader";

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "gentle-workspace-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const reader = () => createWorkspaceReader();

describe("workspace directory reads", () => {
  it("lists one level, directories first, case-insensitive names, dotfiles and file sizes", async () => {
    for (const name of ["zDir", "Adir", ".git", "node_modules"]) await mkdir(path.join(root, name));
    for (const name of ["z.txt", "B.txt", ".hidden"]) await writeFile(path.join(root, name), "abc");
    await writeFile(path.join(root, "Adir", "nested"), "not returned");
    expect(await reader().listDirectory(root, "")).toEqual({ status: "ready", truncated: false, entries: [
      ...[".git", "Adir", "node_modules", "zDir"].map((name) => ({ name, kind: "directory" })),
      ...[".hidden", "B.txt", "z.txt"].map((name) => ({ name, kind: "file", size: 3 })),
    ] });
    expect(await reader().listDirectory(root, "Adir")).toEqual({ status: "ready", truncated: false, entries: [{ name: "nested", kind: "file", size: 12 }] });
  });
  it("caps sorted results at 500 and marks truncation only above the cap", async () => {
    await Promise.all(Array.from({ length: 500 }, (_, i) => writeFile(path.join(root, `f${String(i).padStart(3, "0")}`), "")));
    expect(await reader().listDirectory(root, "")).toMatchObject({ truncated: false, entries: expect.any(Array) });
    await mkdir(path.join(root, "zzz"));
    const result = await reader().listDirectory(root, "");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.entries).toHaveLength(500);
    expect(result.entries[0]).toEqual({ name: "zzz", kind: "directory" });
    expect(result.truncated).toBe(true);
  });
  it.each(["..", "a/../b", "a\\..\\b", "/etc", "C:\\Windows", "C:relative", "\\\\server\\share", "//server/share", "a\0b", "\\root"])("rejects unsafe path %j without changing the listing", async (input) => {
    const before = await reader().listDirectory(root, "");
    expect(await reader().listDirectory(root, input)).toEqual({ status: "error", message: "Invalid relative directory path" });
    expect(await reader().listDirectory(root, "")).toEqual(before);
  });
  it("rejects non-string runtime input", async () => {
    expect(await reader().listDirectory(root, null as unknown as string)).toEqual({ status: "error", message: "Invalid relative directory path" });
  });
  it("refuses symlink/junction escapes and reports links as other without following them", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "gentle-outside-"));
    try {
      await writeFile(path.join(outside, "private.txt"), "never returned");
      await symlink(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
      expect(await reader().listDirectory(root, "escape")).toEqual({ status: "error", message: "Directory is outside the chat folder" });
      expect(await reader().listDirectory(root, "")).toEqual({ status: "ready", truncated: false, entries: [{ name: "escape", kind: "other" }] });
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it("returns no-chat-folder when unknown, and error for missing or non-directory paths", async () => {
    expect(await reader().listDirectory(undefined, "")).toEqual({ status: "no-chat-folder" });
    expect(await reader().listDirectory("", "")).toEqual({ status: "no-chat-folder" });
    expect(await reader().listDirectory(root, "missing")).toMatchObject({ status: "error", message: expect.any(String) });
    await writeFile(path.join(root, "file"), "x");
    expect(await reader().listDirectory(root, "file")).toMatchObject({ status: "error" });
  });
});

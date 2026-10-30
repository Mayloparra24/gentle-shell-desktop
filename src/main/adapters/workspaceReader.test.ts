import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspaceReader } from "./workspaceReader";

vi.mock("node:fs/promises", { spy: true });

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "gentle-workspace-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const reader = () => createWorkspaceReader();

describe("workspace file reads", () => {
  it.each([["one\ntwo\n", "lf"], ["one\r\ntwo\r\n", "crlf"], ["one\r\ntwo\n", "mixed"], ["", "lf"]])("reads UTF-8 and detects %j", async (text, eol) => {
    await writeFile(path.join(root, "root.ts"), `\ufeff${text}`);
    expect(await reader().readFile(root, "root.ts")).toEqual({ status: "ok", path: "root.ts", text, eol, language: "typescript" });
  });
  it.each(["tsx", "js", "jsx", "mjs", "cjs", "json", "css", "md", "txt"])("derives language only from .%s", async extension => {
    await writeFile(path.join(root, `file.${extension}`), "plain");
    const language = extension === "tsx" ? "typescript" : ["js", "jsx", "mjs", "cjs"].includes(extension) ? "javascript" : extension === "txt" ? undefined : extension === "md" ? "markdown" : extension;
    expect(await reader().readFile(root, `file.${extension}`)).toEqual({ status: "ok", path: `file.${extension}`, text: "plain", eol: "lf", language });
  });
  it("bounds reads at 1 MiB and inspects only the first 8 KiB for NUL", async () => {
    await writeFile(path.join(root, "large"), Buffer.alloc(1_048_577));
    const fileOpen = vi.spyOn(fs, "open");
    try {
      expect(await reader().readFile(root, "large")).toEqual({ status: "too-large", size: 1_048_577 });
      expect(fileOpen).not.toHaveBeenCalled();
    } finally { fileOpen.mockRestore(); }
    await writeFile(path.join(root, "binary"), Buffer.from([65, 0, 66]));
    expect(await reader().readFile(root, "binary")).toEqual({ status: "binary" });
    await writeFile(path.join(root, "boundary"), Buffer.alloc(1_048_576, 65));
    expect(await reader().readFile(root, "boundary")).toMatchObject({ status: "ok" });
    await writeFile(path.join(root, "late-nul"), `${"a".repeat(8192)}\0`);
    expect(await reader().readFile(root, "late-nul")).toMatchObject({ status: "ok" });
  });
  it.each(["../file", "a/../b", "a\\..\\b", "/etc", "C:\\Windows", "C:relative", "\\\\server\\share", "//server/share", "a\0b", "\\root", "file:stream", "NUL", "con.txt", "COM1", "lpt9.txt", "", "."])("refuses unsafe file %j", async input => {
    const before = await reader().listDirectory(root, "");
    expect(await reader().readFile(root, input)).toMatchObject({ status: "error" });
    expect(await reader().listDirectory(root, "")).toEqual(before);
  });
  it("handles missing files, directories, runtime input and absent chat folders", async () => {
    expect(await reader().readFile(undefined, "file")).toEqual({ status: "no-chat-folder" });
    expect(await reader().readFile(root, null as unknown as string)).toMatchObject({ status: "error" });
    expect(await reader().readFile(root, "missing")).toMatchObject({ status: "error" });
    await mkdir(path.join(root, "directory"));
    expect(await reader().readFile(root, "directory")).toMatchObject({ status: "error" });
  });
  it("refuses an escaping file symlink itself", async context => {
    const outside = await mkdtemp(path.join(tmpdir(), "gentle-file-link-"));
    try {
      const target = path.join(outside, "private.txt");
      await writeFile(target, "never returned");
      try { await symlink(target, path.join(root, "linked.txt"), "file"); }
      catch (cause) { context.skip(`Cannot create a temp file symlink: ${String(cause)}`); return; }
      expect(await reader().readFile(root, "linked.txt")).toEqual({ status: "error", message: "File is outside the chat folder" });
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it("refuses file access through an escaping symlink/junction", async context => {
    const outside = await mkdtemp(path.join(tmpdir(), "gentle-file-outside-"));
    try {
      await writeFile(path.join(outside, "private.txt"), "never returned");
      try { await symlink(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir"); }
      catch (cause) { context.skip(`Cannot create a temp symlink/junction: ${String(cause)}`); return; }
      expect(await reader().readFile(root, "escape/private.txt")).toEqual({ status: "error", message: "File is outside the chat folder" });
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

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

describe("workspace file reads: reserved names and growth", () => {
  it.each(["CON", "CON.txt", "NUL.txt", "COM1.txt", "LPT1", "LPT1.txt", "parent/CON.txt"])("rejects reserved device variant %j", async input => {
    expect(await reader().readFile(root, input)).toEqual({ status: "error", message: "Invalid file path" });
  });

  it("bounds a file that grows after the handle was inspected", async () => {
    const file = path.join(root, "growing.txt");
    await writeFile(file, "safe");
    const originalOpen = fs.open;
    let requested = 0;
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      const originalRead = handle.read.bind(handle) as (...readArgs: unknown[]) => Promise<unknown>;
      vi.spyOn(handle, "read").mockImplementationOnce((async (...readArgs: unknown[]) => {
        await fs.appendFile(file, Buffer.alloc(1_048_576, 65));
        requested = readArgs[2] as number;
        return originalRead(...readArgs);
      }) as unknown as typeof handle.read);
      return handle;
    });
    try {
      expect(await reader().readFile(root, "growing.txt")).toEqual({ status: "too-large", size: 1_048_580 });
      expect(requested).toBe(1_048_577);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("workspace file reads: POSIX-only inputs", () => {
  // Windows has no mkfifo; the same rule (regular files only) is covered there by the directory and device cases above.
  it.skipIf(process.platform === "win32")("refuses a real named pipe without blocking and lists it as a non-regular entry", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("mkfifo", [path.join(root, "pipe")]);
    const started = Date.now();
    expect(await reader().readFile(root, "pipe")).toEqual({ status: "error", message: "Not a regular file" });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await reader().listDirectory(root, "")).toMatchObject({ entries: [{ name: "pipe", kind: "other" }] });
  });
});

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFolderDialog, folderExists } from "./folderDialog";

describe("native folder dialog", () => {
  it("validates stored folders, rejecting missing paths and files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gentle-folder-"));
    try {
      expect(await folderExists(root)).toBe(true);
      expect(await folderExists(path.join(root, "missing"))).toBe(false);
      const file = path.join(root, "file");
      await writeFile(file, "test");
      expect(await folderExists(file)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("requests only a directory and returns the native selection", async () => {
    const show = vi.fn().mockResolvedValue({ canceled: false, filePaths: ["/picked"] });
    expect(await createFolderDialog(show)()).toBe("/picked");
    expect(show).toHaveBeenCalledExactlyOnceWith({ properties: ["openDirectory"] });
  });
  it("returns nothing for cancel or an empty selection", async () => {
    const show = vi.fn().mockResolvedValueOnce({ canceled: true, filePaths: ["/ignored"] }).mockResolvedValue({ canceled: false, filePaths: [] });
    const choose = createFolderDialog(show);
    expect(await choose()).toBeUndefined();
    expect(await choose()).toBeUndefined();
  });
});

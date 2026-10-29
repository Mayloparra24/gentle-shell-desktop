import { stat } from "node:fs/promises";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";

export async function folderExists(cwd: string): Promise<boolean> {
  try { return (await stat(cwd)).isDirectory(); } catch { return false; }
}

/** Only the main process supplies this native dialog, never a renderer path. */
export function createFolderDialog(showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>): () => Promise<string | undefined> {
  return async () => {
    const result = await showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? undefined : result.filePaths[0];
  };
}

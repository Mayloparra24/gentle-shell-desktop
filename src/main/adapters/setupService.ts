import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { HomeMode, HomeStatus, ProfilesSnapshot, SetupStatus } from "@shared/bridge-types";
import { detectPi, homeDirFor, resolveHomeMode } from "../domain/home/home";
import { parseProfiles } from "../domain/profiles/profilesParser";
import type { SetupService } from "../ports";
import type { AppConfigStore } from "./appConfigStore";

/**
 * SetupService backed by the persisted app config and detectPi (T5).
 * `needsChoice` is true only when no home choice is persisted yet AND pi
 * was actually detected: with no pi on the machine, first-run has nothing
 * useful to offer and gentle-shell-desktop starts in its own isolated
 * space directly (see the first-run mockup's fine print).
 */
export function createSetupService(
  configStore: AppConfigStore,
  env: NodeJS.ProcessEnv = process.env,
  exists: (candidate: string) => boolean = existsSync,
  readText: (file: string) => Promise<string> = (file) => readFile(file, "utf8"),
): SetupService {
  return {
    async status(): Promise<SetupStatus> {
      const detection = detectPi(env, homedir, exists);
      const hasChoice = configStore.read().home !== undefined;
      return { needsChoice: !hasChoice && detection.found, detection };
    },

    async homeStatus(): Promise<HomeStatus> {
      const mode = resolveHomeMode(configStore.read());
      return { mode, dir: homeDirFor(mode, env), detection: detectPi(env, homedir, exists) };
    },

    /**
     * Reads `<config home>/gentle-ai/profiles.json` of the chosen home. The
     * config home is the folder that holds the agent folder (`~/.pi` or
     * `~/.gentle-shell`). Read-only: it never creates or changes a file, and
     * it does not guess where a custom home keeps its profiles.
     */
    async profiles(): Promise<ProfilesSnapshot> {
      const agentDir = homeDirFor(resolveHomeMode(configStore.read()), env);
      if (path.basename(agentDir) !== "agent") {
        return { status: "unsupported", message: "gentle-web cannot tell where this custom home keeps its profiles.", profiles: [] };
      }

      try {
        return parseProfiles(await readText(path.join(path.dirname(agentDir), "gentle-ai", "profiles.json")));
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === "ENOENT") {
          return { status: "none", message: "gentle-shell has not created a profiles file yet.", profiles: [] };
        }
        return { status: "error", message: `Could not read the profiles file: ${errorMessage(error)}`, profiles: [] };
      }
    },

    async chooseHome(mode: HomeMode): Promise<void> {
      try {
        configStore.write({ home: mode });
      } catch (error) {
        // Wraps whatever configStore.write throws (ENOSPC, EACCES, a
        // malformed userData path, ...) with a clear message instead of
        // leaking the raw fs error: ipc's handle() rejection carries only
        // the message text to the renderer (T6 follow-up), and
        // FirstRunContainer shows it as-is ("Could not save your choice:
        // <message>"), so this message alone must already read clearly.
        throw new Error(`Could not save the home choice: ${errorMessage(error)}`, { cause: error });
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

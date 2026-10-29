import type { ProfileInfo, ProfileRoute, ProfilesSnapshot } from "@shared/bridge-types";

/** The only file shape this reader understands; anything else is reported, never shown as if valid. */
export const PROFILES_KIND = "gentle-pi.agent_model_profiles";
export const PROFILES_VERSION = 1;

/** Reserved routing key for the orchestrator; every other key is an agent. */
const ORCHESTRATOR_KEY = "orchestrator";
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRoute(value: unknown): { model?: string; thinking?: string } {
  if (!isRecord(value)) return {};
  const route: { model?: string; thinking?: string } = {};
  if (typeof value.model === "string" && value.model !== "") route.model = value.model;
  if (typeof value.thinking === "string" && value.thinking !== "") route.thinking = value.thinking;
  return route;
}

function readProfile(name: string, config: Record<string, unknown>): ProfileInfo {
  const agents: ProfileRoute[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (key === ORCHESTRATOR_KEY || RESERVED_NAMES.has(key) || !isRecord(value)) continue;
    agents.push({ agent: key, ...readRoute(value) });
  }
  const orchestrator = readRoute(config[ORCHESTRATOR_KEY]);
  return Object.keys(orchestrator).length > 0 ? { name, orchestrator, agents } : { name, agents };
}

/**
 * Turns the text of gentle-shell's `profiles.json` into what the models
 * screen shows. Pure and read-only: a file of another kind or version is
 * reported as unsupported so a future gentle-shell that changes the format
 * shows a notice instead of wrong data.
 */
export function parseProfiles(text: string): ProfilesSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "error", message: "Could not read the profiles file: it is not valid JSON.", profiles: [] };
  }

  if (!isRecord(parsed) || parsed.kind !== PROFILES_KIND) {
    return { status: "unsupported", message: "This profiles file is not one this version of Gentle Shell Desktop understands.", profiles: [] };
  }
  if (parsed.version !== PROFILES_VERSION) {
    return {
      status: "unsupported",
      message: `This profiles file is version ${String(parsed.version)}; this version of Gentle Shell Desktop reads version ${PROFILES_VERSION}.`,
      profiles: [],
    };
  }

  const profiles: ProfileInfo[] = [];
  if (isRecord(parsed.profiles)) {
    for (const [name, config] of Object.entries(parsed.profiles)) {
      if (RESERVED_NAMES.has(name) || !isRecord(config)) continue;
      profiles.push(readProfile(name, config));
    }
  }

  const active = typeof parsed.active === "string" && profiles.some((profile) => profile.name === parsed.active) ? parsed.active : undefined;
  return active === undefined ? { status: "ready", profiles } : { status: "ready", active, profiles };
}

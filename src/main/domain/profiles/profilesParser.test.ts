import { describe, expect, it } from "vitest";
import { parseProfiles } from "./profilesParser";

const file = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    kind: "gentle-pi.agent_model_profiles",
    version: 1,
    active: "deep-work",
    profiles: {
      "deep-work": {
        orchestrator: { model: "anthropic/claude-sonnet-4", thinking: "high" },
        "gentle-ai-worker": { model: "anthropic/claude-sonnet-4", thinking: "high" },
        "gentle-ai-explore": { model: "anthropic/claude-haiku-4" },
        "review-risk": { thinking: "max" },
      },
      current: {},
    },
    ...overrides,
  });

describe("parseProfiles", () => {
  it("reads the profiles in file order with the active one", () => {
    const snapshot = parseProfiles(file());

    expect(snapshot.status).toBe("ready");
    expect(snapshot.active).toBe("deep-work");
    expect(snapshot.profiles.map((profile) => profile.name)).toEqual(["deep-work", "current"]);
  });

  it("reads the orchestrator and every agent route, keeping the fields that are missing as absent", () => {
    const [deepWork] = parseProfiles(file()).profiles;

    expect(deepWork?.orchestrator).toEqual({ model: "anthropic/claude-sonnet-4", thinking: "high" });
    expect(deepWork?.agents).toEqual([
      { agent: "gentle-ai-worker", model: "anthropic/claude-sonnet-4", thinking: "high" },
      { agent: "gentle-ai-explore", model: "anthropic/claude-haiku-4" },
      { agent: "review-risk", thinking: "max" },
    ]);
  });

  it("treats an empty profile as one that inherits everything", () => {
    const current = parseProfiles(file()).profiles.find((profile) => profile.name === "current");

    expect(current).toEqual({ name: "current", agents: [] });
  });

  it("ignores an active name that is not one of the profiles", () => {
    expect(parseProfiles(file({ active: "gone" })).active).toBeUndefined();
  });

  it("reports an empty file as ready with no profiles", () => {
    expect(parseProfiles(file({ profiles: {}, active: undefined }))).toMatchObject({ status: "ready", profiles: [] });
  });

  it("says a file of another kind or version is unsupported instead of showing it", () => {
    expect(parseProfiles(file({ kind: "something.else" }))).toMatchObject({ status: "unsupported", profiles: [] });
    const newer = parseProfiles(file({ version: 2 }));
    expect(newer.status).toBe("unsupported");
    expect(newer.message).toContain("version 2");
  });

  it("reports unreadable JSON as an error", () => {
    expect(parseProfiles("{not json")).toMatchObject({ status: "error", profiles: [] });
  });

  it("skips entries that are not plain objects and reserved names", () => {
    const text = '{"kind":"gentle-pi.agent_model_profiles","version":1,"profiles":{"ok":{"x":"not an object","agent":{"model":"a/b"}},"bad":5,"__proto__":{"agent":{"model":"evil"}}}}';

    const snapshot = parseProfiles(text);

    expect(snapshot.profiles.map((profile) => profile.name)).toEqual(["ok"]);
    expect(snapshot.profiles[0]?.agents).toEqual([{ agent: "agent", model: "a/b" }]);
  });
});

import type { StatusBarInfo } from "./components/StatusBar";

/**
 * Sample status-bar values. The bridge does not expose the branch, model,
 * effort, profile, context usage or cost yet, so these stand in until real
 * methods exist; only the cwd comes from the open chat. StatusBar marks them
 * as sample data.
 */
export const PREVIEW_STATUS: StatusBarInfo = {
  cwd: "~/work/shop-web",
  branch: "feat/magic-link-login",
  dirty: true,
  model: "claude-sonnet-5",
  effort: "medium",
  profile: "balanced",
  contextPercent: 38,
  cost: "$0.84",
  workflow: "ODD · RDD on",
};

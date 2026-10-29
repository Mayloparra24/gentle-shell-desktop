import type { SettingKey } from "@shared/bridge-types";

export const SECTIONS = ["Home", "Appearance", "Editing", "Permissions", "Workflow", "Privacy", "Diagnostics"] as const;
export interface SettingRowDefinition {
  key: SettingKey;
  section: (typeof SECTIONS)[number];
  title: string;
  description: string;
  command: string;
  options?: readonly string[];
  readOnly?: boolean;
}

// Display-only command labels. Only the typed bridge operations perform writes.
export const SETTING_ROWS: readonly SettingRowDefinition[] = [
  { key: "animations", section: "Appearance", title: "Animations", description: "How much motion gentle-shell uses.", command: "/gentle:animations", options: ["quality", "performance", "potato"] },
  { key: "vim", section: "Editing", title: "Vim prompt editing", description: "Edit your prompt with Vim keys.", command: "/gentle:vim" },
  { key: "double-esc-cancel", section: "Editing", title: "Double Esc to cancel", description: "Press Esc twice to stop the agent.", command: "/gentle:double-esc-cancel" },
  { key: "permission-mode", section: "Permissions", title: "Permission mode", description: "How freely the agent may act. Applies to new chats, not the one that is open.", command: "/gentle:mode", options: ["normal", "auto", "yolo", "super-yolo"] },
  { key: "yolo", section: "Permissions", title: "YOLO", description: "gentle-shell only lets you turn YOLO on from an interactive terminal session.", command: "/gentle:yolo", readOnly: true },
  { key: "review-mode", section: "Workflow", title: "Receipt-driven review (RDD)", description: "Lets native review run on high-risk changes. Only you can change it.", command: "/gentle:review-mode" },
  { key: "background-subagents", section: "Workflow", title: "Background subagents", description: "Allow helpers to run while you keep chatting.", command: "/gentle:background-subagents" },
  { key: "telemetry", section: "Privacy", title: "Local telemetry", description: "gentle-ai owns the data and the opt-out.", command: "/gentle:telemetry" },
];
export const DIAGNOSTICS = [
  { kind: "doctor", title: "Run diagnostics", description: "Read-only check of this workspace.", command: "/gentle:doctor" },
  { kind: "status", title: "Package status", description: "Which Gentle AI package and binary are active.", command: "/gentle:status" },
] as const;

export function riskText(key: SettingKey, value: string): string | undefined {
  if (key === "telemetry" && value === "on") return "Telemetry sends usage data to gentle-ai. You can turn it off at any time.";
  if (key !== "permission-mode") return undefined;
  if (value === "yolo") return "YOLO skips ordinary development confirmations for new chats. Destructive confirmations remain.";
  if (value === "super-yolo") return "Super YOLO lets the agent act without asking, including on files outside the current task. Destructive confirmations may still apply.";
  return undefined;
}

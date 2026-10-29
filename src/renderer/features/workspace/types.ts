export type WorkspaceState = "done" | "current" | "pending";

export interface FileEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
  readonly ignored?: boolean;
}

export interface WorkspacePhase {
  readonly name: "Explore" | "Plan" | "Build" | "Verify" | "Deliver";
  readonly state: WorkspaceState;
}

export interface WorkspaceTask {
  readonly title: string;
  readonly state: WorkspaceState;
  readonly detail?: string;
}

export interface WorkspaceCheck {
  readonly label: string;
  readonly value: string;
  readonly tone: "neutral" | "green" | "amber" | "red";
}

export interface OddSnapshot {
  readonly phases: readonly WorkspacePhase[];
  readonly title: string;
  readonly document: string;
  readonly tasks: readonly WorkspaceTask[];
  readonly checks: readonly WorkspaceCheck[];
}

export interface GitChange {
  readonly path: string;
  readonly status: "A" | "M" | "D";
}

export interface GitSnapshot {
  readonly branch: string;
  readonly upstream: string;
  readonly ahead: number;
  readonly changes: readonly GitChange[];
}

export interface WorkspaceSnapshot {
  readonly files: readonly FileEntry[];
  readonly odd: OddSnapshot;
  readonly git: GitSnapshot;
}

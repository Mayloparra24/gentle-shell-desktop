export type GitWriteKind = "stage" | "unstage" | "commit" | "push" | "pull" | "sync";
export interface GitWriteRequest { kind: GitWriteKind; path?: string; message?: string }
export interface GitWriteFile { path: string; code: string }
export interface GitWriteRemote {
  name: string;
  destination: string;
  /** Redacted effective transport targets, never raw config aliases. */
  pullUrl?: string;
  pushUrl?: string;
}
export interface GitWritePlan {
  planId: string;
  kind: GitWriteKind;
  repository: string;
  branch: string;
  files: GitWriteFile[];
  summary: string;
  message?: string;
  needsTrust: boolean;
  expiresAt: number;
  remote?: GitWriteRemote;
}
export interface GitWriteResult {
  kind: GitWriteKind;
  status: "success" | "partial";
  pulled: boolean;
  pushed: boolean;
  message: string;
}

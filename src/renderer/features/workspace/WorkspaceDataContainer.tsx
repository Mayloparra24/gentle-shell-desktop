import { useEffect, useRef, useState } from "react";
import type { DirectoryListing, GitSummary } from "@shared/bridge-types";
import { useBridge } from "@renderer/shared/bridge/useBridge";
import { FilesTab } from "./components/FilesTab";
import { GitTab } from "./components/GitTab";

export type ListingState = DirectoryListing | { readonly status: "loading" };
export type GitState = GitSummary | { readonly status: "loading" };
const error = (cause: unknown) => ({ status: "error" as const, message: cause instanceof Error ? cause.message : String(cause) });

// Remounted for each chat selection, so cached children cannot cross folders.
export function WorkspaceDataContainer({ tab, ready, cwd, onGitChange }: {
  readonly tab: "files" | "git";
  readonly ready: boolean;
  readonly cwd?: string;
  readonly onGitChange?: (git: GitState) => void;
}) {
  const bridge = useBridge();
  const [listings, setListings] = useState<Record<string, ListingState>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [git, setGit] = useState<GitState>({ status: "loading" });
  const alive = useRef(false);
  const gitRequest = useRef(0);

  async function loadDirectory(path: string) {
    setListings(previous => ({ ...previous, [path]: { status: "loading" } }));
    let result: DirectoryListing;
    try { result = await bridge.listDirectory(path); } catch (cause) { result = error(cause); }
    if (alive.current) setListings(previous => ({ ...previous, [path]: result }));
  }
  async function loadGit() {
    const request = ++gitRequest.current;
    setGit({ status: "loading" });
    let result: GitSummary;
    try { result = await bridge.gitSummary(); } catch (cause) { result = error(cause); }
    if (alive.current && request === gitRequest.current) setGit(result);
  }
  useEffect(() => {
    alive.current = true;
    if (ready) { void loadDirectory(""); void loadGit(); }
    return () => { alive.current = false; gitRequest.current += 1; };
  }, [bridge, ready]);

  useEffect(() => { onGitChange?.(git); }, [git, onGitChange]);

  function toggle(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else { next.add(path); if (!listings[path]) void loadDirectory(path); }
    setExpanded(next);
  }
  if (!ready) return <p>Choose a folder to see its files and Git status.</p>;
  if (tab === "git") return <GitTab git={git} onRefresh={() => void loadGit()} />;
  return <FilesTab listings={listings} expanded={expanded} query={query} onQueryChange={setQuery}
    onToggle={toggle} onRetry={path => void loadDirectory(path)} git={git}
    folderName={cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1)} />;
}

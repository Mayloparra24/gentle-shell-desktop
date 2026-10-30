export function GitStatus({ code }: { readonly code: string }) {
  const letter = code === "??" ? "U" : code.trim().at(-1) ?? "";
  const names: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", U: "unmerged", T: "type changed" };
  const label = code === "??" ? "untracked" : [...new Set([...code.trim()].map(value => names[value] ?? value))].join(", ");
  return <span className={`gc-git-status gc-git-status--${letter}`} title={label} aria-label={label}>{letter}</span>;
}

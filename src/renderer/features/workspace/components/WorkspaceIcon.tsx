export function WorkspaceIcon({ name }: { readonly name: "folder" | "branch" | "file" | "code" | "right" | "down" | "refresh" }) {
  return <svg className="gc-workspace-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "folder" && <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
    {name === "branch" && <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10c0 3-3 5-9 6" /></>}
    {(name === "file" || name === "code") && <><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5" />{name === "code" && <path d="M10 13l-2 2 2 2M14 13l2 2-2 2" />}</>}
    {name === "right" && <path d="M9 6l6 6-6 6" />}
    {name === "down" && <path d="M6 9l6 6 6-6" />}
    {name === "refresh" && <path d="M20 12a8 8 0 0 0-14.5-4.5M4 4v4h4M4 12a8 8 0 0 0 14.5 4.5M20 20v-4h-4" />}
  </svg>;
}

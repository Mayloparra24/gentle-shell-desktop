import { useState } from "react";
import { TextField } from "@renderer/shared/ui/atoms/TextField";
import type { FileEntry } from "../types";
import "./FilesTab.css";

export interface FilesTabProps {
  readonly files: readonly FileEntry[];
}

export function FilesTab({ files }: FilesTabProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const visible = files.filter((file) => file.name.toLowerCase().includes(query.toLowerCase()));
  const ordered = [...visible.filter((file) => file.kind === "folder"), ...visible.filter((file) => file.kind === "file")];

  return (
    <div className="gc-files">
      <TextField type="search" aria-label="Search files" placeholder="Search files"
        value={query} onChange={(event) => setQuery(event.target.value)} />
      <ul className="gc-files__list" aria-label="Files">
        {ordered.map((file) => (
          <li key={file.name}>
            <button type="button" className={`gc-files__row${file.ignored ? " gc-files__row--ignored" : ""}`}
              aria-pressed={selected === file.name} onClick={() => setSelected(file.name)}>
              <span className="gc-files__chevron" aria-hidden="true">{file.kind === "folder" ? "›" : ""}</span>
              <span className={`gc-files__icon${file.kind === "folder" ? " gc-files__icon--folder" : ""}`}><FileIcon file={file} /></span>
              <span>{file.name}</span>
              {file.ignored && <span className="gc-files__ignored" title="Ignored" aria-label="Ignored">⊘</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileIcon({ file }: { readonly file: FileEntry }) {
  let detail = <path d="M9 13h6M9 17h4" />;
  if (file.name === "package.json") detail = <path d="m9 12 3-1.5 3 1.5v4l-3 1.5L9 16zM9 12l3 1.5 3-1.5M12 13.5v4" />;
  else if (/lock(?:\.|-)|\.lock$/.test(file.name)) detail = <><rect x="9" y="14" width="6" height="4" rx="1" /><path d="M10 14v-2a2 2 0 0 1 4 0v2" /></>;
  else if (file.name.toLowerCase() === "readme.md") detail = <path d="M8 17v-5l2 3 2-3v5M15 12v5m-1-1 1 1 1-1" />;
  else if (file.name.endsWith(".json")) detail = <path d="M10 12c-2 0 0 3-2 3 2 0 0 3 2 3M14 12c2 0 0 3 2 3-2 0 0 3-2 3" />;
  else if (file.name === ".gitignore") detail = <><circle cx="12" cy="15" r="3" /><path d="m10 17 4-4" /></>;

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {file.kind === "folder" ? <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
        {detail}
      </>}
    </svg>
  );
}

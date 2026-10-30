export function EditorIcon({ name }: { readonly name: "chat" | "code" | "close" | "lock" | "right" }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "chat" && <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />}
    {name === "code" && <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M10 13l-2 2 2 2M14 13l2 2-2 2" />}
    {name === "close" && <path d="M6 6l12 12M18 6L6 18" />}
    {name === "lock" && <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>}
    {name === "right" && <path d="M9 6l6 6-6 6" />}
  </svg>;
}

import type { FileReadResult, FileViewerStatus } from "@shared/bridge-types";
import type { EditorState, Extension } from "@codemirror/state";

async function languageExtension(language: string | undefined, path: string): Promise<Extension> {
  switch (language) {
    case "typescript":
    case "javascript": {
      const { javascriptLanguage, typescriptLanguage, jsxLanguage, tsxLanguage } = await import("@codemirror/lang-javascript");
      const jsx = /\.[jt]sx$/i.test(path);
      return language === "typescript" ? jsx ? tsxLanguage : typescriptLanguage : jsx ? jsxLanguage : javascriptLanguage;
    }
    // Keep only parsers, not language support's editing keymaps or completions.
    case "json": return (await import("@codemirror/lang-json")).jsonLanguage;
    case "css": return (await import("@codemirror/lang-css")).cssLanguage;
    case "markdown": return (await import("@codemirror/lang-markdown")).markdownLanguage;
    default: return [];
  }
}

export async function createSourceView(parent: HTMLElement, file: Extract<FileReadResult, { status: "ok" }>,
  onStatus: (status: FileViewerStatus) => void, cancelled: () => boolean) {
  const [{ EditorState }, { EditorView, lineNumbers, highlightActiveLine }, { HighlightStyle, syntaxHighlighting }, { tags }, language] = await Promise.all([
    import("@codemirror/state"), import("@codemirror/view"), import("@codemirror/language"), import("@lezer/highlight"),
    languageExtension(file.language, file.path),
  ]);
  if (cancelled()) return;
  const report = (state: EditorState) => {
    const position = state.selection.main.head;
    const line = state.doc.lineAt(position);
    onStatus({ line: line.number, column: position - line.from + 1, eol: file.eol, language: file.language });
  };
  const view = new EditorView({ parent, state: EditorState.create({ doc: file.text, extensions: [
    EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), highlightActiveLine(), language,
    EditorView.contentAttributes.of({ tabindex: "0", role: "textbox", "aria-readonly": "true", "aria-multiline": "true", "aria-label": `${file.path.split("/").at(-1)} source` }),
    EditorView.updateListener.of(update => { if (update.selectionSet) report(update.state); }),
    EditorView.theme({
      "&": { height: "100%", backgroundColor: "var(--bg)", color: "var(--text-2)", fontSize: "13px" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "20px", overflow: "auto" },
      ".cm-content": { padding: "8px 0", caretColor: "var(--accent-active)" },
      ".cm-line": { padding: "0 24px 0 8px" },
      ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--muted)", border: "none" },
      ".cm-lineNumbers .cm-gutterElement": { minWidth: "48px", padding: "0 12px 0 8px" },
      ".cm-activeLine": { backgroundColor: "var(--raised)" },
      ".cm-cursor": { borderLeftColor: "var(--accent-active)" },
      ".cm-content ::selection, .cm-content::selection": { backgroundColor: "var(--accent)", color: "var(--bg)" },
      "&.cm-focused": { outline: "1px solid var(--accent-active)", outlineOffset: "-1px" },
    }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: "var(--purple)" },
      { tag: tags.string, color: "var(--green)" },
      { tag: [tags.typeName, tags.className], color: "var(--blue)" },
      { tag: tags.function(tags.variableName), color: "var(--champagne)" },
      { tag: tags.comment, color: "var(--muted)" },
      { tag: tags.tagName, color: "var(--accent)" },
    ])),
  ] }) });
  report(view.state);
  return () => view.destroy();
}

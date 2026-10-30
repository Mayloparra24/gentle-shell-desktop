// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilesTab } from "./FilesTab";

function Files() {
  const [query, setQuery] = useState("");
  return <FilesTab listings={{ "": { status: "ready", truncated: false, entries: [{ name: "README.md", kind: "file" }, { name: "src", kind: "directory" }] } }}
    expanded={new Set()} query={query} onQueryChange={setQuery} onToggle={() => {}} onRetry={() => {}} />;
}

describe("FilesTab", () => {
  it("exposes file rows as native buttons and opens their relative path", () => {
    const open = vi.fn();
    render(<FilesTab listings={{ "": { status: "ready", truncated: false, entries: [{ name: "app.ts", kind: "file" }] } }}
      expanded={new Set()} query="" onQueryChange={() => {}} onToggle={() => {}} onRetry={() => {}} onOpenFile={open} />);
    const file = screen.getByRole("button", { name: "app.ts" });
    expect(file.tagName).toBe("BUTTON");
    fireEvent.click(file);
    expect(open).toHaveBeenCalledExactlyOnceWith("app.ts");
    file.focus();
    expect(file).toHaveFocus();
    // Enter/Space activation is supplied by the native button, not a custom key handler.
    expect(file).not.toHaveAttribute("aria-disabled");
  });
  it("shows the real folder header, refreshes root and annotates available Git changes", () => {
    const refresh = vi.fn();
    render(<FilesTab folderName="project" listings={{ "": { status: "ready", truncated: false, entries: [{ name: "app.ts", kind: "file" }, { name: "new.json", kind: "file" }, { name: "old.css", kind: "file" }] } }}
      git={{ status: "ready", branch: "main", commits: [], truncatedChanges: false, changed: [{ path: "app.ts", code: " M" }, { path: "new.json", code: "??" }, { path: "old.css", code: " D" }] }}
      expanded={new Set()} query="" onQueryChange={() => {}} onToggle={() => {}} onRetry={refresh} />);
    expect(screen.getByText("project")).toBeInTheDocument();
    for (const [letter, label] of [["M", "modified"], ["U", "untracked"], ["D", "deleted"]]) expect(screen.getByTitle(label!)).toHaveTextContent(letter!);
    fireEvent.click(screen.getByRole("button", { name: "Refresh files" }));
    expect(refresh).toHaveBeenCalledExactlyOnceWith("");
  });
  it("filters case-insensitively by name and restores the list on clearing", () => {
    render(<Files />);
    const search = screen.getByRole("searchbox", { name: "Search files" });
    fireEvent.change(search, { target: { value: "readme" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /src/ })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "absent" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

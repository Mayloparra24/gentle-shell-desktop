// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilesTab } from "./FilesTab";

function Files() {
  const [query, setQuery] = useState("");
  return <FilesTab listings={{ "": { status: "ready", truncated: false, entries: [{ name: "README.md", kind: "file" }, { name: "src", kind: "directory" }] } }}
    expanded={new Set()} query={query} onQueryChange={setQuery} onToggle={() => {}} onRetry={() => {}} />;
}

describe("FilesTab", () => {
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

// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilesTab } from "./FilesTab";

describe("FilesTab", () => {
  it("orders folders before files, marks ignored folders and selects a row", () => {
    render(<FilesTab files={[
      { name: "README.md", kind: "file" },
      { name: "node_modules", kind: "folder", ignored: true },
      { name: "src", kind: "folder" },
    ]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("button").textContent)).toEqual([
      "›node_modules⊘", "›src", "README.md",
    ]);
    expect(within(rows[0]!).getByTitle("Ignored")).toHaveTextContent("⊘");
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters case-insensitively by name and restores the list on clearing", () => {
    render(<FilesTab files={[{ name: "README.md", kind: "file" }, { name: "src", kind: "folder" }]} />);
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

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitTab } from "./GitTab";

describe("GitTab", () => {
  it("preserves the branch and changed-path list as read-only data", () => {
    render(<GitTab git={{ status: "ready", branch: "feature", changed: [{ path: "lib/links.ts", code: " M" }], truncatedChanges: false, commits: [] }} onRefresh={() => {}} />);
    expect(screen.getByText("feature")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes · 1" })).toBeInTheDocument();
    expect(screen.getByText("links.ts")).toBeInTheDocument();
    expect(screen.getByText("lib")).toBeInTheDocument();
    expect(screen.getByText("M")).toHaveAttribute("title", "modified");
    expect(screen.getByText("No commits yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stage|commit|push|pull|sync/i })).not.toBeInTheDocument();
  });
});

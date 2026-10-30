// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  it.each([["lf", "LF"], ["crlf", "CRLF"], ["mixed", "mixed"]] as const)("shows source position, encoding, %s and language", (eol, label) => {
    const view = render(<StatusBar info={{}} file={{ line: 2, column: 7, eol, language: "typescript" }} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(`Ln 2, Col 7 · UTF-8 · ${label} · TypeScript`);
    view.rerender(<StatusBar info={{}} file={{ line: 1, column: 1, eol }} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Plain text");
    view.rerender(<StatusBar info={{}} />);
    expect(screen.getByRole("contentinfo")).not.toHaveTextContent("UTF-8");
  });
  it("shows real model, context and memory in order with drawn icons and opens Models", () => {
    const open = vi.fn();
    render(<StatusBar info={{ cwd: "/work/desktop", branch: "main", session: { model: "real-model", effort: "high", context: { percent: 62, tokens: 124000, window: 200000 } }, memory: "integration-desktop-mvp · saved ✓" }} onOpenModels={open} />);
    const bar = screen.getByRole("contentinfo");
    expect([...bar.children].map(child => child.textContent)).toEqual(["desktop", "branch: main", "real-model · high", "context 62% · 124k / 200k", "integration-desktop-mvp · saved ✓"]);
    fireEvent.click(screen.getByRole("button", { name: "real-model · high" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("meter", { name: "Context window used" })).toHaveAttribute("aria-valuenow", "62");
    expect(bar.lastElementChild?.querySelector("svg")).not.toBeNull();
    expect(bar).not.toHaveTextContent("🧠");
  });
  it("omits absent effort and shows context — after compaction", () => {
    render(<StatusBar info={{ session: { model: "real-model", context: { percent: null, tokens: null, window: 200000 } } }} />);
    expect(screen.getByRole("button", { name: "real-model" })).toBeInTheDocument();
    expect(screen.getByText("context —")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
  it("shows the folder basename, full path tooltip and ready branch", () => {
    render(<StatusBar info={{ cwd: "C:\\work\\desktop\\", branch: "real-branch" }} />);
    expect(screen.getByText("desktop")).toHaveAttribute("title", "C:\\work\\desktop\\");
    expect(screen.getByText("branch: real-branch")).toBeInTheDocument();
  });
  it("shows the folder without inventing a branch outside a repository", () => {
    render(<StatusBar info={{ cwd: "/work/desktop" }} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("desktop");
    expect(screen.getByText("desktop")).toHaveAttribute("title", "/work/desktop");
  });
  it("shows No folder chosen when the folder is unknown, without a branch", () => {
    render(<StatusBar info={{ branch: "must-not-show" }} />);
    expect(screen.getByText("No folder chosen")).toBeInTheDocument();
    expect(screen.queryByText("must-not-show")).not.toBeInTheDocument();
  });
  it("renders no brand or unavailable model, memory, context, cost or workflow cells", () => {
    render(<StatusBar info={{ cwd: "/work/desktop", branch: "main" }} />);
    const bar = screen.getByRole("contentinfo", { name: "Status bar" });
    expect(bar.firstElementChild).toHaveTextContent("desktop");
    expect(bar).not.toHaveTextContent("Gentle Shell Desktop");
    expect(bar.children).toHaveLength(2);
    expect(within(bar).queryByRole("button")).not.toBeInTheDocument();
    expect(bar).not.toHaveTextContent(/model|effort|profile|ctx|%|\$|ODD|RDD/i);
  });
});

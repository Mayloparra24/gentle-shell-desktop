// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  it("shows the folder basename, full path tooltip and ready branch", () => {
    render(<StatusBar info={{ cwd: "C:\\work\\desktop\\", branch: "real-branch" }} />);
    expect(screen.getByText("desktop")).toHaveAttribute("title", "C:\\work\\desktop\\");
    expect(screen.getByText("real-branch")).toBeInTheDocument();
  });
  it("shows the folder without inventing a branch outside a repository", () => {
    render(<StatusBar info={{ cwd: "/work/desktop" }} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Gentle Shell Desktopdesktop");
    expect(screen.getByText("desktop")).toHaveAttribute("title", "/work/desktop");
  });
  it("shows No folder chosen when the folder is unknown, without a branch", () => {
    render(<StatusBar info={{ branch: "must-not-show" }} />);
    expect(screen.getByText("No folder chosen")).toBeInTheDocument();
    expect(screen.queryByText("must-not-show")).not.toBeInTheDocument();
  });
  it("keeps the brand first and renders no model, effort, profile, context, cost or workflow cells", () => {
    render(<StatusBar info={{ cwd: "/work/desktop", branch: "main" }} />);
    const bar = screen.getByRole("contentinfo", { name: "Status bar" });
    expect(bar.firstElementChild).toHaveTextContent("Gentle Shell Desktop");
    expect(bar.children).toHaveLength(3);
    expect(within(bar).queryByRole("button")).not.toBeInTheDocument();
    expect(bar).not.toHaveTextContent(/model|effort|profile|ctx|%|\$|ODD|RDD/i);
  });
});

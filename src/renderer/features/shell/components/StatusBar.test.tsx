// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

const INFO = {
  cwd: "~/work/shop-web",
  branch: "feat/magic-link-login",
  dirty: true,
  model: "claude-sonnet-5",
  effort: "medium",
  profile: "balanced",
  contextPercent: 38,
  cost: "$0.84",
  workflow: "ODD · RDD on",
};

describe("StatusBar", () => {
  it("shows every segment in order", () => {
    render(<StatusBar info={INFO} />);
    const bar = screen.getByRole("contentinfo", { name: "Status bar" });

    expect(bar).toHaveTextContent(
      "gentle shell~/work/shop-webfeat/magic-link-login *claude-sonnet-5effort mediumprofile balancedctx 38%$0.84ODD · RDD on",
    );
  });

  it("omits the asterisk when the branch is clean", () => {
    render(<StatusBar info={{ ...INFO, dirty: false }} />);
    expect(screen.getByText("feat/magic-link-login")).toBeInTheDocument();
    expect(screen.queryByText("feat/magic-link-login *")).not.toBeInTheDocument();
  });

  it("marks the values that are sample data", () => {
    render(<StatusBar info={INFO} sample />);
    expect(screen.getByText("claude-sonnet-5")).toHaveAttribute("title", "Sample value · not connected yet");
  });

  it("does not mark the cwd as sample data", () => {
    render(<StatusBar info={INFO} sample />);
    expect(screen.getByText("~/work/shop-web")).not.toHaveAttribute("title");
  });
});

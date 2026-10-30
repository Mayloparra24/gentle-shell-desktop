// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitWritePlan } from "@shared/git-write-types";
import { GitWriteConfirmation } from "./GitWriteConfirmation";

const plan: GitWritePlan = { planId: "one", kind: "commit", repository: "/canonical/<repo>", branch: "main", files: [{ path: "<file>.ts", code: "M " }], message: "<script>not HTML</script>", summary: "Commit staged changes", needsTrust: false, expiresAt: Date.now() + 1000 };
describe("Git write confirmation", () => {
  it("renders literal plan text, traps focus, cancels with Escape and restores focus", () => {
    const cancel = vi.fn();
    const view = render(<button>Trigger</button>);
    const trigger = screen.getByRole("button"); trigger.focus();
    view.rerender(<><button>Trigger</button><GitWriteConfirmation plan={plan} onCancel={cancel} onConfirm={() => {}} /></>);
    expect(screen.getByText("<script>not HTML</script>")).toBeInTheDocument();
    const first = screen.getByRole("button", { name: "Cancel" });
    const last = screen.getByRole("button", { name: "Confirm" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Escape" }); expect(cancel).toHaveBeenCalledTimes(1);
    view.rerender(<button>Trigger</button>); expect(trigger).toHaveFocus();
  });

  it("consumes confirmation synchronously even before its parent rerenders", () => {
    const confirm = vi.fn(); const cancel = vi.fn();
    render(<GitWriteConfirmation plan={{ ...plan, needsTrust: true }} onCancel={cancel} onConfirm={confirm} />);
    expect(screen.getByRole("dialog")).toHaveTextContent(/hooks, filters, signing tools and credential programs/);
    const accept = screen.getByRole("button", { name: "Trust for this session" });
    fireEvent.click(accept); fireEvent.click(accept);
    fireEvent.keyDown(accept, { key: "Escape" });
    expect(confirm).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled();
  });
});

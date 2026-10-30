// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { HelpersActivity, HelperTask } from "@shared/bridge-types";
import { AgentsDialog } from "./AgentsDialog";

function task(id: string, status: HelperTask["status"] = "running"): HelperTask {
  return { id, label: `Task ${id}`, agent: "explore", prompt: `Prompt ${id}`, status,
    createdAt: "2026-09-22T10:00:00Z", startedAt: "2026-09-22T10:00:00Z", endedAt: "2026-09-22T10:01:40Z",
    turns: 3, toolCalls: 6, lastStep: "Read", thread: { version: 1, dropped: 0, items: [
      { kind: "text", text: `Narration ${id}` }, { kind: "tool", callId: id, name: "Read", args: { path: "src/main.ts" }, output: "hidden output" },
    ] } };
}
function activity(tasks: HelperTask[]): HelpersActivity {
  return { summary: { running: 2, queued: 0, waiting: 1, finished: 2 }, tasks };
}
it("lists real agents with meta, summary and a read-only selected detail; arrows and clicks select", () => {
  render(<AgentsDialog activity={activity([task("1"), task("2", "waiting")])} onClose={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "Agents & jobs" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(screen.getByText("2 running · 1 waiting · 2 finished")).toBeInTheDocument();
  const first = screen.getByRole("button", { name: /Task 1/ });
  const second = screen.getByRole("button", { name: /Task 2/ });
  expect(first).toHaveAttribute("aria-current", "true");
  expect(first).toHaveTextContent("running · 1m 40s · 1 step");
  expect(first).toHaveTextContent("Agent");
  expect(screen.getByRole("heading", { name: "Task 1 Agent" })).toBeInTheDocument();
  expect(screen.getByText("explore · 1m 40s")).toBeInTheDocument();
  expect(screen.getByText("Prompt 1")).toBeInTheDocument();
  expect(screen.getByText("Narration 1")).toBeInTheDocument();
  expect(screen.getByText("Read src/main.ts")).toBeInTheDocument();
  const detail = screen.getByRole("region", { name: "Selected agent" });
  expect(within(detail).getAllByRole("definition").map((cell) => cell.textContent)).toEqual(["running", "3", "6", "Read"]);
  for (const label of ["Status", "Turns", "Tool calls", "Last step"]) expect(within(detail).getByText(label, { exact: true })).toBeInTheDocument();
  for (const name of ["Task", "Thread"]) expect(within(detail).getByRole("heading", { name })).toBeInTheDocument();
  expect(screen.queryByText("hidden output")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /^(cancel|stop|jobs|all)$/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Job", { exact: true })).not.toBeInTheDocument();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(second).toHaveFocus();
  expect(second).toHaveAttribute("aria-current", "true");
  expect(screen.getByText("Prompt 2")).toBeInTheDocument();
  fireEvent.keyDown(second, { key: "ArrowUp" });
  expect(first).toHaveFocus();
  fireEvent.click(second);
  expect(screen.getByText("Prompt 2")).toBeInTheDocument();
});
it("preserves selection on updates and falls back to the first remaining item", () => {
  const { rerender } = render(<AgentsDialog activity={activity([task("1"), task("2")])} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Task 2/ }));
  rerender(<AgentsDialog activity={activity([task("1"), task("2", "done")])} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /Task 2/ })).toHaveAttribute("aria-current", "true");
  rerender(<AgentsDialog activity={activity([task("1")])} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /Task 1/ })).toHaveAttribute("aria-current", "true");
});
it("renders the empty state, closes on Escape or close, and traps focus", () => {
  const onClose = vi.fn();
  render(<AgentsDialog activity={activity([])} onClose={onClose} />);
  expect(screen.getByText("No agents or jobs yet")).toBeInTheDocument();
  expect(screen.getByText("Helpers started by Gentle appear here while they work.")).toBeInTheDocument();
  const close = screen.getByRole("button", { name: "Close agents and jobs" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledTimes(2);
});

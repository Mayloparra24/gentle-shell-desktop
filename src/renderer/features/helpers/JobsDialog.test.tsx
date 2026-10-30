// @vitest-environment jsdom
import { expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FinishedJob } from "@shared/bridge-types";
import { AgentsDialog } from "./AgentsDialog";

const job: FinishedJob = { id: "job-1", kind: "command", label: "Build", status: "exited", exitCode: 0,
  command: "<b>echo hi</b>", lastOutput: "<script>bad()</script>", outputPath: "/tmp/job.log", endedAt: "2026-10-30T10:00:00Z" };
it("hides filters for agents-only and shows job counts, read-only fields and plain text", () => {
  const { rerender } = render(<AgentsDialog onClose={() => {}} />);
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  rerender(<AgentsDialog jobs={{ running: 2, finished: [job] }} onClose={() => {}} />);
  expect(screen.getByRole("tab", { name: "All 3" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Agents 0" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Jobs 3" })).toBeInTheDocument();
  expect(screen.getByText("2 running · 1 finished")).toBeInTheDocument();
  expect(screen.getByText("2 jobs running")).toBeInTheDocument();
  expect(screen.getByText("Details appear when each job finishes.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Build.*Job/ })).toBeInTheDocument();
  const detail = screen.getByRole("region", { name: "Selected job" });
  expect(within(detail).getByRole("heading", { name: "Build Job" }).querySelector("[data-status]")).toHaveAttribute("data-status", "done");
  expect(within(detail).getByText("Background command")).toBeInTheDocument();
  expect(within(detail).getAllByRole("definition").map(cell => cell.textContent)).toEqual(["exited", "0", "command"]);
  for (const text of ["Command", "Last output", "Full output", job.command!, job.lastOutput!, job.outputPath!]) expect(within(detail).getByText(text)).toBeInTheDocument();
  expect(detail.querySelector("script, b, a")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Agents 0" }));
  expect(screen.queryByRole("button", { name: /Build.*Job/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Jobs 3" }));
  expect(screen.getByRole("region", { name: "Selected job" })).toBeInTheDocument();
});
it.each([["exited", 1, "failed"], ["failed", undefined, "failed"], ["stopped", undefined, "stopped"]] as const)("colors %s / %s", (status, exitCode, color) => {
  render(<AgentsDialog jobs={{ running: 0, finished: [{ ...job, status, exitCode }] }} onClose={() => {}} />);
  expect(screen.getByRole("region", { name: "Selected job" }).querySelector("[data-status]")).toHaveAttribute("data-status", color);
});
it("shows a running-only placeholder rather than the empty state or invented job details", () => {
  render(<AgentsDialog jobs={{ running: 1, finished: [] }} onClose={() => {}} />);
  expect(screen.getByText("1 job running")).toBeInTheDocument();
  expect(screen.queryByText("No agents or jobs yet")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Selected job" })).not.toBeInTheDocument();
});

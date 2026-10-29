// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ProfilesSnapshot } from "@shared/bridge-types";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import { ModelsContainer } from "./ModelsContainer";

const ready: ProfilesSnapshot = { status: "ready", active: "balanced", profiles: [
  { name: "other", agents: [{ agent: "worker", model: "other-model", thinking: "low" }] },
  { name: "balanced", orchestrator: { model: "main-model", thinking: "high" }, agents: [{ agent: "explore" }, { agent: "review", model: "review-model" }] },
] };
function setup(result: ProfilesSnapshot = ready) {
  const readProfiles = vi.fn().mockResolvedValue(result);
  window.gentle = { ...mockBridge, readProfiles };
  const onBack = vi.fn();
  return { readProfiles, onBack, ...render(<ModelsContainer onBack={onBack} />) };
}
afterEach(() => { delete window.gentle; });
it("shows loading until the read resolves", () => {
  window.gentle = { ...mockBridge, readProfiles: vi.fn(() => new Promise<ProfilesSnapshot>(() => {})) };
  render(<ModelsContainer onBack={() => {}} />);
  expect(screen.getByLabelText("Loading profiles")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it.each(["none", "unsupported", "error"] as const)("renders %s without a table", async (status) => {
  setup({ status, message: "Reader explanation", profiles: [] });
  expect(await screen.findByText("Reader explanation")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  if (status === "none") expect(screen.getByRole("heading", { name: "No profiles yet" })).toBeInTheDocument();
  if (status === "unsupported") expect(screen.getByRole("status")).toHaveTextContent("Reader explanation");
  if (status === "error") expect(screen.getByRole("alert")).toHaveTextContent("Reader explanation");
  expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
});
it("retries a rejected read", async () => {
  const readProfiles = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(ready);
  window.gentle = { ...mockBridge, readProfiles };
  render(<ModelsContainer onBack={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(readProfiles).toHaveBeenCalledTimes(2);
});
it("renders the default tab, ordered read-only routes and back", async () => {
  const { onBack } = setup();
  const table = await screen.findByRole("table");
  expect(screen.getByRole("tab", { name: /balanced/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Default for new sessions")).toHaveAttribute("title", "Default for new sessions");
  expect(within(table).getAllByRole("row").map((row) => row.textContent)).toEqual([
    "AgentModelEffort", "Orchestratormain-modelhigh", "exploreinheritinherit", "reviewreview-modelinherit",
  ]);
  expect(screen.getByRole("status")).toHaveTextContent("Read-only for now. To change profiles, use /gentle:profiles in gentle-shell.");
  expect(screen.getByText("★ default for new sessions")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  for (const name of ["Save", "Make default", "Use in this session"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  expect(within(table).queryByRole("button")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "← Back to chat" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
it("switches by click and wrapping arrow keys with roving focus", async () => {
  setup();
  const other = await screen.findByRole("tab", { name: "other" });
  const balanced = screen.getByRole("tab", { name: /balanced/ });
  fireEvent.click(other);
  expect(other).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("other");
  expect(screen.queryByText("Orchestrator")).not.toBeInTheDocument();
  expect(screen.getByText("other-model")).toBeInTheDocument();
  fireEvent.keyDown(other, { key: "ArrowLeft" });
  expect(balanced).toHaveFocus();
  expect(balanced).toHaveAttribute("tabindex", "0");
  expect(other).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(balanced, { key: "ArrowRight" });
  expect(other).toHaveFocus();
  expect(other).toHaveAttribute("aria-selected", "true");
});
it("falls back to the first profile when no default is set", async () => {
  setup({ ...ready, active: undefined });
  expect(await screen.findByRole("tab", { name: "other" })).toHaveAttribute("aria-selected", "true");
});
it("ignores stale reads after the bridge changes", async () => {
  let resolve!: (snapshot: ProfilesSnapshot) => void;
  window.gentle = { ...mockBridge, readProfiles: vi.fn(() => new Promise<ProfilesSnapshot>((done) => { resolve = done; })) };
  const view = render(<ModelsContainer onBack={() => {}} />);
  window.gentle = { ...mockBridge, readProfiles: vi.fn().mockResolvedValue(ready) };
  view.rerender(<ModelsContainer onBack={() => {}} />);
  await screen.findByRole("table");
  await act(async () => resolve({ status: "error", message: "stale", profiles: [] }));
  expect(screen.queryByText("stale")).not.toBeInTheDocument();
});

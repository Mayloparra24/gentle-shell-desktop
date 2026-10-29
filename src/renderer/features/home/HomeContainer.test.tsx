// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HomeStatus } from "@shared/bridge-types";
import { mockBridge, resetMockBridge } from "@renderer/shared/bridge/mockBridge";
import { HomeContainer } from "./HomeContainer";

afterEach(() => { vi.restoreAllMocks(); resetMockBridge(); });

it("persists the choice, reloads its resolved status, and notifies the parent", async () => {
  resetMockBridge();
  const choose = vi.spyOn(mockBridge, "chooseHome");
  const load = vi.spyOn(mockBridge, "homeStatus");
  const onChanged = vi.fn();
  render(<HomeContainer onChanged={onChanged} />);
  const select = await screen.findByRole("combobox", { name: "Home" });
  expect(select).toHaveValue("isolated");
  expect(onChanged).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: "link" } });
  await waitFor(() => expect(onChanged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ mode: "link", dir: "~/.pi/agent" })));
  expect(choose).toHaveBeenCalledExactlyOnceWith("link");
  expect(load).toHaveBeenCalledTimes(2);
  expect(select).toHaveValue("link");
  expect(select).toHaveAttribute("title", "~/.pi/agent");
});

it("shows a failed switch as an alert and keeps the previous selection and stored mode", async () => {
  resetMockBridge();
  const choose = vi.spyOn(mockBridge, "chooseHome").mockRejectedValue(new Error("permission denied"));
  const load = vi.spyOn(mockBridge, "homeStatus");
  const onChanged = vi.fn();
  render(<HomeContainer onChanged={onChanged} />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Home" }), { target: { value: "link" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not switch home: permission denied");
  expect(screen.getByRole("combobox", { name: "Home" })).toHaveValue("isolated");
  expect(choose).toHaveBeenCalledExactlyOnceWith("link");
  expect(load).toHaveBeenCalledTimes(1);
  expect(onChanged).not.toHaveBeenCalled();
  expect((await mockBridge.homeStatus()).mode).toBe("isolated");
});

it("ignores a switch that finishes after unmount", async () => {
  resetMockBridge();
  let finish!: () => void;
  vi.spyOn(mockBridge, "chooseHome").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const load = vi.spyOn(mockBridge, "homeStatus");
  const onChanged = vi.fn();
  const view = render(<HomeContainer onChanged={onChanged} />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Home" }), { target: { value: "link" } });
  view.unmount();
  await act(async () => { finish(); });
  expect(onChanged).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(1);
});

it("ignores an initial status that finishes after unmount", async () => {
  let finish!: (status: HomeStatus) => void;
  const status = await mockBridge.homeStatus();
  vi.spyOn(mockBridge, "homeStatus").mockImplementation(() => new Promise<HomeStatus>((resolve) => { finish = resolve; }));
  const onChanged = vi.fn();
  const view = render(<HomeContainer onChanged={onChanged} />);
  view.unmount();
  await act(async () => { finish(status); });
  expect(onChanged).not.toHaveBeenCalled();
});

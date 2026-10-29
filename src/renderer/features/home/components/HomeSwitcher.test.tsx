// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HomeStatus } from "@shared/bridge-types";
import { HomeSwitcher } from "./HomeSwitcher";

const status: HomeStatus = {
  mode: "isolated", dir: "~/.gentle-shell/agent",
  detection: { found: false, dir: "~/.pi/agent", hasAuth: false, hasModels: false },
};

it("disables .pi when no pi folder was detected and shows the resolved folders", () => {
  render(<HomeSwitcher status={status} onChange={vi.fn()} />);
  expect(screen.getByRole("option", { name: ".pi" })).toBeDisabled();
  expect(screen.getByRole("option", { name: ".pi" })).toHaveAttribute("title", "~/.pi/agent");
  expect(screen.getByRole("combobox", { name: "Home" })).toHaveValue("isolated");
  expect(screen.getByRole("combobox", { name: "Home" })).toHaveAttribute("title", status.dir);
});

it("offers a detected pi folder and reports mode changes", () => {
  const onChange = vi.fn();
  render(<HomeSwitcher status={{ ...status, detection: { ...status.detection, found: true } }} onChange={onChange} />);
  expect(screen.getByRole("option", { name: ".pi" })).toBeEnabled();
  fireEvent.change(screen.getByRole("combobox", { name: "Home" }), { target: { value: "link" } });
  expect(onChange).toHaveBeenCalledExactlyOnceWith("link");
});

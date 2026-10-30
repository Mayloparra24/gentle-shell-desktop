// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";
import { SettingsContainer } from "./SettingsContainer";

function setup(found = true) {
  const bridge = {
    ...mockBridge,
    readSettings: vi.fn().mockResolvedValue([
      { key: "permission-mode", value: "normal" }, { key: "telemetry", value: "off" },
      { key: "yolo", value: "off" }, { key: "background-subagents", unavailable: true },
      { key: "review-mode", value: "off" },
    ]),
    setSetting: vi.fn().mockImplementation(async (key, value) => ({ key, value })),
    homeStatus: vi.fn().mockResolvedValue({ mode: "isolated", dir: "/mock/gentle", detection: { found, dir: "/mock/pi", hasAuth: false, hasModels: false } }),
    chooseHome: vi.fn().mockResolvedValue(undefined),
    runDiagnostic: vi.fn().mockResolvedValue("All checks passed"),
  };
  window.gentle = bridge;
  const props = { onOpenModels: vi.fn(), onClose: vi.fn(), onHomeChanged: vi.fn(), homeVersion: 0, themeId: "gentleman-cute" as const, onChangeTheme: vi.fn() };
  const view = render(<SettingsContainer {...props} />);
  return { bridge, props, unmount: view.unmount };
}
afterEach(() => { delete window.gentle; vi.restoreAllMocks(); });

describe("Settings", () => {
  it("closes settings and opens the models dialog from its dedicated row", async () => {
    const { props, bridge } = setup();
    expect(screen.getByText("Profiles, models and effort")).toBeInTheDocument();
    expect(screen.getByText("View the profiles, models and effort used by each agent, as in /gentle:profiles in gentle-shell.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open models →" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpenModels).toHaveBeenCalledTimes(1);
    expect(bridge.setSetting).not.toHaveBeenCalled();
    await screen.findByRole("radio", { checked: true });
  });
  it("renders ordered sections, confirmed switches, commands and unavailable compatibility", async () => {
    const { bridge } = setup();
    expect(within(screen.getByRole("navigation")).getAllByRole("button").map((el) => el.textContent)).toEqual(["Home", "Models", "Appearance", "Permissions", "Workflow", "Privacy", "Diagnostics"]);
    const control = await screen.findByRole("switch", { name: "Receipt-driven review (RDD)" });
    expect(screen.queryByText("Vim prompt editing")).not.toBeInTheDocument();
    expect(screen.queryByText("Animations")).not.toBeInTheDocument();
    expect(screen.queryByText("Double Esc to cancel")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    await waitFor(() => expect(control).not.toBeDisabled());
    expect(screen.queryByRole("switch", { name: "Background subagents" })).not.toBeInTheDocument();
    fireEvent.click(control);
    await waitFor(() => expect(control).toHaveAttribute("aria-checked", "true"));
    expect(bridge.setSetting).toHaveBeenCalledWith("review-mode", "on");
    expect(screen.getByText("Applied")).toHaveAttribute("role", "status");
    expect(screen.getByText("/gentle:review-mode").tagName).toBe("CODE");
    expect(screen.getByRole("switch", { name: "YOLO" })).toBeDisabled();
    expect(screen.getByText(/Applies to new chats, not the one that is open/)).toBeInTheDocument();
  });

  it("shows write errors and retains the old value", async () => {
    const { bridge } = setup();
    bridge.setSetting.mockRejectedValueOnce(new Error("Could not save"));
    const control = screen.getByRole("switch", { name: "Receipt-driven review (RDD)" });
    await waitFor(() => expect(control).not.toBeDisabled());
    fireEvent.click(control);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it.each(["yolo", "super-yolo", "telemetry"])("asks before enabling %s, cancels without sending and confirms explicitly", async (value) => {
    const { bridge } = setup();
    const control = value === "telemetry" ? screen.getByRole("switch", { name: "Local telemetry" }) : screen.getByRole("button", { name: value });
    await waitFor(() => expect(control).not.toBeDisabled());
    control.focus();
    fireEvent.click(control);
    const confirmation = screen.getByRole("alertdialog", { name: "Turn this on?" });
    expect(confirmation).toHaveAttribute("aria-describedby");
    expect(bridge.setSetting).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(bridge.setSetting).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
    fireEvent.click(control);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(bridge.setSetting).not.toHaveBeenCalled();
    fireEvent.click(control);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(bridge.setSetting).toHaveBeenCalledWith(value === "telemetry" ? "telemetry" : "permission-mode", value === "telemetry" ? "on" : value));
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("switches home, reloads status and notifies App", async () => {
    const { bridge, props } = setup();
    const pi = await screen.findByRole("radio", { name: /^\.pi/ });
    bridge.homeStatus.mockResolvedValue({ mode: "link", dir: "/mock/pi", detection: { found: true, dir: "/mock/pi", hasAuth: false, hasModels: false } });
    fireEvent.click(pi);
    await waitFor(() => expect(props.onHomeChanged).toHaveBeenCalledTimes(1));
    expect(bridge.chooseHome).toHaveBeenCalledWith("link");
    expect(bridge.homeStatus).toHaveBeenCalledTimes(2);
    expect(pi).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("/mock/pi")).toBeInTheDocument();
  });

  it("still notifies App when a persisted home switch finishes after the dialog closes", async () => {
    const { bridge, props, unmount } = setup();
    let finish!: () => void;
    bridge.chooseHome.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.click(await screen.findByRole("radio", { name: /^\.pi/ }));
    unmount();
    await act(async () => finish());
    expect(props.onHomeChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous home on failure", async () => {
    const { bridge, props } = setup();
    bridge.chooseHome.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(await screen.findByRole("radio", { name: /^\.pi/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not switch home: denied");
    expect(screen.getByRole("radio", { name: /^\.gentle-shell/ })).toHaveAttribute("aria-checked", "true");
    expect(props.onHomeChanged).not.toHaveBeenCalled();
  });

  it("disables missing pi home and shows diagnostic output", async () => {
    const { bridge } = setup(false);
    expect(await screen.findByRole("radio", { name: /^\.pi/ })).toBeDisabled();
    expect(screen.getByText(/No pi folder detected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));
    expect(await screen.findByText("All checks passed")).toHaveAttribute("role", "status");
    expect(bridge.runDiagnostic).toHaveBeenCalledWith("doctor");
    fireEvent.click(screen.getByRole("button", { name: "Package status" }));
    await waitFor(() => expect(bridge.runDiagnostic).toHaveBeenCalledWith("status"));
  });

  it("reports diagnostic failures and loading", async () => {
    const { bridge } = setup();
    let reject!: (cause: Error) => void;
    bridge.runDiagnostic.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));
    expect(screen.getByRole("button", { name: "Package status" })).toBeDisabled();
    expect(screen.getByText("Running diagnostics…")).toHaveAttribute("role", "status");
    reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";

afterEach(() => vi.restoreAllMocks());

it("opens settings, restores focus on Escape and resets an existing chat after switching home", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  const listChats = vi.spyOn(mockBridge, "listChats");
  const newChat = vi.spyOn(mockBridge, "newChat");
  const readSettings = vi.spyOn(mockBridge, "readSettings");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
  expect(await screen.findByRole("heading", { name: "Write the README intro" })).toBeInTheDocument();
  const settings = screen.getByRole("button", { name: "Settings" });
  const composer = screen.getByRole("textbox", { name: "Message" });
  composer.focus();
  fireEvent.change(composer, { target: { value: "A draft from the old home" } });
  fireEvent.click(settings);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  const selectedHome = await screen.findByRole("radio", { checked: true });
  const otherHome = screen.getAllByRole("radio").find((radio) => radio !== selectedHome)!;
  const listsBefore = listChats.mock.calls.length;
  const chatsBefore = newChat.mock.calls.length;
  const readsBefore = readSettings.mock.calls.length;
  fireEvent.click(otherHome);
  expect(await screen.findByRole("heading", { name: "New chat" })).toBeInTheDocument();
  await waitFor(() => expect(listChats).toHaveBeenCalledTimes(listsBefore + 1));
  expect(newChat).toHaveBeenCalledTimes(chatsBefore + 1);
  await waitFor(() => expect(readSettings).toHaveBeenCalledTimes(readsBefore + 1));
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  expect(screen.queryByRole("heading", { name: "Write the README intro" })).not.toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  expect(settings).toHaveFocus();
  window.history.pushState({}, "", "/");
});

// `?firstRun=0` forces mockBridge.setupStatus() to needsChoice: false (see
// mockBridge's firstRunOverride), so these tests exercise the normal chat
// layout without going through the first-run screen mockBridge shows by
// default for the browser preview.
it("returns focus to Settings when opened with the composer focused and closed with the close button", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  render(<App />);
  const composer = await screen.findByRole("textbox", { name: "Message" });
  composer.focus();
  const settings = screen.getByRole("button", { name: "Settings" });
  fireEvent.click(settings);
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(settings).toHaveFocus();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("waits for the selected chat to open before refetching workspace data", async () => {
    let resolve!: (state: Awaited<ReturnType<typeof mockBridge.openChat>>) => void;
    const initial = await mockBridge.newChat();
    vi.spyOn(mockBridge, "openChat").mockImplementation(() => new Promise(r => { resolve = r; }));
    const list = vi.spyOn(mockBridge, "listDirectory");
    const git = vi.spyOn(mockBridge, "gitSummary");
    render(<App />);
    await screen.findByRole("textbox", { name: "Message" });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Write the README intro/ }));
    expect(list).toHaveBeenCalledTimes(1);
    resolve(initial);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(git).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });
  it("opens models without unmounting chat and restores its draft on Back", async () => {
    const newChat = vi.spyOn(mockBridge, "newChat");
    render(<App />);
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "keep this draft" } });
    const opens = newChat.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Open models screen \(model/ }));
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(composer).not.toBeVisible();
    expect(newChat).toHaveBeenCalledTimes(opens);
    fireEvent.click(screen.getByRole("button", { name: "← Back to chat" }));
    expect(composer).toBeVisible();
    expect(composer).toHaveValue("keep this draft");
    expect(newChat).toHaveBeenCalledTimes(opens);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open models screen →" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Back to chat" }));
    fireEvent.change(composer, { target: { value: "/gentle:profiles" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });
  beforeEach(() => {
    window.history.pushState({}, "", "?firstRun=0");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the sidebar heading and the composer placeholder", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Tell Gentle what you need…"),
    ).toBeInTheDocument();
  });

  it('opens a fresh "New chat" by default', async () => {
    render(<App />);

    expect(await screen.findAllByRole("heading", { name: "New chat" })).toHaveLength(1);
  });

  it("selecting a sidebar chat updates the conversation header title", async () => {
    render(<App />);

    // mockBridge's example chats load asynchronously into the sidebar.
    const item = await screen.findByRole("button", { name: /Write the README intro/ });
    item.click();

    expect(await screen.findByRole("heading", { name: "Write the README intro" })).toBeInTheDocument();
  });

  it("shows the first-run screen when setupStatus reports needsChoice (no persisted home choice yet)", async () => {
    window.history.pushState({}, "", "?firstRun=1");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Welcome to Gentle Shell Desktop" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Projects" })).not.toBeInTheDocument();
  });

  it("choosing a home in first-run switches to the normal chat layout", async () => {
    window.history.pushState({}, "", "?firstRun=1");

    render(<App />);

    const button = await screen.findByRole("button", { name: "Use my pi setup" });
    button.click();

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome to Gentle Shell Desktop" })).not.toBeInTheDocument();
  });
});

describe("App shell layout", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "?firstRun=0");
    window.localStorage.clear();
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    window.localStorage.clear();
  });

  it("hides and shows the chat list from the top bar without unmounting it", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: "Toggle chat list" });
    expect(screen.getByTestId("left-panel")).toHaveAttribute("data-open", "true");

    toggle.click();
    await waitFor(() => expect(screen.getByTestId("left-panel")).toHaveAttribute("data-open", "false"));
    expect(screen.getByTestId("right-panel")).toHaveAttribute("data-open", "true");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    toggle.click();
    await waitFor(() => expect(screen.getByTestId("left-panel")).toHaveAttribute("data-open", "true"));
  });

  it("hides the side panel, leaving only the chat", async () => {
    render(<App />);
    (await screen.findByRole("button", { name: "Toggle side panel" })).click();

    await waitFor(() => expect(screen.getByTestId("right-panel")).toHaveAttribute("data-open", "false"));
    expect(screen.getByTestId("left-panel")).toHaveAttribute("data-open", "true");
    expect(screen.getByPlaceholderText("Tell Gentle what you need…")).toBeInTheDocument();
  });
});

describe("App status bar", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "?firstRun=0");
    window.localStorage.clear();
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("shows the status bar and swaps in the open chat's folder", async () => {
    render(<App />);
    expect(await screen.findByRole("contentinfo", { name: "Status bar" })).toBeInTheDocument();

    (await screen.findByRole("button", { name: /Write the README intro/ })).click();

    await waitFor(() => expect(screen.getByRole("contentinfo", { name: "Status bar" })).toHaveTextContent("/Users/dev/gentle-shell-desktop"));
  });
});

describe("App theme", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "?firstRun=0");
    window.localStorage.clear();
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("has no theme picker in the top bar", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /Settings/ });

    expect(screen.queryByRole("combobox", { name: "Theme" })).not.toBeInTheDocument();
  });

  it("switches the whole app to the theme chosen in Settings", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Settings/ }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Gentleman-Sexy" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("gentleman-sexy"));
  });
});

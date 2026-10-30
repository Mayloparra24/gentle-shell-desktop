// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";

afterEach(() => vi.restoreAllMocks());

describe("center file tabs", () => {
  beforeEach(() => window.history.pushState({}, "", "?firstRun=0"));
  it("keeps chat first and mounted with its draft, activates existing files, navigates and closes tabs", async () => {
    const initial = await mockBridge.newChat();
    let push!: Parameters<typeof mockBridge.onState>[0];
    vi.spyOn(mockBridge, "onState").mockImplementation(callback => { push = callback; return () => {}; });
    vi.spyOn(mockBridge, "readFile").mockResolvedValue({ status: "binary" });
    render(<App />);
    expect(await screen.findByText("Start a chat in any folder")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Open views" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "keep my draft" } });
    fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
    const strip = screen.getByRole("tablist", { name: "Open views" });
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["Write the README intro", "README.md"]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(composer).toBeInTheDocument();
    expect(composer).not.toBeVisible();
    act(() => push({ ...initial, working: true, messages: [{ id: "stream", role: "assistant", text: "Still streaming", streaming: true }] }));
    expect(screen.getByText("Still streaming")).not.toBeVisible();
    expect(composer).toHaveValue("keep my draft");
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(within(strip).getAllByRole("tab")).toHaveLength(2);
    fireEvent.keyDown(tabs[1]!, { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(composer).toBeVisible();
    expect(screen.getByText("Still streaming")).toBeVisible();
    expect(screen.getByText("Working…")).toBeVisible();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1]!, { key: "ArrowLeft" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.click(tabs[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Close README.md" }));
    expect(within(strip).getAllByRole("tab")).toHaveLength(1);
    expect(composer).toBeVisible();
    expect(composer).toHaveValue("keep my draft");
  });
  it("caps file tabs at eight, replaces the oldest non-active file, and clears on chat switch", async () => {
    vi.spyOn(mockBridge, "listDirectory").mockResolvedValue({ status: "ready", truncated: false, entries: Array.from({ length: 10 }, (_, i) => ({ name: `file${i}.ts`, kind: "file" })) });
    vi.spyOn(mockBridge, "readFile").mockResolvedValue({ status: "binary" });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    for (let i = 0; i < 8; i++) fireEvent.click(await screen.findByRole("button", { name: `file${i}.ts` }));
    fireEvent.click(screen.getByRole("tab", { name: "file0.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "file8.ts" }));
    const strip = screen.getByRole("tablist", { name: "Open views" });
    expect(within(strip).getAllByRole("tab")).toHaveLength(9);
    expect(screen.getByRole("tab", { name: "file0.ts" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "file1.ts" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close file8.ts" }));
    expect(screen.getByRole("tab", { name: "file7.ts" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /Refactor the session store/ }));
    expect(within(screen.getByRole("tablist", { name: "Open views" })).getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Close file0.ts" })).not.toBeInTheDocument();
  });
});

it("opens settings without a chat, hands off to the folder dialog and reads after a chat opens", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  const read = vi.spyOn(mockBridge, "readSettings");
  const write = vi.spyOn(mockBridge, "setSetting");
  render(<App />);
  const settings = await screen.findByRole("button", { name: "Settings" });
  settings.focus();
  fireEvent.click(settings);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(within(dialog).getAllByText("Open a chat to read and change this")).toHaveLength(4);
  await screen.findByRole("radio", { checked: true });
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryByText(/ChatHost|no chat is open|Error invoking/)).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole("button", { name: "New chat" })[0]!);
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  const folders = await screen.findByRole("dialog", { name: "Choose a folder" });
  expect(folders).toContainElement(document.activeElement as HTMLElement);
  fireEvent.keyDown(folders, { key: "Escape" });
  expect(settings).toHaveFocus();
  fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
  await screen.findByRole("textbox", { name: "Message" });
  fireEvent.click(settings);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch", { name: "Receipt-driven review (RDD)" })).toBeInTheDocument();
  expect(screen.queryByText("Open a chat to read and change this")).not.toBeInTheDocument();
});

it("opens settings, restores focus on Escape and resets an existing chat after switching home", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  const listChats = vi.spyOn(mockBridge, "listChats");
  const newChat = vi.spyOn(mockBridge, "newChat");
  const readSettings = vi.spyOn(mockBridge, "readSettings");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
  expect(await screen.findByRole("tab", { name: "Write the README intro" })).toBeInTheDocument();
  const settings = screen.getByRole("button", { name: "Settings" });
  const composer = screen.getByRole("textbox", { name: "Message" });
  composer.focus();
  fireEvent.change(composer, { target: { value: "A draft from the old home" } });
  vi.spyOn(mockBridge, "readFile").mockResolvedValue({ status: "binary" });
  fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
  expect(screen.getByRole("tab", { name: "README.md" })).toBeInTheDocument();
  fireEvent.click(settings);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  const selectedHome = await screen.findByRole("radio", { checked: true });
  const otherHome = screen.getAllByRole("radio").find((radio) => radio !== selectedHome)!;
  const listsBefore = listChats.mock.calls.length;
  const chatsBefore = newChat.mock.calls.length;
  const readsBefore = readSettings.mock.calls.length;
  fireEvent.click(otherHome);
  expect(await screen.findByText("Start a chat in any folder")).toBeInTheDocument();
  await waitFor(() => expect(listChats).toHaveBeenCalledTimes(listsBefore + 1));
  expect(newChat).toHaveBeenCalledTimes(chatsBefore);
  expect(readSettings).toHaveBeenCalledTimes(readsBefore);
  expect(screen.getAllByText("Open a chat to read and change this")).toHaveLength(4);
  expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist", { name: "Open views" })).not.toBeInTheDocument();
  expect(screen.getByText("Start a chat in any folder")).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Write the README intro" })).not.toBeInTheDocument();
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
  fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
  const composer = await screen.findByRole("textbox", { name: "Message" });
  composer.focus();
  const settings = screen.getByRole("button", { name: "Settings" });
  fireEvent.click(settings);
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(settings).toHaveFocus();
  window.history.pushState({}, "", "/");
});

describe("folder start", () => {
  beforeEach(() => window.history.pushState({}, "", "?firstRun=0"));
  it("starts nothing on mount and shows a compact empty state, not the old page", async () => {
    const start = vi.spyOn(mockBridge, "newChat");
    render(<App />);
    expect(await screen.findByText("Start a chat in any folder")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a folder to start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose a folder…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Choose a folder");
    fireEvent.click(screen.getByRole("tab", { name: "Git" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Choose a folder");
  });
  it("both New chat buttons open the same modal, cancellation restores focus and starts nothing", async () => {
    const start = vi.spyOn(mockBridge, "startChat");
    const legacy = vi.spyOn(mockBridge, "newChat");
    render(<App />);
    await screen.findByText("Start a chat in any folder");
    const triggers = screen.getAllByRole("button", { name: "New chat" });
    expect(triggers).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Chat in another folder…" })).not.toBeInTheDocument();
    for (const trigger of triggers) {
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "Choose a folder" });
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    }
    expect(start).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
  });
  it("New chat with a selected chat asks again and cancelling Browse or Cancel preserves it", async () => {
    const start = vi.spyOn(mockBridge, "startChat").mockResolvedValue({ status: "cancelled" });
    const legacy = vi.spyOn(mockBridge, "newChat");
    const open = vi.spyOn(mockBridge, "openChat");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(start).toHaveBeenCalledExactlyOnceWith({ source: "browse" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(legacy).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(composer).toHaveValue("keep my draft");
    expect(screen.getByRole("tab", { name: "Write the README intro" })).toBeInTheDocument();
  });
  it("choosing a folder starts once and refetches workspace", async () => {
    const initial = await mockBridge.newChat();
    const legacy = vi.spyOn(mockBridge, "newChat");
    const start = vi.spyOn(mockBridge, "startChat").mockResolvedValue({ status: "chosen", chat: { ...initial, cwd: "/picked" } });
    const list = vi.spyOn(mockBridge, "listDirectory");
    render(<App />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New chat" }))[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Browse…" }));
    await screen.findByRole("textbox", { name: "Message" });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledExactlyOnceWith({ source: "browse" });
    expect(legacy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "Status bar" })).toHaveTextContent("picked");
  });
});

describe("App", () => {
  it("waits for the selected chat to open before refetching workspace data", async () => {
    let resolve!: (state: Awaited<ReturnType<typeof mockBridge.openChat>>) => void;
    const initial = await mockBridge.newChat();
    vi.spyOn(mockBridge, "openChat").mockImplementation(() => new Promise(r => { resolve = r; }));
    const list = vi.spyOn(mockBridge, "listDirectory");
    const git = vi.spyOn(mockBridge, "gitSummary");
    render(<App />);
    await screen.findByText("Start a chat in any folder");
    expect(list).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    expect(list).not.toHaveBeenCalled();
    resolve(initial);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(git).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });
  it("opens models from Settings and the profiles command without losing the chat draft", async () => {
    const newChat = vi.spyOn(mockBridge, "newChat");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "keep this draft" } });
    const opens = newChat.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open models →" }));
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Models" })).toBeInTheDocument();
    expect(newChat).toHaveBeenCalledTimes(opens);
    fireEvent.click(screen.getByRole("button", { name: "Close models" }));
    expect(composer).toBeVisible();
    expect(composer).toHaveValue("keep this draft");
    expect(newChat).toHaveBeenCalledTimes(opens);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open models →" }));
    expect(await screen.findByRole("dialog", { name: "Models" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Models" }), { key: "Escape" });
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
    expect(screen.getAllByRole("button", { name: "New chat" })).toHaveLength(2);
  });

  it('shows the folder start screen by default', async () => {
    render(<App />);

    expect(await screen.findByText("Start a chat in any folder")).toBeInTheDocument();
    // The title bar carries no chat title any more; with no chat open there is no title at all.
    expect(screen.queryByRole("heading", { name: "New chat" })).not.toBeInTheDocument();
  });

  it("selecting a sidebar chat updates the conversation header title", async () => {
    render(<App />);

    // mockBridge's example chats load asynchronously into the sidebar.
    const item = await screen.findByRole("button", { name: /Write the README intro/ });
    item.click();

    expect(await screen.findByRole("tab", { name: "Write the README intro" })).toBeInTheDocument();
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

it("uses the selected chat's live agents and clears them on chat switch", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  const initial = await mockBridge.newChat();
  const open = vi.spyOn(mockBridge, "openChat").mockResolvedValue({ ...initial, helpers: {
    summary: { running: 1, queued: 0, waiting: 0, finished: 0 },
    tasks: [{ id: "agent-1", agent: "explore", label: "Real helper", prompt: "Read the sources", status: "running", createdAt: "2026-09-22T10:00:00Z", turns: 1, toolCalls: 0, thread: { version: 0, dropped: 0, items: [] } }],
  } });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
  const button = await screen.findByRole("button", { name: "Agents and jobs, 1 running" });
  fireEvent.click(button);
  expect(screen.getByText("Read the sources")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Real helper/ })).toHaveAttribute("aria-current", "true");
  fireEvent.click(screen.getByRole("button", { name: "Close agents and jobs" }));
  expect(button).toHaveFocus();
  open.mockImplementation(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: /Write the README intro/ }));
  fireEvent.click(screen.getByRole("button", { name: "Agents and jobs" }));
  expect(screen.getByText("No agents or jobs yet")).toBeInTheDocument();
  expect(screen.queryByText("Real helper")).not.toBeInTheDocument();
});

it("opens Agents & jobs from the title bar and restores focus on Escape", async () => {
  window.history.pushState({}, "", "?firstRun=0");
  render(<App />);
  const button = await screen.findByRole("button", { name: "Agents and jobs" });
  fireEvent.click(button);
  const dialog = screen.getByRole("dialog", { name: "Agents & jobs" });
  expect(screen.getByText("No agents or jobs yet")).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
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
    expect(screen.getAllByRole("button", { name: "New chat" })).toHaveLength(2);
  });
});

describe("App status bar", () => {
  it("opens Models from the live model segment and clears old facts on chat switch", async () => {
    const initial = await mockBridge.newChat();
    let push!: Parameters<typeof mockBridge.onState>[0];
    vi.spyOn(mockBridge, "onState").mockImplementation(callback => { push = callback; return () => {}; });
    const open = vi.spyOn(mockBridge, "openChat").mockResolvedValue({ ...initial, session: { model: "real-model", effort: "high" }, memory: "project · saved ✓" });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    const model = await screen.findByRole("button", { name: "real-model · high" });
    model.focus();
    fireEvent.click(model);
    const dialog = await screen.findByRole("dialog", { name: "Models" });
    expect(screen.queryByRole("button", { name: /Back to chat/ })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(model).toHaveFocus();
    fireEvent.click(model);
    fireEvent.click(screen.getByRole("button", { name: "Close models" }));
    expect(model).toHaveFocus();
    push({ ...initial, session: { model: "updated-model" } });
    expect(await screen.findByRole("button", { name: "updated-model" })).toBeInTheDocument();
    expect(screen.queryByText("project · saved ✓")).not.toBeInTheDocument();
    open.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /Write the README intro/ }));
    expect(screen.queryByRole("button", { name: "updated-model" })).not.toBeInTheDocument();
  });
  it("renders no old workspace or status samples with the mock bridge", async () => {
    render(<App />);
    await screen.findByText("Start a chat in any folder");
    for (const text of ["Login with magic link", "claude-sonnet-5", "$0.84", "Sample data · not connected yet"]) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
    expect(screen.getByText("No folder chosen")).toBeInTheDocument();
  });
  it("shares Git refresh results and clears the branch when switching to a chat without a known folder", async () => {
    const git = vi.spyOn(mockBridge, "gitSummary").mockResolvedValue({ status: "ready", branch: "live", changed: [], truncatedChanges: false, commits: [] });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Write the README intro/ }));
    const bar = screen.getByRole("contentinfo", { name: "Status bar" });
    await waitFor(() => expect(bar).toHaveTextContent("live"));
    expect(git).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "Git" }));
    git.mockResolvedValue({ status: "not-a-repository" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(bar).not.toHaveTextContent("live"));
    expect(git).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(bar).toHaveTextContent("preview"));
  });
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

    await waitFor(() => expect(screen.getByRole("contentinfo", { name: "Status bar" })).toHaveTextContent("gentle-shell-desktopbranch: main"));
    expect(within(screen.getByRole("contentinfo", { name: "Status bar" })).getByText("gentle-shell-desktop")).toHaveAttribute("title", "/Users/dev/gentle-shell-desktop");
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

  it.each([false, true])("syncs the stored theme and Settings changes even when recoloring rejects (%s)", async (reject) => {
    window.localStorage.setItem("gentle.theme", "gentle");
    const recolor = vi.spyOn(mockBridge, "setWindowTheme");
    if (reject) recolor.mockRejectedValue(new Error("Overlay unavailable"));
    render(<App />);
    await waitFor(() => expect(recolor).toHaveBeenCalledExactlyOnceWith("gentle"));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gentleman-Sexy" }));
    await waitFor(() => expect(recolor).toHaveBeenLastCalledWith("gentleman-sexy"));
    expect(recolor).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.theme).toBe("gentleman-sexy");
    expect(window.localStorage.getItem("gentle.theme")).toBe("gentleman-sexy");
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Write the README intro/ }));
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeEnabled();
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

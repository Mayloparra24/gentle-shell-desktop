// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileViewer } from "./FileViewer";
import { mockBridge } from "@renderer/shared/bridge/mockBridge";

const loaded = vi.hoisted(() => vi.fn());
vi.mock("@codemirror/state", async importOriginal => {
  loaded();
  return await importOriginal();
});
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener() {}, removeListener() {} });
});

describe("FileViewer", () => {
  it("loads CodeMirror only on first open, renders focusable read-only source and preserves the view on unrelated renders", async () => {
    expect(loaded).not.toHaveBeenCalled();
    const status = vi.fn();
    const view = render(<FileViewer onStatusChange={status} />);
    expect(loaded).not.toHaveBeenCalled();
    vi.spyOn(mockBridge, "readFile").mockResolvedValue({ status: "ok", path: "src/app.ts", text: "const answer = 42;\n", eol: "lf", language: "typescript" });
    view.rerender(<FileViewer path="src/app.ts" onStatusChange={status} />);
    expect(screen.getByText("Loading source…")).toBeInTheDocument();
    const source = await screen.findByRole("textbox", { name: "app.ts source" });
    expect(source).toHaveAttribute("aria-readonly", "true");
    expect(source).toHaveAttribute("contenteditable", "false");
    expect(source).toHaveAttribute("tabindex", "0");
    expect(source).toHaveTextContent("const answer = 42;");
    source.focus();
    const texts = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    let word: Node | null = texts.nextNode();
    while (word && !word.textContent?.includes("answer")) word = texts.nextNode();
    expect(word).not.toBeNull();
    const offset = word!.textContent!.indexOf("answer") + 3;
    document.getSelection()?.setBaseAndExtent(word!, offset, word!, offset);
    fireEvent(document, new Event("selectionchange"));
    await waitFor(() => expect(status).toHaveBeenLastCalledWith({ line: 1, column: 10, eol: "lf", language: "typescript" }));
    for (const key of "oops") {
      fireEvent.keyDown(source, { key });
      fireEvent.input(source, { data: key, inputType: "insertText" });
    }
    expect(source).toHaveTextContent("const answer = 42;");
    expect(source).not.toHaveTextContent("oops");
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Edit/i })).not.toBeInTheDocument();
    expect(status).toHaveBeenCalledWith({ line: 1, column: 1, eol: "lf", language: "typescript" });
    const host = source.closest(".cm-editor")!.parentElement!;
    view.rerender(<FileViewer path="src/app.ts" onStatusChange={status} />);
    expect(screen.getByRole("textbox", { name: "app.ts source" })).toBe(source);
    expect(mockBridge.readFile).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(host.childElementCount).toBe(0);
    vi.restoreAllMocks();
  });
  it.each([
    [{ status: "too-large", size: 2_097_152 }, "This file is 2048 KB; the viewer opens files up to 1 MB."],
    [{ status: "binary" }, "Binary file; not shown."],
    [{ status: "no-chat-folder" }, "Choose a folder to see its files."],
  ] as const)("shows %j", async (result, message) => {
    vi.spyOn(mockBridge, "readFile").mockResolvedValue(result);
    render(<FileViewer path="sample" />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
  it("shows an error and retries the read", async () => {
    const read = vi.spyOn(mockBridge, "readFile").mockResolvedValueOnce({ status: "error", message: "File unavailable" }).mockResolvedValue({ status: "binary" });
    render(<FileViewer path="sample" />);
    expect(await screen.findByText("File unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Binary file; not shown.")).toBeInTheDocument();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    vi.restoreAllMocks();
  });
  it("renders markup as inert source and reports only metadata", async () => {
    const text = '<img src=x onerror="window.leaked=1"><script>alert(1)</script>';
    const status = vi.fn();
    vi.spyOn(mockBridge, "readFile").mockResolvedValue({ status: "ok", path: "markup.txt", text, eol: "lf" });
    const view = render(<FileViewer path="markup.txt" onStatusChange={status} />);
    expect(await screen.findByRole("textbox")).toHaveTextContent(text);
    expect(view.container.querySelector("img,script")).toBeNull();
    expect(status).toHaveBeenLastCalledWith({ line: 1, column: 1, eol: "lf", language: undefined });
    vi.restoreAllMocks();
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";
import { useState } from "react";
import type { SlashCommand } from "@shared/bridge-types";

const commands: SlashCommand[] = [
  { name: "review", source: "skill" as const },
  { name: "commit-message", description: "Write a commit", source: "prompt" as const },
];

function Draft({ working = false, load = () => Promise.resolve(commands), onSend = vi.fn(), onAbort = vi.fn() }) {
  const [value, setValue] = useState("");
  return <Composer value={value} working={working} onChange={setValue} onSend={onSend} onAbort={onAbort} loadCommands={load} commandsResetKey={1} />;
}

describe("Composer commands", () => {
  it("hides advanced commands until toggled, preserves focus and resets on close", async () => {
    render(<Draft load={() => Promise.resolve([...commands, { name: "history", source: "extension" as const }])} />);
    const field = screen.getByRole("textbox");
    field.focus();
    fireEvent.change(field, { target: { value: "/" } });
    await screen.findByText("/review");
    expect(screen.queryByText("/history")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show all commands" });
    expect(fireEvent.mouseDown(toggle)).toBe(false);
    fireEvent.click(toggle);
    expect(field).toHaveFocus();
    expect(screen.getByText("/history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide advanced commands" }));
    fireEvent.change(field, { target: { value: "/hist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No commands match");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all commands" }));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    expect(screen.getByRole("status")).toHaveTextContent("No commands match");
    fireEvent.click(screen.getByRole("button", { name: "Show all commands" }));
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Tab" });
    expect(field).toHaveValue("/history ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "/" } });
    expect(screen.queryByText("/history")).not.toBeInTheDocument();
  });
  it("opens on slash, filters, navigates and inserts without sending", async () => {
    const onSend = vi.fn();
    render(<Draft onSend={onSend} />);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "/" } });
    await screen.findByText("/review");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1]?.id);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field).toHaveValue("/commit-message ");
    expect(field).toHaveFocus();
    expect((field as HTMLTextAreaElement).selectionStart).toBe(16);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "/COM" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(field, { key: "Tab" });
    expect(field).toHaveValue("/commit-message ");
    expect(onSend).not.toHaveBeenCalled();
  });
  it("wraps ArrowUp and closes when the slash token stops matching", async () => {
    render(<Draft />);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "/" } });
    await screen.findByText("/review");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.change(field, { target: { value: "/review args" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "/rev" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "rev" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("opens from the button, inserts slash on an empty draft and supports clicking", async () => {
    render(<Draft />);
    const button = screen.getByRole("button", { name: "Commands" });
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox")).toHaveValue("/");
    fireEvent.click(await screen.findByText("/commit-message"));
    expect(screen.getByRole("textbox")).toHaveValue("/commit-message ");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
  it("Escape closes rather than aborting while working", async () => {
    const onAbort = vi.fn();
    render(<Draft working onAbort={onAbort} />);
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    await screen.findByText("/review");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onAbort).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });
  it("keeps plain-text editing and sending usable after a listing failure", async () => {
    const onSend = vi.fn();
    render(<Draft load={() => Promise.reject(new Error("offline"))} onSend={onSend} />);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "/" } });
    await screen.findByText("Could not load commands: offline");
    fireEvent.change(field, { target: { value: "/unknown args" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(field).toHaveValue("/unknown args");
  });
});

describe("Composer", () => {
  it("shows the placeholder and the key hints", () => {
    render(<Composer value="" working={false} onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} />);

    expect(screen.getByPlaceholderText("Tell Gentle what you need…")).toBeInTheDocument();
    expect(screen.getByText("Enter to send")).toBeInTheDocument();
    expect(screen.getByText("Shift+Enter for a new line")).toBeInTheDocument();
    expect(screen.getByText("Esc to stop the agent")).toBeInTheDocument();
  });

  it("calls onSend and does not insert a newline when Enter is pressed without Shift", () => {
    const onSend = vi.fn();

    render(<Composer value="hello" working={false} onChange={vi.fn()} onSend={onSend} onAbort={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Tell Gentle what you need…");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalled();
  });

  it("does not call onSend when Shift+Enter is pressed (newline instead)", () => {
    const onSend = vi.fn();

    render(<Composer value="hello" working={false} onChange={vi.fn()} onSend={onSend} onAbort={vi.fn()} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Tell Gentle what you need…"), { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Enter when the draft is empty", () => {
    const onSend = vi.fn();

    render(<Composer value="   " working={false} onChange={vi.fn()} onSend={onSend} onAbort={vi.fn()} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Tell Gentle what you need…"), { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onAbort on Escape only while working", () => {
    const onAbort = vi.fn();
    const { rerender } = render(
      <Composer value="" working={false} onChange={vi.fn()} onSend={vi.fn()} onAbort={onAbort} />,
    );
    const textarea = screen.getByPlaceholderText("Tell Gentle what you need…");

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onAbort).not.toHaveBeenCalled();

    rerender(<Composer value="" working onChange={vi.fn()} onSend={vi.fn()} onAbort={onAbort} />);
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onAbort).toHaveBeenCalled();
  });

  it("marks the field read-only while working so Escape still reaches it, and disables Send", () => {
    render(<Composer value="hi" working onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Tell Gentle what you need…");
    expect(textarea).toHaveAttribute("readonly");
    expect(textarea).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("disables Send when the draft is empty", () => {
    render(<Composer value="" working={false} onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("clicking Send calls onSend", () => {
    const onSend = vi.fn();
    render(<Composer value="hi" working={false} onChange={vi.fn()} onSend={onSend} onAbort={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import * as markdown from "@renderer/shared/markdown/renderMarkdown";
import { MessageThread } from "./MessageThread";
import type { ChatMessage } from "@shared/bridge-types";

// Measured by the performance audit: every thread render re-parsed and re-sanitized every assistant message, so a
// 3,000-message chat spent ~3 s on one streamed delta. Unchanged text must not be parsed again, even when the main
// process sends a cloned snapshot (new object identities, same content).
it("does not reparse unchanged Markdown when a cloned snapshot arrives, and still renders a changed message", () => {
  const parse = vi.spyOn(markdown, "renderMarkdown");
  try {
    const messages: ChatMessage[] = [
      { id: "a", role: "assistant", text: "**First**" },
      { id: "b", role: "assistant", text: "**Second**", streaming: true },
    ];
    const props = { messages, dialogs: [], onAnswerDialog: () => {} };
    const view = render(<MessageThread {...props} />);
    expect(parse).toHaveBeenCalledTimes(2);

    view.rerender(<MessageThread {...structuredClone({ messages, dialogs: [] })} onAnswerDialog={() => {}} />);
    expect(parse).toHaveBeenCalledTimes(2);

    const next = structuredClone(messages);
    next[1] = { ...next[1]!, text: "**Updated**<script>alert(1)</script>" };
    view.rerender(<MessageThread {...props} messages={next} />);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.getByText("Updated")).toBeInTheDocument();
  } finally {
    parse.mockRestore();
  }
});

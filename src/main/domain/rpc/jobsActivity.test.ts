import { expect, it } from "vitest";
import { parseJobNotice, parseJobsStatus } from "./jobsActivity";
import { INITIAL_CHAT_STATE, reduceChat } from "./chatReducer";
import type { RpcMessage } from "./types";

function notice(id = "job-1", status = "exited", kind = "command"): RpcMessage {
  return { role: "custom", customType: "gentle-jobs.notice", display: true,
    content: 'Background job finished.\nCommand: echo hi\nLast output:\n<b>hi</b>\nFull output: /tmp/job.log (read it with the read tool if you need more).',
    details: { gentleJobs: { jobId: id, kind, label: "Build", status, exitCode: status === "exited" ? 0 : null, outputPath: "/tmp/job.log", ...(status === "running" ? { event: "events" } : {}) } } };
}
const now = "2026-10-30T10:00:00.000Z";
it.each(["exited", "failed", "stopped"])("decodes %s notices without trusting timestamps", status => {
  expect(parseJobNotice(notice("job-1", status))).toEqual({ id: "job-1", kind: "command", label: "Build", status,
    exitCode: status === "exited" ? 0 : undefined, command: "echo hi", lastOutput: "<b>hi</b>", outputPath: "/tmp/job.log" });
});
it("rejects malformed and hostile payloads without throwing", () => {
  for (const value of [undefined, null, [], {}, { ...notice(), role: "assistant" }, { ...notice(), display: false },
    { ...notice(), customType: "other" }, { ...notice(), details: { gentleJobs: { jobId: 7 } } },
    { ...notice(), content: 42 }, new Proxy({}, { get() { throw new Error("hostile"); } })]) {
    expect(parseJobNotice(value)).toBeUndefined();
  }
});
it("bounds untrusted command and last output including the ellipsis", () => {
  const parsed = parseJobNotice({ ...notice(), content: `Command: ${"x".repeat(2000)}\nLast output:\n${"y".repeat(10000)}\nFull output: /tmp/job.log` });
  expect(parsed?.command).toBe(`${"x".repeat(1023)}…`);
  expect(parsed?.lastOutput).toBe(`${"y".repeat(8191)}…`);
});
it.each([["⧗ 2 jobs", 2], ["⧗ 1 job", 1], [undefined, 0], ["garbage", undefined], ["⧗ -1 jobs", undefined], ["⧗ 1e400 jobs", undefined]])("parses status %s", (text, expected) => {
  expect(parseJobsStatus(text)).toBe(expected);
});
it("records terminal notices once on message_end, replaces ids by receipt order and retains newest 50", () => {
  const message = notice();
  expect(reduceChat(INITIAL_CHAT_STATE, { type: "message_start", message }, now)).toBe(INITIAL_CHAT_STATE);
  let state = reduceChat(INITIAL_CHAT_STATE, { type: "message_end", message }, now);
  expect(state.jobs).toEqual({ running: 0, finished: [{ ...parseJobNotice(message), endedAt: now }] });
  state = reduceChat(state, { type: "message_end", message: notice("job-1", "failed") }, now);
  expect(state.jobs?.finished).toHaveLength(1);
  expect(state.jobs?.finished[0]?.status).toBe("failed");
  for (let i = 2; i <= 52; i++) state = reduceChat(state, { type: "message_end", message: notice(`job-${i}`) }, now);
  expect(state.jobs?.finished).toHaveLength(50);
  expect(state.jobs?.finished[0]?.id).toBe("job-52");
  expect(state.jobs?.finished[49]?.id).toBe("job-3");
  expect(state.messages).toEqual([]);
  expect(INITIAL_CHAT_STATE.jobs).toBeUndefined();
  expect(reduceChat(INITIAL_CHAT_STATE, { type: "agent_start" }).jobs).toBeUndefined();
});
it("sets and clears running count, preserves other customs and assistant behavior", () => {
  const event = { type: "extension_ui_request", id: "s", method: "setStatus", statusKey: "gentle-jobs", statusText: "⧗ 2 jobs" } as const;
  const state = reduceChat(INITIAL_CHAT_STATE, event);
  expect(state.jobs).toEqual({ running: 2, finished: [] });
  expect(reduceChat(state, { ...event, statusText: undefined }).jobs?.running).toBe(0);
  expect(reduceChat(state, { ...event, statusText: "bad" })).toBe(state);
  expect(reduceChat(state, { type: "message_end", message: { ...notice(), customType: "other" } })).toBe(state);
  const started = reduceChat(state, { type: "message_start", message: { role: "assistant" } });
  const ended = reduceChat(started, { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } });
  expect(ended.messages).toEqual([{ id: "msg-0", role: "assistant", text: "hello", streaming: false }]);
  expect(ended.jobs).toEqual(state.jobs);
});
it("never invents a finished monitor from a live batch; merges batch text into an existing record only", () => {
  const batch = { ...notice("job-1", "running", "monitor"), content: 'Monitor job-1 ("Build") reported 1 new line:\nnew line' };
  expect(parseJobNotice(batch)?.lastOutput).toBe("new line");
  expect(reduceChat(INITIAL_CHAT_STATE, { type: "message_end", message: batch }, now)).toBe(INITIAL_CHAT_STATE);
  const state = reduceChat(INITIAL_CHAT_STATE, { type: "message_end", message: notice("job-1", "stopped", "monitor") }, now);
  const next = reduceChat(state, { type: "message_end", message: batch }, "2026-10-30T11:00:00.000Z");
  expect(next.jobs?.finished[0]).toEqual({ ...state.jobs?.finished[0], lastOutput: "new line" });
});

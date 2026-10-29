import { describe, expect, it } from "vitest";
import { CHAT_STATE, type ChatSummary } from "./bridge-types";
import { groupChatsByDay, groupChatsByProject } from "./chatGrouping";

function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "chat-1",
    title: "A chat",
    cwd: "/tmp/project",
    updatedAt: "2026-09-21T09:00:00.000Z",
    messageCount: 1,
    state: CHAT_STATE.IDLE,
    ...overrides,
  };
}

describe("groupChatsByDay", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it('groups a chat updated today under "Today" (UTC calendar day)', () => {
    const chats = [makeChat({ id: "a", updatedAt: "2026-09-21T09:00:00.000Z" })];
    expect(groupChatsByDay(chats, now)).toEqual([{ label: "Today", chats }]);
  });

  it('groups a chat updated yesterday under "Yesterday"', () => {
    const chats = [makeChat({ id: "a", updatedAt: "2026-09-20T09:00:00.000Z" })];
    expect(groupChatsByDay(chats, now)).toEqual([{ label: "Yesterday", chats }]);
  });

  it("groups an older chat under its ISO calendar date", () => {
    const chats = [makeChat({ id: "a", updatedAt: "2026-09-10T09:00:00.000Z" })];
    expect(groupChatsByDay(chats, now)).toEqual([{ label: "2026-09-10", chats }]);
  });

  it("keeps same-day chats in one group, preserving their (already-sorted) order", () => {
    const chats = [
      makeChat({ id: "a", updatedAt: "2026-09-21T09:00:00.000Z" }),
      makeChat({ id: "b", updatedAt: "2026-09-21T08:00:00.000Z" }),
    ];

    const groups = groupChatsByDay(chats, now);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.chats.map((chat) => chat.id)).toEqual(["a", "b"]);
  });

  it("returns Today and Yesterday as separate, ordered groups", () => {
    const chats = [
      makeChat({ id: "today", updatedAt: "2026-09-21T09:00:00.000Z" }),
      makeChat({ id: "yesterday", updatedAt: "2026-09-20T09:00:00.000Z" }),
    ];

    const groups = groupChatsByDay(chats, now);

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
  });

  it("defaults `now` to the current time when omitted", () => {
    const chats = [makeChat({ id: "a", updatedAt: new Date().toISOString() })];
    expect(groupChatsByDay(chats)).toEqual([{ label: "Today", chats }]);
  });
});

describe("groupChatsByProject", () => {
  const chat = (id: string, cwd: string): ChatSummary => ({
    id,
    title: id,
    cwd,
    updatedAt: "2026-09-21T09:00:00.000Z",
    messageCount: 1,
    state: "idle",
  });

  it("groups chats by the last folder of their cwd, in first-seen order", () => {
    const groups = groupChatsByProject([chat("a", "/work/shop-web"), chat("b", "/work/shop-api"), chat("c", "/work/shop-web")]);

    expect(groups.map((group) => group.label)).toEqual(["shop-web", "shop-api"]);
    expect(groups[0]?.chats.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("understands Windows paths and trailing separators", () => {
    const windowsCwd = ["C:", "work", "shop-web", ""].join(String.fromCharCode(92));
    const groups = groupChatsByProject([chat("a", windowsCwd), chat("b", "/work/shop-web/")]);

    expect(groups.map((group) => group.label)).toEqual(["shop-web", "shop-web"]);
    expect(groups).toHaveLength(2);
  });

  it("labels chats without a cwd as 'No folder'", () => {
    expect(groupChatsByProject([chat("a", "")]).map((group) => group.label)).toEqual(["No folder"]);
  });
});

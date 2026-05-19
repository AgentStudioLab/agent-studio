import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import {
  createConversation,
  listConversations,
  getConversation,
  getMessages,
  updatePin,
  updateTitle,
  deleteConversation,
  insertAssistantMessage,
} from "../../src/services/conversations";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

describe("createConversation", () => {
  it("inserts row + first user message; returns conversation with id", () => {
    const conv = createConversation(db, {
      prompt: "hello there",
      projectId: null,
      mode: "ask",
    });
    expect(conv.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(conv.title).toBe("hello there");
    expect(conv.mode).toBe("ask");
    expect(conv.status).toBe("active");
    expect(conv.pinned).toBe(false);

    const msgs = db
      .prepare("SELECT * FROM messages WHERE conversation_id = ?")
      .all(conv.id) as { role: string; blocks_json: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("user");
    expect(JSON.parse(msgs[0]!.blocks_json)).toEqual([{ type: "text", text: "hello there" }]);
  });

  it("title truncates prompt to 60 chars", () => {
    const long = "x".repeat(120);
    const conv = createConversation(db, { prompt: long, mode: "agent" });
    expect(conv.title).toHaveLength(60);
  });
});

describe("listConversations", () => {
  it("returns conversations ordered by updated_at DESC", async () => {
    const a = createConversation(db, { prompt: "first", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    const b = createConversation(db, { prompt: "second", mode: "ask" });
    const rows = listConversations(db, { limit: 10 });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("filters pinned only when requested", () => {
    const a = createConversation(db, { prompt: "a", mode: "ask" });
    createConversation(db, { prompt: "b", mode: "ask" });
    db.prepare("UPDATE conversations SET pinned = 1 WHERE id = ?").run(a.id);
    const rows = listConversations(db, { limit: 10, pinnedOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(a.id);
  });
});

describe("getConversation", () => {
  it("returns conversation by id", () => {
    const a = createConversation(db, { prompt: "x", mode: "ask" });
    const got = getConversation(db, a.id);
    expect(got?.id).toBe(a.id);
  });

  it("returns null when missing", () => {
    expect(getConversation(db, "01HZZZZZZZZZZZZZZZZZZZZZZZ")).toBeNull();
  });
});

describe("getMessages", () => {
  it("returns messages ordered by created_at ASC", async () => {
    const c = createConversation(db, { prompt: "p1", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
       VALUES ('msg-asst-1', ?, 'assistant', '[{"type":"text","text":"hi"}]', ?, 'end_turn', NULL)`,
    ).run(c.id, Date.now());
    const msgs = getMessages(db, c.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]!.blocks).toEqual([{ type: "text", text: "hi" }]);
  });
});

describe("updatePin", () => {
  it("toggles pinned + bumps updated_at", async () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    updatePin(db, c.id, true);
    const got = getConversation(db, c.id)!;
    expect(got.pinned).toBe(true);
    expect(got.updatedAt).toBeGreaterThan(c.updatedAt);
  });
});

describe("updateTitle", () => {
  it("updates title", () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    updateTitle(db, c.id, "renamed");
    expect(getConversation(db, c.id)!.title).toBe("renamed");
  });
});

describe("deleteConversation", () => {
  it("cascade deletes messages", () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    deleteConversation(db, c.id);
    expect(getConversation(db, c.id)).toBeNull();
    const msgs = db.prepare("SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?").get(c.id) as { n: number };
    expect(msgs.n).toBe(0);
  });
});

describe("insertAssistantMessage", () => {
  it("writes assistant row with given blocks + finish reason", () => {
    const c = createConversation(db, { prompt: "p", mode: "ask" });
    const msgId = insertAssistantMessage(db, c.id, {
      blocks: [{ type: "text", text: "answer" }],
      finishReason: "end_turn",
      errorText: null,
    });
    const msgs = getMessages(db, c.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.id).toBe(msgId);
    expect(msgs[1]!.finishReason).toBe("end_turn");
    expect(msgs[1]!.blocks).toEqual([{ type: "text", text: "answer" }]);
  });

  it("returned id is monotonically newer than user message", () => {
    const c = createConversation(db, { prompt: "p", mode: "ask" });
    const userMsg = getMessages(db, c.id)[0]!;
    const asstId = insertAssistantMessage(db, c.id, {
      blocks: [{ type: "text", text: "a" }],
      finishReason: "end_turn",
      errorText: null,
    });
    expect(asstId > userMsg.id).toBe(true);
  });
});

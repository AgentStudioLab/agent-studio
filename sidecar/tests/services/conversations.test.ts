import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import {
  createConversation,
  listConversations,
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

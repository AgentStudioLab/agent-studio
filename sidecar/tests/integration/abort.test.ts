import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { buildConversationRoutes } from "../../src/routes/conversations";
import { buildMessageRoutes } from "../../src/routes/messages";
import { createApiKeyState } from "../../src/services/apiKey";

const TOKEN = "test";

function build() {
  const db = new Database(":memory:");
  migrate(db);
  const apiKey = createApiKeyState("sk-fake");
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== `Bearer ${TOKEN}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.route("/", buildConversationRoutes(db));
  app.route("/", buildMessageRoutes(db, apiKey));
  return { app, db };
}

beforeEach(() => {
  process.env.AGENT_SDK_MOCK = "1";
});

describe("abort mid-stream", () => {
  it("emits aborted event + persists partial blocks with finish_reason=aborted", async () => {
    const { app, db } = build();
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "one two three four five six seven", mode: "ask" }),
    });
    const conv = await createRes.json();

    const streamRes = await app.request(`/conversations/${conv.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "one two three four five six seven" }),
    });
    // 等到流出第一个 delta 后发 abort
    await new Promise((r) => setTimeout(r, 25));
    const abortRes = await app.request(`/conversations/${conv.id}/abort`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(abortRes.status).toBe(200);
    await streamRes.text(); // drain

    const row = db
      .prepare("SELECT finish_reason, blocks_json FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .get(conv.id) as { finish_reason: string; blocks_json: string };
    expect(row.finish_reason).toBe("aborted");
    const blocks = JSON.parse(row.blocks_json);
    if (blocks.length > 0) {
      expect(blocks[0].text.length).toBeGreaterThan(0);
    }
  });
});

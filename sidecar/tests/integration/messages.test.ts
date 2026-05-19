import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { buildConversationRoutes } from "../../src/routes/conversations";
import { buildMessageRoutes } from "../../src/routes/messages";
import { createApiKeyState } from "../../src/services/apiKey";

const TOKEN = "test-token";

function buildApp(opts: { withApiKey: boolean } = { withApiKey: true }) {
  const db = new Database(":memory:");
  migrate(db);
  const apiKey = createApiKeyState(opts.withApiKey ? "sk-fake" : null);
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

async function createConv(app: Hono, prompt: string): Promise<string> {
  const res = await app.request("/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, mode: "ask" }),
  });
  const conv = await res.json();
  return conv.id as string;
}

async function readSse(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await res.text();
  const frames = text.split("\n\n").filter((f) => f.trim().length > 0);
  return frames.map((f) => {
    const lines = f.split("\n");
    const event = lines.find((l) => l.startsWith("event: "))!.slice(7);
    const data = JSON.parse(lines.find((l) => l.startsWith("data: "))!.slice(6));
    return { event, data };
  });
}

beforeEach(() => {
  process.env.AGENT_SDK_MOCK = "1";
});

describe("POST /conversations/:id/messages", () => {
  it("streams SSE: message-start, text-delta*, message-stop", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "hello world");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello world" }),
    });
    expect(res.status).toBe(200);
    const events = await readSse(res);
    expect(events[0]!.event).toBe("message-start");
    expect(events.at(-1)!.event).toBe("message-stop");
    expect(events.filter((e) => e.event === "text-delta").length).toBeGreaterThan(0);
  });

  it("persists assistant message with finish_reason=end_turn", async () => {
    const { app, db } = buildApp();
    const id = await createConv(app, "ping");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });
    await res.text(); // drain
    const row = db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .get(id) as { finish_reason: string; blocks_json: string };
    expect(row.finish_reason).toBe("end_turn");
    const blocks = JSON.parse(row.blocks_json);
    expect(blocks[0].text.length).toBeGreaterThan(0);
  });

  it("returns 400 api_key_missing when key is null", async () => {
    const { app } = buildApp({ withApiKey: false });
    const id = await createConv(app, "x");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "api_key_missing" });
  });
});

describe("POST /conversations/:id/abort", () => {
  it("404 when no turn in flight", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "x");
    const res = await app.request(`/conversations/${id}/abort`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("concurrency", () => {
  it("returns 409 when same conversation has in-flight turn", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "x");
    // 先起一个但不读响应 → in-flight 状态保持
    const p1 = app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x" }),
    });
    // 给一点时间让 inflight.set 执行
    await new Promise((r) => setTimeout(r, 5));
    const res2 = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x2" }),
    });
    expect(res2.status).toBe(409);
    // drain 第一个
    const r1 = await p1;
    await r1.text();
  });
});

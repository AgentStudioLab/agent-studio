import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { healthRoutes } from "../../src/routes/health";
import { buildConversationRoutes } from "../../src/routes/conversations";

function buildApp(token: string) {
  const db = new Database(":memory:");
  migrate(db);
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.route("/", healthRoutes);
  app.route("/", buildConversationRoutes(db));
  return { app, db };
}

const TOKEN = "test-token";

describe("auth", () => {
  it("rejects request without token", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/health");
    expect(res.status).toBe(401);
  });

  it("accepts request with correct token", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/health", { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
  });
});

describe("POST /conversations", () => {
  it("creates conversation + first user message", async () => {
    const { app, db } = buildApp(TOKEN);
    const res = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", mode: "ask" }),
    });
    expect(res.status).toBe(201);
    const conv = await res.json();
    expect(conv.title).toBe("hello");

    const msgCount = (db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
    expect(msgCount).toBe(1);
  });

  it("400 on missing prompt", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ask" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /conversations", () => {
  it("returns list ordered by updated_at DESC", async () => {
    const { app } = buildApp(TOKEN);
    await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a", mode: "ask" }),
    });
    await new Promise((r) => setTimeout(r, 5));
    await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "b", mode: "ask" }),
    });
    const res = await app.request("/conversations", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const list = await res.json();
    expect(list[0].title).toBe("b");
    expect(list[1].title).toBe("a");
  });
});

describe("DELETE cascade", () => {
  it("cascade deletes messages", async () => {
    const { app, db } = buildApp(TOKEN);
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x", mode: "ask" }),
    });
    const conv = await createRes.json();
    await app.request(`/conversations/${conv.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const remaining = (db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
    expect(remaining).toBe(0);
  });
});

describe("PATCH /conversations/:id", () => {
  it("toggles pin", async () => {
    const { app } = buildApp(TOKEN);
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x", mode: "ask" }),
    });
    const conv = await createRes.json();
    const patchRes = await app.request(`/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    const updated = await patchRes.json();
    expect(updated.pinned).toBe(true);
  });
});

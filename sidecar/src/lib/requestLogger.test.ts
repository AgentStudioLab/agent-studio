import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createRequestLogger } from "./requestLogger";

describe("request logger middleware", () => {
  it("logs method, path, status, and duration after a request completes", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(
      "*",
      createRequestLogger({
        log: (line) => lines.push(line),
        now: (() => {
          const values = [100, 112];
          return () => values.shift() ?? 112;
        })(),
      }),
    );
    app.get("/health", (c) => c.json({ ok: true }));

    const res = await app.request("/health?probe=1");

    expect(res.status).toBe(200);
    expect(lines).toEqual(["[http] GET /health?probe=1 -> 200 12ms"]);
  });

  it("logs rejected auth responses from later middleware", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(
      "*",
      createRequestLogger({
        log: (line) => lines.push(line),
        now: () => 8,
      }),
    );
    app.use("*", async (c) => c.json({ error: "unauthorized" }, 401));

    const res = await app.request("/runs", { method: "POST" });

    expect(res.status).toBe(401);
    expect(lines).toEqual(["[http] POST /runs -> 401 0ms"]);
  });

  it("skips logs for configured path prefixes", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(
      "*",
      createRequestLogger({
        log: (line) => lines.push(line),
        now: () => 8,
        skipPathPrefixes: ["/conversations"],
      }),
    );
    app.get("/conversations", (c) => c.json([]));
    app.get("/conversations/:id", (c) => c.json({ id: c.req.param("id") }));
    app.get("/settings", (c) => c.json({ ok: true }));

    expect((await app.request("/conversations?limit=20")).status).toBe(200);
    expect((await app.request("/conversations/thread_1")).status).toBe(200);
    expect((await app.request("/settings")).status).toBe(200);

    expect(lines).toEqual(["[http] GET /settings -> 200 0ms"]);
  });

  it("logs thrown route errors as 500 responses", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(
      "*",
      createRequestLogger({
        log: (line) => lines.push(line),
        now: () => 20,
      }),
    );
    app.get("/boom", () => {
      throw new Error("boom");
    });
    app.onError((_, c) => c.text("internal error", 500));

    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    expect(lines).toEqual(["[http] GET /boom -> 500 0ms"]);
  });
});

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { UsageService } from "../services/usage";
import { buildUsageRoutes } from "./usage";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 'x', 1, 1)`);
  db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'completed', 1)`);
  const usage = new UsageService(db);
  usage.recordRun({ runId: "r1", threadId: "t1", inputTokens: 100, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 50, totalCostUsd: 0.01, permissionDenials: [], model: "m" });
  const app = new Hono();
  app.route("/", buildUsageRoutes(usage));
  return { app, db };
}

describe("GET /usage", () => {
  it("returns aggregate within range", async () => {
    const { app } = makeApp();
    const now = Date.now();
    const res = await app.request(`/usage?from=0&to=${now + 1000}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: { inputTokens: number; totalCostUsd: number } };
    expect(body.summary.inputTokens).toBe(100);
    expect(body.summary.totalCostUsd).toBeCloseTo(0.01, 6);
  });

  it("400 when from/to missing or invalid", async () => {
    const { app } = makeApp();
    expect((await app.request("/usage")).status).toBe(400);
    expect((await app.request("/usage?from=abc&to=1")).status).toBe(400);
  });

  it("filters by thread_id when provided", async () => {
    const { app } = makeApp();
    const now = Date.now();
    const res = await app.request(`/usage?from=0&to=${now + 1000}&thread_id=does-not-exist`);
    const body = await res.json() as { summary: { inputTokens: number } };
    expect(body.summary.inputTokens).toBe(0);
  });
});

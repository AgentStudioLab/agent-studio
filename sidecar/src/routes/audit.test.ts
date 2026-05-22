import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { AuditService } from "../services/audit";
import { buildAuditRoutes } from "./audit";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const audit = new AuditService(db);
  audit.appendPre({ ts: 100, threadId: "A", toolName: "Bash", toolUseId: "u1", input: {}, cwd: "/" });
  audit.appendPre({ ts: 200, threadId: "A", toolName: "Read", toolUseId: "u2", input: {}, cwd: "/" });
  audit.appendPre({ ts: 300, threadId: "B", toolName: "Edit", toolUseId: "u3", input: {}, cwd: "/" });
  const app = new Hono();
  app.route("/", buildAuditRoutes(audit));
  return app;
}

describe("GET /audit", () => {
  it("returns rows for a thread", async () => {
    const app = makeApp();
    const res = await app.request("/audit?thread_id=A&limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ toolName: string }> };
    expect(body.rows.map((r) => r.toolName)).toEqual(["Read", "Bash"]);
  });

  it("400 when thread_id missing", async () => {
    const app = makeApp();
    const res = await app.request("/audit?limit=10");
    expect(res.status).toBe(400);
  });
});

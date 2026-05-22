import { Hono } from "hono";
import type { AuditService } from "../services/audit";

export function buildAuditRoutes(audit: AuditService): Hono {
  const r = new Hono();
  r.get("/audit", (c) => {
    const threadId = c.req.query("thread_id");
    if (!threadId) return c.json({ error: "thread_id required" }, 400);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1000);
    const rows = audit.queryByThread(threadId, limit);
    return c.json({ rows });
  });
  return r;
}

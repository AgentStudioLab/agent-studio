import { Hono } from "hono";
import type { UsageService } from "../services/usage";

export function buildUsageRoutes(usage: UsageService): Hono {
  const r = new Hono();
  r.get("/usage", (c) => {
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const from = fromStr ? Number.parseInt(fromStr, 10) : NaN;
    const to = toStr ? Number.parseInt(toStr, 10) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return c.json({ error: "from/to must be integers (ms epoch)" }, 400);
    }
    const threadId = c.req.query("thread_id");
    const summary = usage.summary({ from, to, threadId });
    return c.json({ summary });
  });
  return r;
}

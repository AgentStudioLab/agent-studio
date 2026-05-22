import { Hono } from "hono";
import type { SettingsToolsService } from "../services/settings-tools";

export function buildSettingsToolsRoutes(svc: SettingsToolsService): Hono {
  const r = new Hono();
  r.get("/settings/allowed-tools", (c) => c.json({ tools: svc.getDefault() }));
  r.put("/settings/allowed-tools", async (c) => {
    const body = (await c.req.json()) as { tools?: unknown };
    if (!Array.isArray(body.tools) || !body.tools.every((t) => typeof t === "string")) {
      return c.json({ error: "tools must be string[]" }, 400);
    }
    svc.setDefault(body.tools);
    return c.json({ ok: true });
  });
  return r;
}

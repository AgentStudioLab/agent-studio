import { Hono } from "hono";
import type { ApiKeyState } from "../services/apiKey";

export function buildSettingsRoutes(apiKey: ApiKeyState): Hono {
  const app = new Hono();

  app.post("/settings/api-key", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { apiKey?: string | null } | null;
    if (body === null) return c.json({ error: "invalid_body" }, 400);
    if (body.apiKey !== null && typeof body.apiKey !== "string") {
      return c.json({ error: "invalid_api_key" }, 400);
    }
    apiKey.set(body.apiKey ?? null);
    return c.json({ ok: true });
  });

  return app;
}

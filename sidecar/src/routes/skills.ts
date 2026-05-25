import { Hono } from "hono";
import type { SkillRegistry } from "../services/skillRegistry";

export function buildSkillsRoutes(registry: SkillRegistry): Hono {
  const r = new Hono();

  r.get("/skills", (c) => {
    return c.json({ skills: registry.listSkills() });
  });

  r.patch("/skills/:id/enabled", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { enabled?: unknown }).enabled !== "boolean"
    ) {
      return c.json({ error: "enabled must be a boolean" }, 400);
    }
    const enabled = (body as { enabled: boolean }).enabled;
    const ok = registry.setEnabled(id, enabled);
    if (!ok) return c.json({ error: "unknown_skill_id" }, 404);
    return c.body(null, 204);
  });

  return r;
}

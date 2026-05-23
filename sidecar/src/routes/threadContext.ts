import { Hono } from "hono";
import type { SessionMetadataStore } from "../services/sessionMetadata";

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  color?: string;
}

interface McpEntry {
  name: string;
  description: string;
  connected: boolean;
}

/**
 * GET /threads/:threadId/context — what the SDK actually loaded for the
 * most recent Run of this thread. Empty arrays when the thread hasn't
 * started yet (or sidecar restarted since last Run — in-memory store).
 *
 * Skills are intentionally empty for now: SDK doesn't expose a stable
 * "skill" concept on system.init yet. The route shape is stable so the
 * frontend can be wired today; populate the array once we know how to
 * identify skill-exposed tools.
 */
export function buildThreadContextRoutes(store: SessionMetadataStore): Hono {
  const app = new Hono();

  app.get("/threads/:threadId/context", (c) => {
    const threadId = c.req.param("threadId");
    const meta = store.get(threadId);
    const mcpServers: McpEntry[] = (meta?.mcpServers ?? []).map((s) => ({
      name: s.name,
      description: "",
      connected: s.status === "connected",
    }));
    const skills: SkillEntry[] = [];
    return c.json({ skills, mcpServers });
  });

  return app;
}

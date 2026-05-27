import { Hono } from "hono";
import type { SessionMetadataStore } from "../services/sessionMetadata";
import type { SkillInvocationStore } from "../agui/provider-claude/skill-invocations";
import type { SkillRegistry } from "../services/skillRegistry";

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
 * Skills are populated from SkillInvocationStore, which is fed by a
 * PreToolUse hook every time the agent invokes the built-in `Skill` tool.
 * Display name + description come from SkillRegistry; if the skill id is
 * unknown to the registry (e.g. user disabled / deleted between invocations)
 * we still surface it with id as the name so the user sees what was loaded.
 */
export function buildThreadContextRoutes(
  store: SessionMetadataStore,
  invocations: SkillInvocationStore,
  registry: SkillRegistry,
): Hono {
  const app = new Hono();

  app.get("/threads/:threadId/context", (c) => {
    const threadId = c.req.param("threadId");
    const meta = store.get(threadId);
    const mcpServers: McpEntry[] = (meta?.mcpServers ?? []).map((s) => ({
      name: s.name,
      description: "",
      connected: s.status === "connected",
    }));

    const invokedIds = invocations.list(threadId);
    const knownById = new Map(
      registry.listSkills().map((s) => [s.id, s] as const),
    );
    const skills: SkillEntry[] = invokedIds.map((id) => {
      const known = knownById.get(id);
      return known
        ? { id, name: known.name, description: known.description }
        : { id, name: id, description: "" };
    });

    return c.json({ skills, mcpServers });
  });

  return app;
}

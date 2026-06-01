import { Hono } from "hono";
import type { AgentMemoryService } from "../services/agentMemories";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentMemoryDeps {
  agentMemories: AgentMemoryService;
  agentWorkspaces: AgentWorkspaceService;
}

/**
 * User-facing memory CRUD (the MemoryCard). Agent-written memories arrive via
 * the `remember` MCP tool, not here.
 *
 *   GET    /agents/:id/memories            list (oldest first)
 *   POST   /agents/:id/memories            add a user memory ({ content, block })
 *   DELETE /agents/:id/memories/:memId     remove one
 */
export function buildAgentMemoryRoutes(deps: MountAgentMemoryDeps): Hono {
  const { agentMemories, agentWorkspaces } = deps;
  const app = new Hono();

  app.get("/agents/:id/memories", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    return c.json(agentMemories.listByAgent(id));
  });

  app.post("/agents/:id/memories", async (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (typeof body?.content !== "string" || body.content.trim().length === 0) {
      return c.json({ error: "invalid_content" }, 400);
    }
    const block =
      body.block === "profile" ? "profile" : body.block === "facts" ? "facts" : null;
    if (!block) {
      return c.json({ error: "invalid_block" }, 400);
    }
    const memory = agentMemories.create({
      agentWorkspaceId: id,
      content: body.content.trim(),
      source: "user",
      block,
    });
    return c.json(memory, 201);
  });

  app.delete("/agents/:id/memories/:memId", (c) => {
    const id = c.req.param("id");
    const memId = c.req.param("memId");
    const memory = agentMemories.get(memId);
    if (!memory || memory.agentWorkspaceId !== id) {
      return c.json({ error: "memory_not_found" }, 404);
    }
    agentMemories.delete(memId);
    return c.json({ ok: true });
  });

  return app;
}

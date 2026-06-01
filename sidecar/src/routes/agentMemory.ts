import { Hono } from "hono";
import type { AgentMemoryStore } from "../services/agentMemoryStore";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentMemoryTreeDeps {
  agentMemoryStore: AgentMemoryStore;
  agentWorkspaces: AgentWorkspaceService;
}

/**
 * Read-only file tree of <home>/memory/ for the Context "Memory" card. Agent
 * writes arrive via the `remember` MCP tool, not here; users cannot edit
 * memory files through the UI.
 *
 *   GET /agents/:id/memory/tree   recursive tree (MEMORY.md + scenario files)
 */
export function buildAgentMemoryTreeRoutes(deps: MountAgentMemoryTreeDeps): Hono {
  const app = new Hono();
  app.get("/agents/:id/memory/tree", async (c) => {
    const id = c.req.param("id");
    if (!deps.agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    return c.json(await deps.agentMemoryStore.tree(id));
  });
  return app;
}

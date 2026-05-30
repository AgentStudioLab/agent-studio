import { Hono } from "hono";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentInstructionDeps {
  agentWorkspaces: AgentWorkspaceService;
}

/**
 * The agent's instructions module IS the real `<home>/CLAUDE.md` file (spec §6).
 * runWorker reads it on each agent-bound run and injects it into
 * systemPrompt.append (the "自读注入" approach — no settingSources).
 *
 *   GET /agents/:id/instructions   { content }  ("" when the file is absent)
 *   PUT /agents/:id/instructions   { content }  overwrite the file
 */
export function buildAgentInstructionRoutes(deps: MountAgentInstructionDeps): Hono {
  const { agentWorkspaces } = deps;
  const app = new Hono();

  app.get("/agents/:id/instructions", (c) => {
    const agent = agentWorkspaces.get(c.req.param("id"));
    if (!agent) return c.json({ error: "agent_not_found" }, 404);
    let content = "";
    try {
      content = readFileSync(join(agent.homeDir, "CLAUDE.md"), "utf8");
    } catch {
      // No CLAUDE.md yet → empty.
    }
    return c.json({ content });
  });

  app.put("/agents/:id/instructions", async (c) => {
    const agent = agentWorkspaces.get(c.req.param("id"));
    if (!agent) return c.json({ error: "agent_not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (typeof body?.content !== "string") {
      return c.json({ error: "invalid_content" }, 400);
    }
    writeFileSync(join(agent.homeDir, "CLAUDE.md"), body.content, "utf8");
    return c.json({ content: body.content });
  });

  return app;
}

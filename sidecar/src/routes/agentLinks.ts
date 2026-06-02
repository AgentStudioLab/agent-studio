import { Hono } from "hono";
import type { AgentLinkService } from "../services/agentLinks";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentLinkDeps {
  agentLinks: AgentLinkService;
  agentWorkspaces: AgentWorkspaceService;
}

/** http/https only; returns the parsed URL or null. */
function parseHttpUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Reference-link management, nested under an agent workspace.
 *
 *   GET    /agents/:id/links            list this agent's reference links
 *   POST   /agents/:id/links            add one ({ url, title? })
 *   DELETE /agents/:id/links/:linkId    remove one
 *
 * POST validates the URL is a well-formed http(s) URL; title defaults to its host.
 */
export function buildAgentLinkRoutes(deps: MountAgentLinkDeps): Hono {
  const { agentLinks, agentWorkspaces } = deps;
  const app = new Hono();

  app.get("/agents/:id/links", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    return c.json(agentLinks.listByAgent(id));
  });

  app.post("/agents/:id/links", async (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const url = parseHttpUrl(body?.url);
    if (!url) return c.json({ error: "invalid_url" }, 400);
    const link = agentLinks.create({
      agentWorkspaceId: id,
      url: url.toString(),
      title:
        typeof body?.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : url.host,
    });
    return c.json(link, 201);
  });

  app.delete("/agents/:id/links/:linkId", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    agentLinks.delete(c.req.param("linkId"));
    return c.json({ ok: true });
  });

  return app;
}

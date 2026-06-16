import { Hono } from "hono";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
import type { ThreadService } from "../services/threads";
import type { ScheduledTaskService } from "../services/scheduledTasks";

export interface MountAgentWorkspaceDeps {
  agentWorkspaces: AgentWorkspaceService;
  threads: ThreadService;
  scheduledTasks: ScheduledTaskService;
}

/**
 * Agent-workspace CRUD.
 *
 *   GET    /agents        list (non-archived, newest first)
 *   POST   /agents        create (mkdirs the home dir)
 *   GET    /agents/:id    detail
 *   PATCH  /agents/:id    partial update (name / avatar / archived)
 *   DELETE /agents/:id    delete row + cascade (archive convos, unbind tasks, keep dir)
 */
export function buildAgentWorkspaceRoutes(deps: MountAgentWorkspaceDeps): Hono {
  const { agentWorkspaces, threads, scheduledTasks } = deps;
  const app = new Hono();

  app.get("/agents", (c) => c.json(agentWorkspaces.list()));

  app.post("/agents", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const agent = agentWorkspaces.create({
      name: body.name,
      avatar: typeof body.avatar === "string" ? body.avatar : null,
    });
    return c.json(agent, 201);
  });

  app.get("/agents/:id", (c) => {
    const agent = agentWorkspaces.get(c.req.param("id"));
    if (!agent) return c.json({ error: "not_found" }, 404);
    return c.json(agent);
  });

  app.patch("/agents/:id", async (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length === 0)) {
      return c.json({ error: "invalid_name" }, 400);
    }
    // mountedSkills 三态：null=继承全部；字符串数组=显式子集（含空数组）；其余=不改。
    const rawSkills = body.mountedSkills;
    const mountedSkills =
      rawSkills === null
        ? null
        : Array.isArray(rawSkills) && rawSkills.every((s) => typeof s === "string")
          ? (rawSkills as string[])
          : undefined;
    const updated = agentWorkspaces.update(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      avatar:
        body.avatar === null || typeof body.avatar === "string"
          ? (body.avatar as string | null)
          : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
      mountedSkills,
    });
    return c.json(updated);
  });

  app.delete("/agents/:id", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "not_found" }, 404);
    // Cascade (spec §15): archive conversations, unbind scheduled tasks, then
    // drop the row. The home dir on disk is intentionally kept.
    threads.archiveByAgentWorkspace(id);
    scheduledTasks.unbindAgentWorkspace(id);
    agentWorkspaces.delete(id);
    return c.json({ ok: true });
  });

  return app;
}

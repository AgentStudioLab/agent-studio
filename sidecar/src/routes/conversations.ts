import { Hono } from "hono";
import type { ThreadService } from "../services/threads";
import type { RunEventStore } from "../agui/core";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountConversationsDeps {
  threads: ThreadService;
  store: RunEventStore;
  agentWorkspaces: AgentWorkspaceService;
}

export function buildConversationRoutes(deps: MountConversationsDeps): Hono {
  const { threads, store, agentWorkspaces } = deps;
  const app = new Hono();

  app.post("/conversations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          id?: string;
          title?: string;
          agentWorkspaceId?: string | null;
          workingDir?: string | null;
          model?: string | null;
        }
      | null;
    // Binding an agent seeds cwd = its home dir, unless the caller passed an
    // explicit workingDir (which wins).
    const agentWorkspaceId = body?.agentWorkspaceId ?? null;
    if (agentWorkspaceId && !agentWorkspaces.get(agentWorkspaceId)) {
      return c.json({ error: "agent_not_found" }, 404);
    }
    const home = agentWorkspaceId ? agentWorkspaces.homeDir(agentWorkspaceId) : null;
    const t = threads.create({
      id: body?.id,
      title: body?.title,
      agentWorkspaceId,
      workingDir: body?.workingDir ?? home ?? null,
      model:
        typeof body?.model === "string" && body.model.length > 0 ? body.model : null,
    });
    return c.json(t, 201);
  });

  app.get("/conversations", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "20"), 1), 100);
    const pinnedOnly = c.req.query("pinned") === "true";
    const archivedParam = c.req.query("archived");
    const archived =
      archivedParam === "archived" || archivedParam === "all"
        ? archivedParam
        : "active";
    const agentWorkspaceId = c.req.query("agentWorkspaceId") || undefined;
    return c.json(threads.list({ limit, pinnedOnly, archived, agentWorkspaceId }));
  });

  // Status aggregation — one row per conversation with lastRunId + run status.
  // MUST be declared BEFORE `/conversations/:id` so the literal "status"
  // segment doesn't get captured as an id param.
  app.get("/conversations/status", async (c) => {
    return c.json(await store.listThreadStatuses());
  });

  app.get("/conversations/:id", (c) => {
    const t = threads.get(c.req.param("id"));
    if (!t) return c.json({ error: "not_found" }, 404);
    return c.json(t);
  });

  app.patch("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!threads.get(id)) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as
      | {
          title?: string;
          pinned?: boolean;
          archived?: boolean;
          workingDir?: string | null;
          model?: string | null;
          agentWorkspaceId?: string | null;
        }
      | null;
    if (body?.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length === 0) {
        return c.json({ error: "invalid_title" }, 400);
      }
    }
    if (body?.pinned !== undefined) {
      if (typeof body.pinned !== "boolean") {
        return c.json({ error: "invalid_pinned" }, 400);
      }
    }
    if (body?.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return c.json({ error: "invalid_archived" }, 400);
      }
    }
    if (body?.workingDir !== undefined) {
      // Pass null through to clear (fall back to default); empty string is
      // rejected to avoid SDK ENOENT on cwd="".
      if (body.workingDir !== null && typeof body.workingDir !== "string") {
        return c.json({ error: "invalid_working_dir" }, 400);
      }
      if (typeof body.workingDir === "string" && body.workingDir.length === 0) {
        return c.json({ error: "invalid_working_dir" }, 400);
      }
    }
    if (body?.model !== undefined) {
      if (body.model !== null && typeof body.model !== "string") {
        return c.json({ error: "invalid_model" }, 400);
      }
      if (typeof body.model === "string" && body.model.length === 0) {
        return c.json({ error: "invalid_model" }, 400);
      }
    }
    if (body?.agentWorkspaceId !== undefined) {
      if (body.agentWorkspaceId !== null && typeof body.agentWorkspaceId !== "string") {
        return c.json({ error: "invalid_agent_workspace_id" }, 400);
      }
      if (body.agentWorkspaceId && !agentWorkspaces.get(body.agentWorkspaceId)) {
        return c.json({ error: "agent_not_found" }, 404);
      }
    }

    if (body?.title !== undefined) {
      threads.rename(id, body.title);
    }
    if (body?.pinned !== undefined) {
      threads.updatePin(id, body.pinned);
    }
    if (body?.archived !== undefined) {
      threads.updateArchived(id, body.archived);
    }
    if (body?.workingDir !== undefined) {
      threads.updateWorkingDir(id, body.workingDir);
    }
    if (body?.model !== undefined) {
      threads.updateModel(id, body.model);
    }
    if (body?.agentWorkspaceId !== undefined) {
      // Move into a space → working_dir follows the agent home; move out
      // (null) → clear working_dir so it falls back to the default workspace.
      const home = body.agentWorkspaceId
        ? agentWorkspaces.homeDir(body.agentWorkspaceId)
        : null;
      threads.updateAgentWorkspace(id, body.agentWorkspaceId, home);
    }
    return c.json(threads.get(id));
  });

  app.delete("/conversations/:id", (c) => {
    threads.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.patch("/conversations/:id/allowed-tools", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { tools: string[] | null };
    if (body.tools !== null && !Array.isArray(body.tools)) {
      return c.json({ error: "tools must be array or null" }, 400);
    }
    threads.setAllowedTools(id, body.tools);
    return c.json({ ok: true });
  });

  app.get("/conversations/:id/allowed-tools", (c) => {
    const id = c.req.param("id");
    const tools = threads.getAllowedTools(id);
    return c.json({ tools });
  });

  return app;
}

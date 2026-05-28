import { Hono } from "hono";
import type { ThreadService } from "../services/threads";
import type { RunEventStore } from "../agui/core";

export interface MountConversationsDeps {
  threads: ThreadService;
  store: RunEventStore;
}

export function buildConversationRoutes(deps: MountConversationsDeps): Hono {
  const { threads, store } = deps;
  const app = new Hono();

  app.post("/conversations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          id?: string;
          title?: string;
          projectId?: string | null;
          workingDir?: string | null;
        }
      | null;
    const t = threads.create({
      id: body?.id,
      title: body?.title,
      projectId: body?.projectId ?? null,
      workingDir: body?.workingDir ?? null,
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
    return c.json(threads.list({ limit, pinnedOnly, archived }));
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
        }
      | null;
    if (body?.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length === 0) {
        return c.json({ error: "invalid_title" }, 400);
      }
      threads.rename(id, body.title);
    }
    if (body?.pinned !== undefined) {
      threads.updatePin(id, body.pinned);
    }
    if (body?.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return c.json({ error: "invalid_archived" }, 400);
      }
      threads.updateArchived(id, body.archived);
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
      threads.updateWorkingDir(id, body.workingDir);
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

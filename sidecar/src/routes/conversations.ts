import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  updatePin,
  updateTitle,
} from "../services/conversations";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function validateId(id: string): boolean {
  return ULID_RE.test(id);
}

export function buildConversationRoutes(db: Database): Hono {
  const app = new Hono();

  app.post("/conversations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      prompt?: string;
      projectId?: string | null;
      mode?: "ask" | "agent";
    } | null;
    if (!body?.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt_required" }, 400);
    }
    const mode = body.mode === "agent" ? "agent" : "ask";
    const conv = createConversation(db, {
      prompt: body.prompt,
      projectId: body.projectId ?? null,
      mode,
    });
    return c.json(conv, 201);
  });

  app.get("/conversations", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "20"), 1), 100);
    const pinnedOnly = c.req.query("pinned") === "true";
    const rows = listConversations(db, { limit, pinnedOnly });
    return c.json(rows);
  });

  app.get("/conversations/:id", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const conv = getConversation(db, id);
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(conv);
  });

  app.patch("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    if (!getConversation(db, id)) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as {
      title?: string;
      pinned?: boolean;
    } | null;
    if (body?.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length === 0) {
        return c.json({ error: "invalid_title" }, 400);
      }
      updateTitle(db, id, body.title);
    }
    if (body?.pinned !== undefined) {
      updatePin(db, id, body.pinned);
    }
    return c.json(getConversation(db, id));
  });

  app.delete("/conversations/:id", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    deleteConversation(db, id);
    return c.json({ ok: true });
  });

  app.get("/conversations/:id/messages", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    return c.json(getMessages(db, id));
  });

  return app;
}

import { Hono } from "hono";
import type { MessageService } from "../services/messages";

/**
 * Read-only history endpoint for the chat UI. The grouped representation
 * folds N consecutive assistant rows into one turn (matches the client
 * reducer's MessageView shape).
 */
export function buildMessageRoutes(messages: MessageService): Hono {
  const app = new Hono();

  app.get("/conversations/:id/messages", (c) => {
    const id = c.req.param("id");
    return c.json(messages.listByThreadGrouped(id));
  });

  return app;
}

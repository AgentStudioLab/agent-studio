import { Hono } from "hono";
import type { ChannelConnectionService } from "../core/ChannelConnectionService";
import type { ChannelManager } from "../core/ChannelManager";
import type { ChannelConnectionConfig } from "../core/ChannelTypes";
import type { FakeChannelPlugin } from "../plugins/fake/FakeChannelPlugin";

export function buildChannelConnectionRoutes(deps: {
  connections: ChannelConnectionService;
  manager: ChannelManager;
  fake?: FakeChannelPlugin;
}): Hono {
  const app = new Hono();

  app.get("/channels/connections", (c) => {
    return c.json({ connections: deps.connections.list() });
  });

  app.patch("/channels/connections/:id", async (c) => {
    const id = c.req.param("id");
    const existing = deps.connections.get(id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as
      | {
          name?: unknown;
          enabled?: unknown;
          config?: Record<string, unknown>;
        }
      | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const config: ChannelConnectionConfig | undefined = body.config
      ? {
          ...existing.config,
          ...body.config,
          permissionStrategy: "auto_execute",
        }
      : undefined;
    const updated = deps.connections.update(id, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(config ? { config } : {}),
    });
    return c.json({ connection: updated });
  });

  app.post("/channels/connections/:id/enable", async (c) => {
    const id = c.req.param("id");
    if (!deps.connections.get(id)) return c.json({ error: "not_found" }, 404);
    await deps.manager.start(id);
    return c.json({ connection: deps.connections.get(id) });
  });

  app.post("/channels/connections/:id/disable", async (c) => {
    const id = c.req.param("id");
    if (!deps.connections.get(id)) return c.json({ error: "not_found" }, 404);
    await deps.manager.stop(id);
    return c.json({ connection: deps.connections.get(id) });
  });

  app.post("/channels/fake/:id/incoming", async (c) => {
    const connectionId = c.req.param("id");
    const connection = deps.connections.get(connectionId);
    if (!connection || connection.type !== "fake") {
      return c.json({ error: "not_found" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as
      | {
          chatId?: unknown;
          senderId?: unknown;
          text?: unknown;
          attachments?: Array<{
            type?: unknown;
            path?: unknown;
            name?: unknown;
          }>;
        }
      | null;
    if (
      !body ||
      typeof body.chatId !== "string" ||
      typeof body.senderId !== "string"
    ) {
      return c.json({ error: "invalid_body" }, 400);
    }
    await deps.fake?.emitIncoming({
      id: `fake_${Date.now()}`,
      connectionId,
      channelType: "fake",
      chatId: body.chatId,
      senderId: body.senderId,
      text: typeof body.text === "string" ? body.text : undefined,
      attachments: (body.attachments ?? [])
        .filter(
          (item) =>
            (item.type === "file" || item.type === "image") &&
            typeof item.path === "string" &&
            typeof item.name === "string",
        )
        .map((item) => ({
          type: item.type as "file" | "image",
          path: item.path as string,
          name: item.name as string,
        })),
      timestamp: Date.now(),
    });
    return c.json({ ok: true }, 202);
  });

  return app;
}

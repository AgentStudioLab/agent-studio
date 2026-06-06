import { Hono } from "hono";
import type { RemoteTaskService } from "../tasks/RemoteTaskService";

export function buildRemoteTaskRoutes(deps: { tasks: RemoteTaskService }): Hono {
  const app = new Hono();

  app.get("/channels/remote-tasks/recent", (c) => {
    return c.json({ tasks: deps.tasks.listRecent() });
  });

  return app;
}

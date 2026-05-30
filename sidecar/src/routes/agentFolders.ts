import { Hono } from "hono";
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import type { AgentFolderService } from "../services/agentFolders";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentFolderDeps {
  agentFolders: AgentFolderService;
  agentWorkspaces: AgentWorkspaceService;
}

/**
 * External-folder management, nested under an agent workspace.
 *
 *   GET    /agents/:id/folders            list this agent's mounted folders
 *   POST   /agents/:id/folders            mount one ({ path, folderName?, writable? })
 *   PATCH  /agents/:id/folders/:folderId  toggle write access ({ writable })
 *   DELETE /agents/:id/folders/:folderId  unmount (the path on disk is untouched)
 *
 * POST validates the path is absolute and an existing directory — the frontend
 * picks it via the native dir dialog, so this only guards against garbage.
 */
export function buildAgentFolderRoutes(deps: MountAgentFolderDeps): Hono {
  const { agentFolders, agentWorkspaces } = deps;
  const app = new Hono();

  app.get("/agents/:id/folders", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    return c.json(agentFolders.listByAgent(id));
  });

  app.post("/agents/:id/folders", async (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const path = body?.path;
    if (typeof path !== "string" || !isAbsolute(path)) {
      return c.json({ error: "invalid_path" }, 400);
    }
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return c.json({ error: "not_a_directory" }, 400);
    }
    const folder = agentFolders.create({
      agentWorkspaceId: id,
      path,
      folderName:
        typeof body?.folderName === "string" && body.folderName.trim().length > 0
          ? body.folderName
          : basename(path),
      writable: body?.writable === true,
    });
    return c.json(folder, 201);
  });

  app.patch("/agents/:id/folders/:folderId", async (c) => {
    const id = c.req.param("id");
    const folderId = c.req.param("folderId");
    const folder = agentFolders.get(folderId);
    if (!folder || folder.agentWorkspaceId !== id) {
      return c.json({ error: "folder_not_found" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (typeof body?.writable !== "boolean") {
      return c.json({ error: "invalid_writable" }, 400);
    }
    return c.json(agentFolders.setWritable(folderId, body.writable));
  });

  app.delete("/agents/:id/folders/:folderId", (c) => {
    const id = c.req.param("id");
    const folderId = c.req.param("folderId");
    const folder = agentFolders.get(folderId);
    if (!folder || folder.agentWorkspaceId !== id) {
      return c.json({ error: "folder_not_found" }, 404);
    }
    agentFolders.delete(folderId);
    return c.json({ ok: true });
  });

  return app;
}

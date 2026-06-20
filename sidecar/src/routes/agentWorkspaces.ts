import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
import { normalizeAgentCategory, normalizeAgentCoverImage } from "../services/agentWorkspaces";
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
    const category = normalizeAgentCategory(body.category);
    const agent = agentWorkspaces.create({
      name: body.name,
      avatar: typeof body.avatar === "string" ? body.avatar : null,
      category,
      coverImage: normalizeAgentCoverImage(body.coverImage, category),
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
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
    const existing = agentWorkspaces.get(id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    // 内置(官方只读)：name/avatar/mountedSkills/archived 属于定义、不可改；仅 pinned 等
    // 用户自有操作放行（spec §8）。pin-only 的 PATCH 仍可通过。
    const touchesDefinition =
      body.name !== undefined ||
      body.avatar !== undefined ||
      body.category !== undefined ||
      body.coverImage !== undefined ||
      body.mountedSkills !== undefined ||
      body.archived !== undefined;
    if (existing.source === "builtin" && touchesDefinition) {
      return c.json({ error: "builtin_readonly" }, 403);
    }
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
      category:
        body.category === null || typeof body.category === "string"
          ? normalizeAgentCategory(body.category)
          : undefined,
      coverImage:
        body.coverImage === null || typeof body.coverImage === "string"
          ? normalizeAgentCoverImage(
              body.coverImage,
              body.category === null || typeof body.category === "string"
                ? normalizeAgentCategory(body.category)
                : existing.category,
            )
          : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
      mountedSkills,
    });
    return c.json(updated);
  });

  app.delete("/agents/:id", (c) => {
    const id = c.req.param("id");
    const existing = agentWorkspaces.get(id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    // 内置(官方只读)不可删（spec §8）。下架由 reconcile 在 JSON 移除时托管。
    if (existing.source === "builtin") return c.json({ error: "builtin_readonly" }, 403);
    // Cascade (spec §15): archive conversations, unbind scheduled tasks, then
    // drop the row. The home dir on disk is intentionally kept.
    threads.archiveByAgentWorkspace(id);
    scheduledTasks.unbindAgentWorkspace(id);
    agentWorkspaces.delete(id);
    return c.json({ ok: true });
  });

  // 克隆：把某个 agent（内置或普通）的【定义】复制成一个新的、完全可编辑的用户 agent。
  // 只复制定义（指令 CLAUDE.md + 挂载技能），不复制 memory / 对话 / folders（运行时数据）。
  // 这是内置只读 agent 的"想改就先克隆"逃生通道（spec §10）。
  app.post("/agents/:id/clone", (c) => {
    const src = agentWorkspaces.get(c.req.param("id"));
    if (!src) return c.json({ error: "not_found" }, 404);
    const clone = agentWorkspaces.create({
      name: `${src.name} (副本)`,
      avatar: src.avatar,
      category: src.category,
      coverImage: src.coverImage,
    });
    try {
      const md = readFileSync(join(src.homeDir, "CLAUDE.md"), "utf8");
      writeFileSync(join(clone.homeDir, "CLAUDE.md"), md, "utf8");
    } catch {
      // src 没有 CLAUDE.md → 副本也不需要，跳过。
    }
    const updated = agentWorkspaces.update(clone.id, { mountedSkills: src.mountedSkills }) ?? clone;
    return c.json(updated, 201);
  });

  return app;
}

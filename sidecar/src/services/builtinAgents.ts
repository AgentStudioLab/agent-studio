import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INDEX_HEADER, MEMORY_DIR, MEMORY_INDEX } from "./agentMemoryStore";
import { BUILTIN_AGENT_DEFS, type BuiltinAgentDef } from "../builtins/agents";
import { normalizeAgentCategory, normalizeAgentCoverImage } from "./agentWorkspaces";

/** 内置 agent 的 id 规则：固定前缀 + slug，既不与用户 `agw_<nanoid>` 撞，也肉眼可辨。 */
export function builtinAgentId(slug: string): string {
  return `agw_builtin_${slug}`;
}

/** mounted_skills_json 的写入值：undefined/null → NULL（继承全部）；数组 → 序列化。 */
function serializeMountedSkills(mounted: string[] | null | undefined): string | null {
  return mounted == null ? null : JSON.stringify(mounted);
}

/**
 * 把仓库内打包的内置 agent 定义 reconcile 进 DB —— 在 sidecar 启动、构造
 * AgentWorkspaceService 之后调用一次（与 store.reconcileOrphans 同一 boot 阶段）。
 *
 * 只读边界（spec §3）：
 *   - 定义字段（name / avatar / mounted_skills_json + homeDir/CLAUDE.md）每次启动从
 *     JSON【覆盖】→ App 升级改定义零迁移、无漂移。
 *   - 用户自有数据（memory/ 对话 / folders / links / pinned）【绝不触碰】。
 *   - archived 由 reconcile 托管：JSON 在 → 0；JSON 被移除 → 软下架(1)、保留用户数据。
 *
 * baseDir 必须与 AgentWorkspaceService 使用的一致（生产传 DEFAULT_BASE_DIR），否则
 * homeDir 会对不上。defs 可注入，便于单测用合成数据覆盖各分支。
 *
 * @returns 本次处理的内置 id 列表（含新建/更新与软下架），便于日志。
 */
export function reconcileBuiltinAgents(
  db: Database,
  baseDir: string,
  defs: BuiltinAgentDef[] = BUILTIN_AGENT_DEFS,
): { upserted: string[]; archived: string[] } {
  const upserted: string[] = [];
  const presentIds = new Set<string>();

  for (const def of defs) {
    const id = builtinAgentId(def.slug);
    presentIds.add(id);
    const homeDir = join(baseDir, id);

    // 1) 物理工作空间（幂等）：homeDir + memory index；指令落成 CLAUDE.md（定义字段，每次覆盖）。
    mkdirSync(homeDir, { recursive: true });
    const memDir = join(homeDir, MEMORY_DIR);
    mkdirSync(memDir, { recursive: true });
    const memIndex = join(memDir, MEMORY_INDEX);
    if (!existsSync(memIndex)) writeFileSync(memIndex, INDEX_HEADER, "utf8");
    writeFileSync(join(homeDir, "CLAUDE.md"), def.instructions ?? "", "utf8");

    // 2) DB 行 upsert —— 只动定义字段 + archived/source，不写 pinned、不写 home_dir。
    const avatar = def.avatar ?? null;
    const category = normalizeAgentCategory(def.category);
    const coverImage = normalizeAgentCoverImage(def.coverImage, category);
    const mounted = serializeMountedSkills(def.mountedSkills);
    const now = Date.now();
    const exists = db
      .prepare("SELECT id FROM agent_workspaces WHERE id = ?")
      .get(id) as { id: string } | undefined;
    if (!exists) {
      db.prepare(
        `INSERT INTO agent_workspaces
           (id, name, avatar, home_dir, archived, pinned, source, category, cover_image,
            mounted_skills_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 'builtin', ?, ?, ?, ?, ?)`,
      ).run(id, def.name, avatar, homeDir, category, coverImage, mounted, now, now);
    } else {
      db.prepare(
        `UPDATE agent_workspaces
            SET name = ?, avatar = ?, category = ?, cover_image = ?,
                mounted_skills_json = ?, archived = 0,
                source = 'builtin', updated_at = ?
          WHERE id = ?`,
      ).run(def.name, avatar, category, coverImage, mounted, now, id);
    }
    upserted.push(id);
  }

  // 3) 收尾：source='builtin' 但本次清单里没有的行 → 软下架（保留用户数据，不真删）。
  const archived: string[] = [];
  const builtinRows = db
    .prepare("SELECT id FROM agent_workspaces WHERE source = 'builtin'")
    .all() as { id: string }[];
  for (const row of builtinRows) {
    if (presentIds.has(row.id)) continue;
    db.prepare("UPDATE agent_workspaces SET archived = 1, updated_at = ? WHERE id = ?").run(
      Date.now(),
      row.id,
    );
    archived.push(row.id);
  }

  return { upserted, archived };
}

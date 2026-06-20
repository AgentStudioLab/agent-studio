import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { INDEX_HEADER, MEMORY_DIR, MEMORY_INDEX } from "./agentMemoryStore";

export const AGENT_FUNCTION_CATEGORIES = [
  "development",
  "research",
  "writing",
  "automation",
  "general",
] as const;
export type AgentFunctionCategory = (typeof AGENT_FUNCTION_CATEGORIES)[number];

export const AGENT_COVER_IMAGES = AGENT_FUNCTION_CATEGORIES;
export type AgentCoverImage = (typeof AGENT_COVER_IMAGES)[number];

const AGENT_CATEGORY_ALIASES: Record<string, AgentFunctionCategory> = {
  "开发构建": "development",
  "研究分析": "research",
  "内容写作": "writing",
  "自动化执行": "automation",
  "通用助手": "general",
};

export function normalizeAgentCategory(raw: unknown): AgentFunctionCategory {
  if (typeof raw !== "string") return "general";
  if ((AGENT_FUNCTION_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as AgentFunctionCategory;
  }
  return AGENT_CATEGORY_ALIASES[raw.trim()] ?? "general";
}

export function normalizeAgentCoverImage(
  raw: unknown,
  fallback: AgentFunctionCategory = "general",
): AgentCoverImage {
  return typeof raw === "string" && (AGENT_COVER_IMAGES as readonly string[]).includes(raw)
    ? (raw as AgentCoverImage)
    : fallback;
}

export interface AgentWorkspace {
  id: string;
  name: string;
  /** InitialsAvatar hue/initials hint, or null. */
  avatar: string | null;
  /** Absolute path to this agent's home dir (read/write workspace). */
  homeDir: string;
  archived: boolean;
  /** Pinned → surfaced in the sidebar Pinned section. */
  pinned: boolean;
  /** 该 agent 挂载的技能 id 列表（三态）：null=继承全部启用技能；[]=显式不挂任何技能；
   *  非空数组=显式子集。运行时与全局启用集取交集（见 server.ts resolveSkillsConfig）。 */
  mountedSkills: string[] | null;
  /** 'user'=用户创建、可编辑/删除；'builtin'=官方只读预置，定义由 reconcileBuiltinAgents
   *  从仓库内 JSON 维护，路由层禁止改写（仅 pin 等用户自有操作放行）。 */
  source: "user" | "builtin";
  /** 功能分类：用于前端按智能体用途生成分类 tab。 */
  category: AgentFunctionCategory;
  /** 前端本地封面资产 id；无效值按 category 回退。 */
  coverImage: AgentCoverImage;
  createdAt: number;
  updatedAt: number;
}

interface AgentWorkspaceRow {
  id: string;
  name: string;
  avatar: string | null;
  home_dir: string;
  archived: number;
  pinned: number;
  mounted_skills_json: string | null;
  source: string;
  category: string | null;
  cover_image: string | null;
  created_at: number;
  updated_at: number;
}

/** 安全解析挂载技能 JSON：NULL/损坏/非字符串数组都回退为 null（继承全部），
 *  不让坏数据炸掉 run。 */
function parseMountedSkills(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  } catch {
    // 损坏数据 → 回退继承
  }
  return null;
}

function rowToAgent(r: AgentWorkspaceRow): AgentWorkspace {
  const category = normalizeAgentCategory(r.category);
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    homeDir: r.home_dir,
    archived: r.archived === 1,
    pinned: r.pinned === 1,
    mountedSkills: parseMountedSkills(r.mounted_skills_json),
    source: r.source === "builtin" ? "builtin" : "user",
    category,
    coverImage: normalizeAgentCoverImage(r.cover_image, category),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateAgentWorkspaceInput {
  id?: string;
  name: string;
  avatar?: string | null;
  category?: AgentFunctionCategory | string | null;
  coverImage?: AgentCoverImage | string | null;
  instructions?: string | null;
}

export interface UpdateAgentWorkspaceInput {
  name?: string;
  avatar?: string | null;
  archived?: boolean;
  pinned?: boolean;
  category?: AgentFunctionCategory | string | null;
  coverImage?: AgentCoverImage | string | null;
  /** undefined=不改；null=改回"继承全部"；数组=改为显式子集（含空数组=显式不挂）。 */
  mountedSkills?: string[] | null;
}

/** Default root for per-agent home dirs: ~/.agent-studio/agent-workspaces/<id>/ */
export const DEFAULT_BASE_DIR = join(homedir(), ".agent-studio", "agent-workspaces");

export class AgentWorkspaceService {
  private baseDir: string;
  constructor(
    private db: Database,
    opts?: { baseDir?: string },
  ) {
    this.baseDir = opts?.baseDir ?? DEFAULT_BASE_DIR;
  }

  create(input: CreateAgentWorkspaceInput): AgentWorkspace {
    const id = input.id ?? `agw_${nanoid(12)}`;
    const homeDir = join(this.baseDir, id);
    // Create the home dir up front so the SDK never ENOENTs on its first tool.
    mkdirSync(homeDir, { recursive: true });
    // Seed the file-based memory store so the index file always exists.
    const memDir = join(homeDir, MEMORY_DIR);
    mkdirSync(memDir, { recursive: true });
    const memIndex = join(memDir, MEMORY_INDEX);
    if (!existsSync(memIndex)) writeFileSync(memIndex, INDEX_HEADER, "utf8");
    // 新建时可直接初始化系统提示词；后续编辑仍由 instructions 路由维护同一份 CLAUDE.md。
    const instructions = input.instructions?.trim() ?? "";
    if (instructions.length > 0) {
      writeFileSync(join(homeDir, "CLAUDE.md"), instructions, "utf8");
    }
    const now = Date.now();
    const category = normalizeAgentCategory(input.category);
    const coverImage = normalizeAgentCoverImage(input.coverImage, category);
    this.db
      .prepare(
        `INSERT INTO agent_workspaces
           (id, name, avatar, home_dir, archived, pinned, category, cover_image, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.avatar ?? null, homeDir, category, coverImage, now, now);
    return this.get(id)!;
  }

  get(id: string): AgentWorkspace | null {
    const row = this.db
      .prepare("SELECT * FROM agent_workspaces WHERE id = ?")
      .get(id) as AgentWorkspaceRow | undefined;
    return row ? rowToAgent(row) : null;
  }

  /** Resolve just the home dir (used by the scheduler to set spawned cwd). */
  homeDir(id: string): string | null {
    return this.get(id)?.homeDir ?? null;
  }

  list(): AgentWorkspace[] {
    const rows = this.db
      .prepare("SELECT * FROM agent_workspaces WHERE archived = 0 ORDER BY created_at DESC, rowid DESC")
      .all() as AgentWorkspaceRow[];
    return rows.map(rowToAgent);
  }

  update(id: string, patch: UpdateAgentWorkspaceInput): AgentWorkspace | null {
    if (!this.get(id)) return null;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      vals.push(patch.name);
    }
    if (patch.avatar !== undefined) {
      sets.push("avatar = ?");
      vals.push(patch.avatar);
    }
    if (patch.archived !== undefined) {
      sets.push("archived = ?");
      vals.push(patch.archived ? 1 : 0);
    }
    if (patch.pinned !== undefined) {
      sets.push("pinned = ?");
      vals.push(patch.pinned ? 1 : 0);
    }
    if (patch.category !== undefined) {
      sets.push("category = ?");
      vals.push(normalizeAgentCategory(patch.category));
    }
    if (patch.coverImage !== undefined) {
      const category =
        patch.category !== undefined ? normalizeAgentCategory(patch.category) : this.get(id)!.category;
      sets.push("cover_image = ?");
      vals.push(normalizeAgentCoverImage(patch.coverImage, category));
    }
    if (patch.mountedSkills !== undefined) {
      // null → 写 NULL（继承全部）；数组 → 序列化（空数组=显式不挂）。
      sets.push("mounted_skills_json = ?");
      vals.push(patch.mountedSkills === null ? null : JSON.stringify(patch.mountedSkills));
    }
    sets.push("updated_at = ?");
    vals.push(Date.now());
    this.db
      .prepare(`UPDATE agent_workspaces SET ${sets.join(", ")} WHERE id = ?`)
      .run(...(vals as never[]), id);
    return this.get(id);
  }

  /** Deletes the DB row only. The home dir on disk is intentionally kept
   *  (spec §15: avoid deleting the user's produced files). */
  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_workspaces WHERE id = ?").run(id);
  }
}

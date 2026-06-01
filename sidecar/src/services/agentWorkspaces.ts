import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";

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
  created_at: number;
  updated_at: number;
}

function rowToAgent(r: AgentWorkspaceRow): AgentWorkspace {
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    homeDir: r.home_dir,
    archived: r.archived === 1,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateAgentWorkspaceInput {
  id?: string;
  name: string;
  avatar?: string | null;
}

export interface UpdateAgentWorkspaceInput {
  name?: string;
  avatar?: string | null;
  archived?: boolean;
  pinned?: boolean;
}

/** Default root for per-agent home dirs: ~/.agent-studio/agent-workspaces/<id>/ */
const DEFAULT_BASE_DIR = join(homedir(), ".agent-studio", "agent-workspaces");

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
    const memDir = join(homeDir, "memory");
    mkdirSync(memDir, { recursive: true });
    const memIndex = join(memDir, "MEMORY.md");
    if (!existsSync(memIndex)) {
      writeFileSync(
        memIndex,
        "# Memory index\n\n<!-- One line per scenario memory: - [Title](slug.md) — hook. " +
          "Read the linked file for detail. Maintained by the remember tool. -->\n\n",
        "utf8",
      );
    }
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_workspaces (id, name, avatar, home_dir, archived, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(id, input.name, input.avatar ?? null, homeDir, now, now);
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

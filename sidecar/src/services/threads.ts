import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";

export interface Thread {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  archived: boolean;
  workingDir: string;
  createdAt: number;
  updatedAt: number;
}

interface ThreadRow {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  archived: number;
  working_dir: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Per-conversation working directory. Falls back to ~/.agent-studio/workspace
 * so the SDK has a real cwd even for threads the user never picked one for.
 *
 * Path layout under `~/.agent-studio/`:
 *   workspace/   default cwd
 *   skills/      personal skill source (scanned by skillRegistry)
 *
 * The dir is created on first use so the SDK doesn't ENOENT on its first tool.
 */
const DEFAULT_WORKING_DIR = join(homedir(), ".agent-studio", "workspace");
let defaultDirEnsured = false;
function ensureDefaultDir(): string {
  if (!defaultDirEnsured) {
    mkdirSync(DEFAULT_WORKING_DIR, { recursive: true });
    defaultDirEnsured = true;
  }
  return DEFAULT_WORKING_DIR;
}

function rowToThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    title: r.title,
    projectId: r.project_id,
    pinned: r.pinned === 1,
    archived: r.archived === 1,
    workingDir: r.working_dir ?? ensureDefaultDir(),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class ThreadService {
  constructor(private db: Database) {}

  create(input?: {
    id?: string;
    title?: string;
    projectId?: string | null;
    workingDir?: string | null;
  }): Thread {
    const id = input?.id ?? `thr_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, project_id, pinned, working_dir, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(
        id,
        input?.title ?? "New chat",
        input?.projectId ?? null,
        input?.workingDir ?? null,
        now,
        now,
      );
    return this.get(id)!;
  }

  upsert(id: string, title?: string): Thread {
    const existing = this.get(id);
    if (existing) return existing;
    return this.create({ id, title });
  }

  get(id: string): Thread | null {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id) as ThreadRow | undefined;
    return row ? rowToThread(row) : null;
  }

  list(
    opts: {
      limit?: number;
      pinnedOnly?: boolean;
      /** Defaults to "active" — archived threads are hidden from the sidebar. */
      archived?: "active" | "archived" | "all";
    } = {},
  ): Thread[] {
    const clauses: string[] = [];
    if (opts.pinnedOnly) clauses.push("pinned = 1");
    const archivedFilter = opts.archived ?? "active";
    if (archivedFilter === "active") clauses.push("archived = 0");
    else if (archivedFilter === "archived") clauses.push("archived = 1");
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    const rows = this.db
      .prepare(
        `SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as ThreadRow[];
    return rows.map(rowToThread);
  }

  rename(id: string, title: string): Thread {
    this.db
      .prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), id);
    const t = this.get(id);
    if (!t) throw new Error(`thread ${id} not found`);
    return t;
  }

  updatePin(id: string, pinned: boolean): Thread {
    this.db
      .prepare("UPDATE conversations SET pinned = ?, updated_at = ? WHERE id = ?")
      .run(pinned ? 1 : 0, Date.now(), id);
    return this.get(id)!;
  }

  updateArchived(id: string, archived: boolean): Thread {
    this.db
      .prepare("UPDATE conversations SET archived = ?, updated_at = ? WHERE id = ?")
      .run(archived ? 1 : 0, Date.now(), id);
    return this.get(id)!;
  }

  updateWorkingDir(id: string, workingDir: string | null): Thread {
    this.db
      .prepare("UPDATE conversations SET working_dir = ?, updated_at = ? WHERE id = ?")
      .run(workingDir, Date.now(), id);
    return this.get(id)!;
  }

  touch(id: string): void {
    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }

  getAllowedTools(threadId: string): string[] | null {
    const row = this.db
      .prepare("SELECT allowed_tools_json AS j FROM conversations WHERE id = ?")
      .get(threadId) as { j?: string | null } | undefined;
    if (!row?.j) return null;
    try {
      const parsed = JSON.parse(row.j);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  setAllowedTools(threadId: string, tools: string[] | null): void {
    this.db
      .prepare("UPDATE conversations SET allowed_tools_json = ? WHERE id = ?")
      .run(tools === null ? null : JSON.stringify(tools), threadId);
  }
}

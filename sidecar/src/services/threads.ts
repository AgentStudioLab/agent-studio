import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

export interface Thread {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ThreadRow {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  created_at: number;
  updated_at: number;
}

function rowToThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    title: r.title,
    projectId: r.project_id,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class ThreadService {
  constructor(private db: Database) {}

  create(input?: { id?: string; title?: string; projectId?: string | null }): Thread {
    const id = input?.id ?? `thr_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, project_id, pinned, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input?.title ?? "New chat", input?.projectId ?? null, now, now);
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

  list(opts: { limit?: number; pinnedOnly?: boolean } = {}): Thread[] {
    const where = opts.pinnedOnly ? "WHERE pinned = 1" : "";
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

  touch(id: string): void {
    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }
}

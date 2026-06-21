import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "./db";

interface ColInfo { name: string; type: string }

function hasColumn(db: Database, table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[];
  return rows.some((r) => r.name === col);
}
function hasTable(db: Database, table: string): boolean {
  const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  return !!r;
}

describe("db migrate — Phase 1 SDK leverage schema", () => {
  it("creates tool_audit table with required columns", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasTable(db, "tool_audit")).toBe(true);
    for (const c of ["id","ts","phase","session_id","thread_id","run_id","tool_name","tool_use_id","input_json","duration_ms","is_error","cwd"]) {
      expect(hasColumn(db, "tool_audit", c)).toBe(true);
    }
  });

  it("creates usage_ledger table with required columns", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasTable(db, "usage_ledger")).toBe(true);
    for (const c of ["id","ts","run_id","thread_id","model","input_tokens","output_tokens","cache_creation_tokens","cache_read_tokens","cost_usd"]) {
      expect(hasColumn(db, "usage_ledger", c)).toBe(true);
    }
  });

  it("adds usage columns on runs", () => {
    const db = new Database(":memory:");
    migrate(db);
    for (const c of ["input_tokens","output_tokens","cache_creation_tokens","cache_read_tokens","total_cost_usd","permission_denials","model_used"]) {
      expect(hasColumn(db, "runs", c)).toBe(true);
    }
  });

  it("migrates legacy runs CHECK constraint to allow awaiting_user while preserving rows", () => {
    const db = new Database(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE conversations (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL DEFAULT 'New chat',
        pinned        INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE TABLE runs (
        id          TEXT PRIMARY KEY,
        thread_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','error','cancelled','awaiting_approval')),
        last_seq    INTEGER NOT NULL DEFAULT 0,
        error_msg   TEXT,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER
      );
      CREATE INDEX idx_runs_thread_started ON runs (thread_id, started_at DESC);
      CREATE INDEX idx_runs_status ON runs (status);
      CREATE TABLE run_events (
        run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq         INTEGER NOT NULL,
        type        TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (run_id, seq)
      );
      INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1);
      INSERT INTO runs (id, thread_id, status, last_seq, error_msg, started_at, ended_at)
        VALUES ('r1', 't1', 'awaiting_approval', 7, 'keep me', 10, 20);
      INSERT INTO run_events (run_id, seq, type, payload, created_at)
        VALUES ('r1', 1, 'RUN_STARTED', '{}', 10);
    `);

    migrate(db);

    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r2', 't1', 'awaiting_user', 30)`);
    const preserved = db.prepare("SELECT status, last_seq, error_msg, started_at, ended_at FROM runs WHERE id='r1'").get() as {
      status: string;
      last_seq: number;
      error_msg: string | null;
      started_at: number;
      ended_at: number | null;
    };
    expect(preserved).toEqual({
      status: "awaiting_approval",
      last_seq: 7,
      error_msg: "keep me",
      started_at: 10,
      ended_at: 20,
    });
    expect(hasColumn(db, "runs", "input_tokens")).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id='r1'").get()).toEqual({ count: 1 });
  });

  it("adds allowed_tools_json column on conversations", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasColumn(db, "conversations", "allowed_tools_json")).toBe(true);
  });

  it("creates settings KV table", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasTable(db, "settings")).toBe(true);
    expect(hasColumn(db, "settings", "key")).toBe(true);
    expect(hasColumn(db, "settings", "value")).toBe(true);
  });

  it("is idempotent — calling migrate twice does not error or duplicate columns", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    const cols = db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });

  it("creates agent_workspaces table with required columns", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasTable(db, "agent_workspaces")).toBe(true);
    for (const c of ["id","name","avatar","home_dir","archived","category","cover_image","created_at","updated_at"]) {
      expect(hasColumn(db, "agent_workspaces", c)).toBe(true);
    }
  });

  it("adds agent_workspace_id column on conversations and scheduled_tasks", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasColumn(db, "conversations", "agent_workspace_id")).toBe(true);
    expect(hasColumn(db, "scheduled_tasks", "agent_workspace_id")).toBe(true);
  });

  it("creates agent_folders table with required columns", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(hasTable(db, "agent_folders")).toBe(true);
    for (const c of ["id","agent_workspace_id","path","folder_name","writable","created_at"]) {
      expect(hasColumn(db, "agent_folders", c)).toBe(true);
    }
  });

});

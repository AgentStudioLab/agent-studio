import { Database } from "bun:sqlite";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT 'New chat',
  project_id    TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  working_dir   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
-- Idempotent column add for DBs created before working_dir was introduced.
-- SQLite 3.35+ supports IF NOT EXISTS on ADD COLUMN; bun bundles a new
-- enough sqlite so this is safe.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS working_dir TEXT;
CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_pinned  ON conversations (pinned, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL DEFAULT '',
  reasoning       TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_thread_created ON messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS tool_calls (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  args        TEXT NOT NULL,
  result      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','error')),
  error_msg   TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tc_message ON tool_calls (message_id);

CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'running'
              CHECK (status IN ('running','completed','error','cancelled','awaiting_approval')),
  last_seq    INTEGER NOT NULL DEFAULT 0,
  error_msg   TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_thread_started ON runs (thread_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);

CREATE TABLE IF NOT EXISTS run_events (
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (run_id, seq)
);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA);
}

export function openDb(path: string): Database {
  const db = new Database(path);
  migrate(db);
  return db;
}

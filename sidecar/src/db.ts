import { Database } from "bun:sqlite";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  project_id    TEXT,
  mode          TEXT NOT NULL,
  status        TEXT NOT NULL,
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_pinned  ON conversations (pinned, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  blocks_json     TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  finish_reason   TEXT,
  error_text      TEXT
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages (conversation_id, created_at);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA);
}

export function openDb(path: string): Database {
  const db = new Database(path);
  migrate(db);
  return db;
}

import { Database } from "bun:sqlite";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT 'New chat',
  agent_workspace_id TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  working_dir   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
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

-- tool_audit: append-only compliance log. Intentionally NO foreign keys —
-- audit rows must survive deletion of runs / threads / conversations.
CREATE TABLE IF NOT EXISTS tool_audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,
  phase           TEXT NOT NULL CHECK (phase IN ('pre','post','denied')),
  session_id      TEXT,
  thread_id       TEXT,
  run_id          TEXT,
  tool_name       TEXT NOT NULL,
  tool_use_id     TEXT,
  input_json      TEXT,
  duration_ms     INTEGER,
  is_error        INTEGER NOT NULL DEFAULT 0,
  cwd             TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON tool_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_thread ON tool_audit (thread_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON tool_audit (tool_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_run ON tool_audit (run_id, ts DESC);

-- usage_ledger: per-run token/cost time series. Intentionally NO foreign keys —
-- ledger rows are append-only and must survive run deletion.
CREATE TABLE IF NOT EXISTS usage_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  run_id        TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  model         TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ledger_ts ON usage_ledger (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_thread ON usage_ledger (thread_id, ts DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- skill_state: per-skill enable/disable toggle persisted across restarts.
-- Default is "enabled"; a row exists ONLY when the user has touched the
-- toggle. Rows for skill_ids no longer present on disk are kept (user may
-- have temporarily removed the skill); listSkills LEFT JOINs and ignores
-- orphan rows naturally.
CREATE TABLE IF NOT EXISTS skill_state (
  skill_id   TEXT PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- scheduled_tasks: user-defined recurring/on-demand task definitions. The
-- scheduler polls next_run_at; each fire spawns a fresh conversation tagged
-- with scheduled_task_id (see ensureColumn below). next_run_at is NULL for
-- 'manual' frequency or disabled tasks — the poll loop skips those.
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  prompt             TEXT NOT NULL,
  agent_workspace_id TEXT,
  working_dir        TEXT,
  model              TEXT,
  permission_mode    TEXT NOT NULL DEFAULT 'ask',
  frequency          TEXT NOT NULL
                     CHECK (frequency IN ('manual','hourly','daily','weekdays','weekly')),
  time_of_day        TEXT,
  weekday            INTEGER,
  enabled            INTEGER NOT NULL DEFAULT 1,
  allowed_tools_json TEXT,
  next_run_at        INTEGER,
  last_run_at        INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_next ON scheduled_tasks (enabled, next_run_at);

-- agent_workspaces: a persistent "Agent" — its own home dir (read/write),
-- plus (P2/P3) external folders, a CLAUDE.md instructions file, and memory.
-- Conversations + scheduled_tasks reference it via agent_workspace_id (nullable
-- = the generic/default workspace, i.e. the "new task" behavior).
CREATE TABLE IF NOT EXISTS agent_workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT,
  home_dir    TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- agent_folders (P2): external folders mounted into an agent as extra context.
-- Default read-only (writable=0); each can be granted write. Unlike
-- conversations/scheduled_tasks (which reference an agent via a plain nullable
-- column so they survive its deletion via archive/unbind), folders are OWNED by
-- the agent — a real FK with ON DELETE CASCADE drops them when the agent is
-- deleted. The external paths on disk are never touched.
CREATE TABLE IF NOT EXISTS agent_folders (
  id                 TEXT PRIMARY KEY,
  agent_workspace_id TEXT NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  path               TEXT NOT NULL,
  folder_name        TEXT NOT NULL,
  writable           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_folders_agent ON agent_folders (agent_workspace_id);

-- agent_memories (P3): linear memory entries for an agent. Written either by
-- the agent itself (source='agent', via the remember MCP tool) or by the user
-- (source='user', via the MemoryCard). The block column splits memory into
-- 'profile' (about the user) and 'facts' (about the project/work) — each
-- injected as its own budgeted section in systemPrompt.append on each
-- agent-bound run. Owned by the agent → FK ON DELETE CASCADE.
CREATE TABLE IF NOT EXISTS agent_memories (
  id                 TEXT PRIMARY KEY,
  agent_workspace_id TEXT NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  content            TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('agent','user')),
  block              TEXT NOT NULL DEFAULT 'facts' CHECK (block IN ('profile','facts')),
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories (agent_workspace_id);
`;

interface ColumnInfo {
  name: string;
}

/**
 * Idempotent column adds for DBs created before a column was introduced.
 * SQLite 3.35+ has `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, but Bun's
 * bundled SQLite (especially in --compile builds) can lag behind. Probing
 * via PRAGMA table_info works across all versions.
 */
function ensureColumn(
  db: Database,
  table: string,
  column: string,
  type: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  if (rows.some((r) => r.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function migrate(db: Database): void {
  db.exec(SCHEMA);
  ensureColumn(db, "conversations", "working_dir", "TEXT");
  ensureColumn(db, "conversations", "allowed_tools_json", "TEXT");
  ensureColumn(db, "conversations", "archived", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "conversations", "scheduled_task_id", "TEXT");
  ensureColumn(db, "conversations", "model", "TEXT");
  ensureColumn(db, "conversations", "permission_mode", "TEXT");
  ensureColumn(db, "messages", "sdk_uuid", "TEXT");
  ensureColumn(db, "tool_calls", "side_effects", "TEXT");
  ensureColumn(db, "runs", "input_tokens", "INTEGER");
  ensureColumn(db, "runs", "output_tokens", "INTEGER");
  ensureColumn(db, "runs", "cache_creation_tokens", "INTEGER");
  ensureColumn(db, "runs", "cache_read_tokens", "INTEGER");
  ensureColumn(db, "runs", "total_cost_usd", "REAL");
  ensureColumn(db, "runs", "permission_denials", "TEXT");
  ensureColumn(db, "runs", "model_used", "TEXT");
  ensureColumn(db, "scheduled_tasks", "working_dir", "TEXT");
  ensureColumn(db, "scheduled_tasks", "permission_mode", "TEXT NOT NULL DEFAULT 'ask'");
  ensureColumn(db, "scheduled_tasks", "weekday", "INTEGER");
  ensureColumn(db, "conversations", "agent_workspace_id", "TEXT");
  ensureColumn(db, "scheduled_tasks", "agent_workspace_id", "TEXT");
  ensureColumn(db, "agent_memories", "block", "TEXT NOT NULL DEFAULT 'facts'");
}

export function openDb(path: string): Database {
  const db = new Database(path);
  migrate(db);
  return db;
}

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
              CHECK (status IN ('running','completed','error','cancelled','awaiting_user','awaiting_approval')),
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
-- plus (P2/P3) external folders, a CLAUDE.md instructions file, and file-based
-- memory (<home>/memory/, managed by AgentMemoryStore — not a DB table).
-- Conversations + scheduled_tasks reference it via agent_workspace_id (nullable
-- = the generic/default workspace, i.e. the "new task" behavior).
-- source='builtin' 行由 reconcileBuiltinAgents 从仓库内 JSON 维护：定义字段
-- （name/avatar/mounted_skills_json + CLAUDE.md）每次启动覆盖、对外只读；用户自有
-- 数据（memory/对话/folders/links/pinned）从不被 reconcile 触碰。详见
-- docs/superpowers/specs/2026-06-18-builtin-agents-design.md。
CREATE TABLE IF NOT EXISTS agent_workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT,
  home_dir    TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  pinned      INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'user',
  category    TEXT NOT NULL DEFAULT 'general',
  cover_image TEXT NOT NULL DEFAULT 'general',
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

-- agent_links (P3): URLs mounted into an agent as on-demand reference context.
-- Stored only — injected into systemPrompt.append as a one-line list; the agent
-- fetches them with WebFetch when relevant (no fetch-on-add, no RAG). OWNED by
-- the agent (FK ON DELETE CASCADE), same as agent_folders.
CREATE TABLE IF NOT EXISTS agent_links (
  id                 TEXT PRIMARY KEY,
  agent_workspace_id TEXT NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  url                TEXT NOT NULL,
  title              TEXT NOT NULL,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_links_agent ON agent_links (agent_workspace_id);

CREATE TABLE IF NOT EXISTS channel_connections (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  name              TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  credentials_json  TEXT,
  config_json       TEXT NOT NULL,
  last_connected_at INTEGER,
  error_msg         TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_connections_type ON channel_connections (type);
CREATE INDEX IF NOT EXISTS idx_channel_connections_enabled ON channel_connections (enabled);

CREATE TABLE IF NOT EXISTS channel_sessions (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  chat_id         TEXT NOT NULL,
  sender_id       TEXT NOT NULL,
  display_name    TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  active_task_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_sessions_identity
  ON channel_sessions (connection_id, chat_id, sender_id);

CREATE TABLE IF NOT EXISTS remote_tasks (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES channel_sessions(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id            TEXT,
  channel_type      TEXT NOT NULL,
  chat_id           TEXT NOT NULL,
  sender_id         TEXT NOT NULL,
  context_token     TEXT,
  status            TEXT NOT NULL,
  reply_state       TEXT NOT NULL DEFAULT 'pending',
  instruction_text  TEXT,
  input_dir         TEXT NOT NULL,
  output_dir        TEXT NOT NULL,
  result_summary    TEXT,
  result_files_json TEXT,
  error_msg         TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_session ON remote_tasks (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_run ON remote_tasks (run_id);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_status ON remote_tasks (status);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_reply_state ON remote_tasks (reply_state);

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
  ensureColumn(db, "agent_workspaces", "pinned", "INTEGER NOT NULL DEFAULT 0");
  // 每个 agent 的技能挂载选择（三态）：NULL=继承全部启用技能；'[]'=显式不挂；
  // '["id1","id2"]'=显式子集。运行时与全局启用集取交集。详见
  // docs/superpowers/specs/2026-06-16-per-agent-skill-mounting-design.md。
  ensureColumn(db, "agent_workspaces", "mounted_skills_json", "TEXT");
  // 内置(只读官方预置)标记：'user'=用户创建；'builtin'=reconcileBuiltinAgents 维护。
  ensureColumn(db, "agent_workspaces", "source", "TEXT NOT NULL DEFAULT 'user'");
  // 功能分类与封面图标识：前端按 category 生成 tab，cover_image 映射到本地封面资产。
  ensureColumn(db, "agent_workspaces", "category", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn(db, "agent_workspaces", "cover_image", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn(db, "channel_connections", "type", "TEXT NOT NULL DEFAULT 'fake'");
  ensureColumn(db, "channel_connections", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "channel_connections", "enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "channel_connections", "status", "TEXT NOT NULL DEFAULT 'stopped'");
  ensureColumn(db, "channel_connections", "credentials_json", "TEXT");
  ensureColumn(db, "channel_connections", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "channel_connections", "last_connected_at", "INTEGER");
  ensureColumn(db, "channel_connections", "error_msg", "TEXT");
  ensureColumn(db, "channel_connections", "created_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "channel_connections", "updated_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "channel_sessions", "connection_id", "TEXT");
  ensureColumn(db, "channel_sessions", "channel_type", "TEXT NOT NULL DEFAULT 'fake'");
  ensureColumn(db, "channel_sessions", "chat_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "channel_sessions", "sender_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "channel_sessions", "display_name", "TEXT");
  ensureColumn(db, "channel_sessions", "conversation_id", "TEXT");
  ensureColumn(db, "channel_sessions", "active_task_id", "TEXT");
  ensureColumn(db, "channel_sessions", "created_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "channel_sessions", "updated_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "remote_tasks", "session_id", "TEXT");
  ensureColumn(db, "remote_tasks", "connection_id", "TEXT");
  ensureColumn(db, "remote_tasks", "conversation_id", "TEXT");
  ensureColumn(db, "remote_tasks", "run_id", "TEXT");
  ensureColumn(db, "remote_tasks", "channel_type", "TEXT NOT NULL DEFAULT 'fake'");
  ensureColumn(db, "remote_tasks", "chat_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "remote_tasks", "sender_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "remote_tasks", "context_token", "TEXT");
  ensureColumn(db, "remote_tasks", "status", "TEXT NOT NULL DEFAULT 'failed'");
  ensureColumn(db, "remote_tasks", "reply_state", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "remote_tasks", "instruction_text", "TEXT");
  ensureColumn(db, "remote_tasks", "input_dir", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "remote_tasks", "output_dir", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "remote_tasks", "result_summary", "TEXT");
  ensureColumn(db, "remote_tasks", "result_files_json", "TEXT");
  ensureColumn(db, "remote_tasks", "error_msg", "TEXT");
  ensureColumn(db, "remote_tasks", "created_at", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "remote_tasks", "updated_at", "INTEGER NOT NULL DEFAULT 0");
}

export function openDb(path: string): Database {
  const db = new Database(path);
  migrate(db);
  return db;
}

# Backend Integration · Chat Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NewTask 提交 → sidecar Agent SDK turn → SSE → TaskView 流式渲染 + DB 持久化 + Sidebar 真实会话列表，端到端打通。

**Architecture:** Bun + Hono sidecar 走 stateless-per-turn Agent SDK 调用，bun:sqlite 存会话与消息；Tauri Rust 端启动时从 plugin-store 读 API key 经 env 注入子进程；React 端新增 `src/lib/data/*` 数据访问层，复用现有 `fetchSidecar` / `subscribeSSE`。

**Tech Stack:** Bun · Hono · bun:sqlite · `@anthropic-ai/agent-sdk` (待对齐) · Tauri v2 · React 19 · `@tauri-apps/plugin-store`.

**Spec:** `docs/superpowers/specs/2026-05-18-backend-integration-chat-vertical-design.md`

---

## Task 0: 风险预校验 — bun:sqlite 在 `bun build --compile` 产物里能用

**理由（spec §10 风险 2）**：bun:sqlite 走 native binding；compile-to-binary 模式下原生模块可能丢失。提前 15 分钟验证，避免片 1 写完 services 后才发现要换 better-sqlite3。

**Files:**
- Create: `sidecar/scripts/smoke-sqlite.ts`

- [ ] **Step 1: 写 smoke 脚本**

文件 `sidecar/scripts/smoke-sqlite.ts`：

```ts
import { Database } from "bun:sqlite";

const db = new Database(":memory:");
db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
db.prepare("INSERT INTO t (name) VALUES (?)").run("hello");
const row = db.prepare("SELECT name FROM t WHERE id = 1").get() as { name: string };
if (row.name !== "hello") {
  console.error(`FAIL: got ${JSON.stringify(row)}`);
  process.exit(1);
}
console.log("OK bun:sqlite works");
```

- [ ] **Step 2: 直接运行验证基础可用**

Run: `cd sidecar && bun run scripts/smoke-sqlite.ts`
Expected: `OK bun:sqlite works`

- [ ] **Step 3: 编译为单文件验证 compile 模式**

Run: `cd sidecar && bun build scripts/smoke-sqlite.ts --compile --outfile /tmp/smoke-sqlite-bin && /tmp/smoke-sqlite-bin`
Expected: `OK bun:sqlite works`

**若 Step 3 失败：** 停下，spec 风险 2 备选 A 启动 — 改用 `better-sqlite3` + node-gyp（plan 需要追加任务编排跨平台编译）。当前 plan 假设 Step 3 通过。

- [ ] **Step 4: 删 smoke 脚本，commit 一份"已验证"记录**

```bash
rm sidecar/scripts/smoke-sqlite.ts
rmdir sidecar/scripts 2>/dev/null || true
```

无文件留下；这一步只用 commit message 记录验证结果：

```bash
git commit --allow-empty -m "chore(sidecar): verify bun:sqlite usable in bun build --compile mode"
```

---

## Task 1: ulid 生成器

**Files:**
- Create: `sidecar/src/lib/ulid.ts`
- Test: `sidecar/tests/lib/ulid.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/lib/ulid.test.ts`：

```ts
import { describe, it, expect } from "bun:test";
import { ulid } from "../../src/lib/ulid";

describe("ulid", () => {
  it("returns 26-char string", () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("generates unique ids in tight loop", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(ulid());
    expect(set.size).toBe(1000);
  });

  it("is monotonically increasing across consecutive calls", () => {
    const a = ulid();
    const b = ulid();
    const c = ulid();
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test tests/lib/ulid.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/ulid'`

- [ ] **Step 3: 实现 ulid**

文件 `sidecar/src/lib/ulid.ts`：

```ts
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  let out = "";
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function incRandom(rand: number[]): number[] {
  const next = [...rand];
  for (let i = RANDOM_LEN - 1; i >= 0; i--) {
    if (next[i]! < 31) {
      next[i] = next[i]! + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
}

function newRandom(): number[] {
  const out = new Array<number>(RANDOM_LEN);
  for (let i = 0; i < RANDOM_LEN; i++) out[i] = Math.floor(Math.random() * 32);
  return out;
}

function encodeRandom(rand: number[]): string {
  let out = "";
  for (const v of rand) out += ENCODING[v];
  return out;
}

export function ulid(): string {
  const now = Date.now();
  if (now === lastTime) {
    lastRandom = incRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = newRandom();
  }
  return encodeTime(now) + encodeRandom(lastRandom);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test tests/lib/ulid.test.ts`
Expected: 3 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/lib/ulid.ts sidecar/tests/lib/ulid.test.ts
git commit -m "feat(sidecar): ulid generator + tests"
```

---

## Task 2: SSE 帧序列化器

**Files:**
- Create: `sidecar/src/lib/sse.ts`
- Test: `sidecar/tests/lib/sse.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/lib/sse.test.ts`：

```ts
import { describe, it, expect } from "bun:test";
import { encodeSseFrame } from "../../src/lib/sse";

describe("encodeSseFrame", () => {
  it("encodes event + data on simple payload", () => {
    const frame = encodeSseFrame("text-delta", { messageId: "m1", text: "hi" });
    expect(frame).toBe(`event: text-delta\ndata: {"messageId":"m1","text":"hi"}\n\n`);
  });

  it("escapes newlines inside data (SSE spec splits on \\n)", () => {
    const frame = encodeSseFrame("text-delta", { text: "line1\nline2" });
    // JSON.stringify 已经把 \n 转义为 \\n，所以序列化后的 data 行不含真实换行
    expect(frame).not.toContain("line1\nline2");
    expect(frame).toContain("line1\\nline2");
  });

  it("appends terminator \\n\\n exactly once", () => {
    const frame = encodeSseFrame("message-stop", { messageId: "m1", finishReason: "end_turn" });
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(frame.endsWith("\n\n\n")).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test tests/lib/sse.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

文件 `sidecar/src/lib/sse.ts`：

```ts
export type SseEvent =
  | { event: "message-start"; data: { messageId: string; role: "assistant" } }
  | { event: "text-delta"; data: { messageId: string; blockIndex: number; text: string } }
  | { event: "message-stop"; data: { messageId: string; finishReason: "end_turn" } }
  | { event: "error"; data: { code: string; message: string } }
  | { event: "aborted"; data: { messageId: string } };

export function encodeSseFrame<T>(event: string, data: T): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test tests/lib/sse.test.ts`
Expected: 3 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/lib/sse.ts sidecar/tests/lib/sse.test.ts
git commit -m "feat(sidecar): SSE frame encoder + event type union"
```

---

## Task 3: types.ts — 共享数据类型

**Files:**
- Create: `sidecar/src/types.ts`

无测试（纯类型）。

- [ ] **Step 1: 写类型文件**

文件 `sidecar/src/types.ts`：

```ts
export type ContentBlock = { type: "text"; text: string };

export type ConversationMode = "ask" | "agent";
export type ConversationStatus = "active" | "done" | "failed" | "aborted";
export type FinishReason = "end_turn" | "aborted" | "error" | null;
export type MessageRole = "user" | "assistant";

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  blocks: ContentBlock[];
  createdAt: number;
  finishReason: FinishReason;
  errorText: string | null;
}

export interface CreateConversationInput {
  prompt: string;
  projectId?: string | null;
  mode: ConversationMode;
}
```

- [ ] **Step 2: 验证类型编译**

Run: `cd sidecar && bunx tsc --noEmit -p .`
Expected: 0 errors（如果 `tsconfig.json` 还没有则跳过这步——Task 8 server.ts wiring 时会建立）

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/types.ts
git commit -m "feat(sidecar): shared TS types (Conversation / Message / ContentBlock)"
```

---

## Task 4: db.ts — bun:sqlite 单例 + migrations

**Files:**
- Create: `sidecar/src/db.ts`
- Test: `sidecar/tests/db.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/db.test.ts`：

```ts
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../src/db";

describe("migrate", () => {
  it("creates conversations and messages tables", () => {
    const db = new Database(":memory:");
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("conversations");
    expect(names).toContain("messages");
  });

  it("creates expected indexes", () => {
    const db = new Database(":memory:");
    migrate(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toEqual(["idx_conv_pinned", "idx_conv_updated", "idx_msg_conv"]);
  });

  it("sets WAL journal mode", () => {
    const db = new Database(":memory:");
    migrate(db);
    const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    // :memory: 不支持 WAL，会 fallback 到 memory；用文件 DB 才走 wal。
    // 仅断言 migrate 不报错，不验值（值依赖底层存储）。
    expect(row.journal_mode).toBeDefined();
  });

  it("is idempotent (running twice does not throw)", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test tests/db.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

文件 `sidecar/src/db.ts`：

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test tests/db.test.ts`
Expected: 4 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/db.ts sidecar/tests/db.test.ts
git commit -m "feat(sidecar): SQLite schema + migrate()"
```

---

## Task 5: services/conversations.ts — createConversation + listConversations

**Files:**
- Create: `sidecar/src/services/conversations.ts`
- Test: `sidecar/tests/services/conversations.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/services/conversations.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import {
  createConversation,
  listConversations,
} from "../../src/services/conversations";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

describe("createConversation", () => {
  it("inserts row + first user message; returns conversation with id", () => {
    const conv = createConversation(db, {
      prompt: "hello there",
      projectId: null,
      mode: "ask",
    });
    expect(conv.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(conv.title).toBe("hello there");
    expect(conv.mode).toBe("ask");
    expect(conv.status).toBe("active");
    expect(conv.pinned).toBe(false);

    const msgs = db
      .prepare("SELECT * FROM messages WHERE conversation_id = ?")
      .all(conv.id) as { role: string; blocks_json: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("user");
    expect(JSON.parse(msgs[0]!.blocks_json)).toEqual([{ type: "text", text: "hello there" }]);
  });

  it("title truncates prompt to 60 chars", () => {
    const long = "x".repeat(120);
    const conv = createConversation(db, { prompt: long, mode: "agent" });
    expect(conv.title).toHaveLength(60);
  });
});

describe("listConversations", () => {
  it("returns conversations ordered by updated_at DESC", async () => {
    const a = createConversation(db, { prompt: "first", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    const b = createConversation(db, { prompt: "second", mode: "ask" });
    const rows = listConversations(db, { limit: 10 });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("filters pinned only when requested", () => {
    const a = createConversation(db, { prompt: "a", mode: "ask" });
    createConversation(db, { prompt: "b", mode: "ask" });
    db.prepare("UPDATE conversations SET pinned = 1 WHERE id = ?").run(a.id);
    const rows = listConversations(db, { limit: 10, pinnedOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(a.id);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

文件 `sidecar/src/services/conversations.ts`：

```ts
import type { Database } from "bun:sqlite";
import { ulid } from "../lib/ulid";
import type {
  Conversation,
  ConversationMode,
  CreateConversationInput,
} from "../types";

interface ConversationRow {
  id: string;
  title: string;
  project_id: string | null;
  mode: ConversationMode;
  status: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    title: r.title,
    projectId: r.project_id,
    mode: r.mode,
    status: r.status as Conversation["status"],
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createConversation(
  db: Database,
  input: CreateConversationInput,
): Conversation {
  const id = ulid();
  const now = Date.now();
  const title = input.prompt.slice(0, 60);
  const msgId = ulid();
  const blocks = JSON.stringify([{ type: "text", text: input.prompt }]);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO conversations (id, title, project_id, mode, status, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
    ).run(id, title, input.projectId ?? null, input.mode, now, now);

    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
       VALUES (?, ?, 'user', ?, ?, 'end_turn', NULL)`,
    ).run(msgId, id, blocks, now);
  })();

  return {
    id,
    title,
    projectId: input.projectId ?? null,
    mode: input.mode,
    status: "active",
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function listConversations(
  db: Database,
  opts: { limit: number; pinnedOnly?: boolean },
): Conversation[] {
  const where = opts.pinnedOnly ? "WHERE pinned = 1" : "";
  const rows = db
    .prepare(
      `SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(opts.limit) as ConversationRow[];
  return rows.map(rowToConversation);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: 4 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/conversations.ts sidecar/tests/services/conversations.test.ts
git commit -m "feat(sidecar): conversations service — create + list"
```

---

## Task 6: services/conversations.ts — getById, getMessages, updatePin, updateTitle, deleteConversation

**Files:**
- Modify: `sidecar/src/services/conversations.ts`
- Modify: `sidecar/tests/services/conversations.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `sidecar/tests/services/conversations.test.ts` 末尾追加：

```ts
import {
  getConversation,
  getMessages,
  updatePin,
  updateTitle,
  deleteConversation,
} from "../../src/services/conversations";

describe("getConversation", () => {
  it("returns conversation by id", () => {
    const a = createConversation(db, { prompt: "x", mode: "ask" });
    const got = getConversation(db, a.id);
    expect(got?.id).toBe(a.id);
  });

  it("returns null when missing", () => {
    expect(getConversation(db, "01HZZZZZZZZZZZZZZZZZZZZZZZ")).toBeNull();
  });
});

describe("getMessages", () => {
  it("returns messages ordered by created_at ASC", async () => {
    const c = createConversation(db, { prompt: "p1", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
       VALUES ('msg-asst-1', ?, 'assistant', '[{"type":"text","text":"hi"}]', ?, 'end_turn', NULL)`,
    ).run(c.id, Date.now());
    const msgs = getMessages(db, c.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]!.blocks).toEqual([{ type: "text", text: "hi" }]);
  });
});

describe("updatePin", () => {
  it("toggles pinned + bumps updated_at", async () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    await new Promise((r) => setTimeout(r, 5));
    updatePin(db, c.id, true);
    const got = getConversation(db, c.id)!;
    expect(got.pinned).toBe(true);
    expect(got.updatedAt).toBeGreaterThan(c.updatedAt);
  });
});

describe("updateTitle", () => {
  it("updates title", () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    updateTitle(db, c.id, "renamed");
    expect(getConversation(db, c.id)!.title).toBe("renamed");
  });
});

describe("deleteConversation", () => {
  it("cascade deletes messages", () => {
    const c = createConversation(db, { prompt: "x", mode: "ask" });
    deleteConversation(db, c.id);
    expect(getConversation(db, c.id)).toBeNull();
    const msgs = db.prepare("SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?").get(c.id) as { n: number };
    expect(msgs.n).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: 多个 FAIL — `getConversation is not a function` 等

- [ ] **Step 3: 在 `sidecar/src/services/conversations.ts` 末尾追加**

```ts
interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  blocks_json: string;
  created_at: number;
  finish_reason: string | null;
  error_text: string | null;
}

export function getConversation(db: Database, id: string): Conversation | null {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | ConversationRow
    | undefined;
  return row ? rowToConversation(row) : null;
}

export function getMessages(db: Database, conversationId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    blocks: JSON.parse(r.blocks_json),
    createdAt: r.created_at,
    finishReason: r.finish_reason as Message["finishReason"],
    errorText: r.error_text,
  }));
}

export function updatePin(db: Database, id: string, pinned: boolean): void {
  db.prepare("UPDATE conversations SET pinned = ?, updated_at = ? WHERE id = ?").run(
    pinned ? 1 : 0,
    Date.now(),
    id,
  );
}

export function updateTitle(db: Database, id: string, title: string): void {
  db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function deleteConversation(db: Database, id: string): void {
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}
```

同时在文件顶部 import 加 `Message`：

```ts
import type {
  Conversation,
  ConversationMode,
  CreateConversationInput,
  Message,
} from "../types";
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: 9 pass total

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/conversations.ts sidecar/tests/services/conversations.test.ts
git commit -m "feat(sidecar): conversations service — get/messages/pin/title/delete"
```

---

## Task 7: services/conversations.ts — insertAssistantMessage (流尾持久化)

**Files:**
- Modify: `sidecar/src/services/conversations.ts`
- Modify: `sidecar/tests/services/conversations.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
import { insertAssistantMessage } from "../../src/services/conversations";

describe("insertAssistantMessage", () => {
  it("writes assistant row with given blocks + finish reason", () => {
    const c = createConversation(db, { prompt: "p", mode: "ask" });
    const msgId = insertAssistantMessage(db, c.id, {
      blocks: [{ type: "text", text: "answer" }],
      finishReason: "end_turn",
      errorText: null,
    });
    const msgs = getMessages(db, c.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.id).toBe(msgId);
    expect(msgs[1]!.finishReason).toBe("end_turn");
    expect(msgs[1]!.blocks).toEqual([{ type: "text", text: "answer" }]);
  });

  it("returned id is monotonically newer than user message", () => {
    const c = createConversation(db, { prompt: "p", mode: "ask" });
    const userMsg = getMessages(db, c.id)[0]!;
    const asstId = insertAssistantMessage(db, c.id, {
      blocks: [{ type: "text", text: "a" }],
      finishReason: "end_turn",
      errorText: null,
    });
    expect(asstId > userMsg.id).toBe(true);
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: FAIL — `insertAssistantMessage is not a function`

- [ ] **Step 3: 实现（在 conversations.ts 末尾追加）**

```ts
import type { ContentBlock, FinishReason } from "../types";

export interface AssistantMessagePayload {
  blocks: ContentBlock[];
  finishReason: Exclude<FinishReason, null>;
  errorText: string | null;
}

export function insertAssistantMessage(
  db: Database,
  conversationId: string,
  payload: AssistantMessagePayload,
): string {
  const id = ulid();
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
    ).run(
      id,
      conversationId,
      JSON.stringify(payload.blocks),
      now,
      payload.finishReason,
      payload.errorText,
    );
    db.prepare("UPDATE conversations SET updated_at = ?, status = ? WHERE id = ?").run(
      now,
      payload.finishReason === "end_turn" ? "done" : payload.finishReason,
      conversationId,
    );
  })();
  return id;
}
```

注意：顶部已经 import `ContentBlock` / `FinishReason` 在 Task 6 加过 `Message` 一并加上（如果只有 `Message` 没有 `ContentBlock`/`FinishReason`，补全 import）。最终 import 行：

```ts
import type {
  Conversation,
  ConversationMode,
  ContentBlock,
  CreateConversationInput,
  FinishReason,
  Message,
} from "../types";
```

- [ ] **Step 4: 跑确认通过**

Run: `cd sidecar && bun test tests/services/conversations.test.ts`
Expected: 11 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/conversations.ts sidecar/tests/services/conversations.test.ts
git commit -m "feat(sidecar): insertAssistantMessage — closes conversation after stream"
```

---

## Task 8: services/apiKey.ts — 内存 key state

**Files:**
- Create: `sidecar/src/services/apiKey.ts`
- Test: `sidecar/tests/services/apiKey.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/services/apiKey.test.ts`：

```ts
import { describe, it, expect } from "bun:test";
import { createApiKeyState } from "../../src/services/apiKey";

describe("createApiKeyState", () => {
  it("returns initial value", () => {
    const s = createApiKeyState("sk-init");
    expect(s.get()).toBe("sk-init");
  });

  it("initial null when ctor arg undefined", () => {
    const s = createApiKeyState(undefined);
    expect(s.get()).toBeNull();
  });

  it("set replaces value", () => {
    const s = createApiKeyState(null);
    s.set("sk-new");
    expect(s.get()).toBe("sk-new");
  });

  it("set null clears", () => {
    const s = createApiKeyState("sk-x");
    s.set(null);
    expect(s.get()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `cd sidecar && bun test tests/services/apiKey.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

文件 `sidecar/src/services/apiKey.ts`：

```ts
export interface ApiKeyState {
  get(): string | null;
  set(value: string | null): void;
}

export function createApiKeyState(initial: string | undefined | null): ApiKeyState {
  let current: string | null = initial ?? null;
  return {
    get: () => current,
    set: (value) => {
      current = value;
    },
  };
}
```

- [ ] **Step 4: 跑确认通过**

Run: `cd sidecar && bun test tests/services/apiKey.test.ts`
Expected: 4 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/apiKey.ts sidecar/tests/services/apiKey.test.ts
git commit -m "feat(sidecar): in-memory API key state"
```

---

## Task 9: services/agent.mock.ts — fake Agent SDK iterator

**Files:**
- Create: `sidecar/src/services/agent.mock.ts`

无独立测试；行为由 Task 10 (agent.ts) 的事件翻译测试间接覆盖。

- [ ] **Step 1: 写文件**

文件 `sidecar/src/services/agent.mock.ts`：

```ts
/**
 * 假的 Agent SDK 实现。AGENT_SDK_MOCK=1 时由 agent.ts 切换到这条路径。
 * 行为：把 prompt 拆成单词，逐 chunk 流出 text_delta，最后 message_stop。
 * 关心的是事件流形状，不关心内容真实性。
 */

import type { Message } from "../types";

export interface MockEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_stop";
  delta?: { type: "text_delta"; text: string };
}

export async function* mockQuery(opts: {
  messages: Message[];
  signal?: AbortSignal;
}): AsyncIterable<MockEvent> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const echo = lastUser?.blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join(" ") ?? "";
  const chunks = echo.split(/(\s+)/).filter((c) => c.length > 0);

  yield { type: "message_start" };
  yield { type: "content_block_start" };
  for (const chunk of chunks) {
    if (opts.signal?.aborted) return;
    yield { type: "content_block_delta", delta: { type: "text_delta", text: chunk } };
    await new Promise((r) => setTimeout(r, 10));
  }
  yield { type: "content_block_stop" };
  yield { type: "message_stop" };
}
```

- [ ] **Step 2: 验证 TS 编译（如果有 tsconfig；否则跳过）**

Run: `cd sidecar && bunx tsc --noEmit -p . 2>/dev/null || echo "no tsconfig yet"`
Expected: 0 errors 或 `no tsconfig yet`

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/services/agent.mock.ts
git commit -m "feat(sidecar): mock Agent SDK async iterator for tests"
```

---

## Task 10: services/agent.ts — 事件翻译 (Agent SDK event → SseEvent)

**Files:**
- Create: `sidecar/src/services/agent.ts`
- Test: `sidecar/tests/services/agent.test.ts`

- [ ] **Step 1: 写失败测试**

文件 `sidecar/tests/services/agent.test.ts`：

```ts
import { describe, it, expect } from "bun:test";
import { translateEvents, type RawAgentEvent } from "../../src/services/agent";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe("translateEvents", () => {
  it("translates message_start / text_delta×3 / message_stop into SSE events", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      yield { type: "content_block_start" };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: " " } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "world" } };
      yield { type: "content_block_stop" };
      yield { type: "message_stop" };
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-1" }));

    expect(events.map((e) => e.event)).toEqual([
      "message-start",
      "text-delta",
      "text-delta",
      "text-delta",
      "message-stop",
    ]);
    expect(events[0]!.data).toEqual({ messageId: "msg-1", role: "assistant" });
    expect(events[1]!.data).toEqual({ messageId: "msg-1", blockIndex: 0, text: "hello" });
    expect(events[4]!.data).toEqual({ messageId: "msg-1", finishReason: "end_turn" });
  });

  it("emits aborted when source throws AbortError", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      yield { type: "content_block_start" };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } };
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-2" }));
    expect(events.at(-1)!.event).toBe("aborted");
    expect(events.at(-1)!.data).toEqual({ messageId: "msg-2" });
  });

  it("emits error on non-abort throw", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      throw new Error("boom");
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-3" }));
    expect(events.at(-1)!.event).toBe("error");
    expect((events.at(-1)!.data as { message: string }).message).toBe("boom");
  });
});
```

- [ ] **Step 2: 跑确认失败**

Run: `cd sidecar && bun test tests/services/agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 agent.ts**

文件 `sidecar/src/services/agent.ts`：

```ts
import type { ContentBlock, Message } from "../types";
import type { SseEvent } from "../lib/sse";
import { mockQuery } from "./agent.mock";

/**
 * Agent SDK 原生事件形状（简化版，匹配 mock 与真 SDK 的并集）。
 * 真接入时（Task 17）若 SDK 字段名不同，在 query() 适配层做映射。
 */
export type RawAgentEvent =
  | { type: "message_start" }
  | { type: "content_block_start" }
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_stop" }
  | { type: "message_stop" };

export interface QueryOptions {
  messages: Message[];
  apiKey: string;
  signal?: AbortSignal;
}

/** 翻译原生事件流为我们的 SSE 事件词表。 */
export async function* translateEvents(
  raw: AsyncIterable<RawAgentEvent>,
  ctx: { messageId: string },
): AsyncIterable<SseEvent> {
  try {
    for await (const ev of raw) {
      if (ev.type === "message_start") {
        yield { event: "message-start", data: { messageId: ctx.messageId, role: "assistant" } };
      } else if (ev.type === "content_block_delta") {
        yield {
          event: "text-delta",
          data: { messageId: ctx.messageId, blockIndex: 0, text: ev.delta.text },
        };
      } else if (ev.type === "message_stop") {
        yield { event: "message-stop", data: { messageId: ctx.messageId, finishReason: "end_turn" } };
      }
      // content_block_start / content_block_stop 在 v1 文本-only 下不需要前端感知
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      yield { event: "aborted", data: { messageId: ctx.messageId } };
      return;
    }
    yield {
      event: "error",
      data: { code: "agent_error", message: e instanceof Error ? e.message : String(e) },
    };
  }
}

/** 聚合 SSE 事件流的 text-delta 为完整 ContentBlock[]，供入库使用。 */
export function aggregateBlocks(events: SseEvent[]): ContentBlock[] {
  let text = "";
  for (const e of events) {
    if (e.event === "text-delta") {
      text += (e.data as { text: string }).text;
    }
  }
  return text.length > 0 ? [{ type: "text", text }] : [];
}

/** 入口：返回原始事件流。AGENT_SDK_MOCK=1 走 mock；否则走真 SDK（Task 17 实现）。 */
export async function* query(opts: QueryOptions): AsyncIterable<RawAgentEvent> {
  if (process.env.AGENT_SDK_MOCK === "1") {
    yield* mockQuery({ messages: opts.messages, signal: opts.signal });
    return;
  }
  throw new Error("real Agent SDK not yet wired (Task 17)");
}
```

- [ ] **Step 4: 跑确认通过**

Run: `cd sidecar && bun test tests/services/agent.test.ts`
Expected: 3 pass

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/agent.ts sidecar/tests/services/agent.test.ts
git commit -m "feat(sidecar): agent service — translateEvents + aggregateBlocks + mock switch"
```

---

## Task 11: routes/health.ts + routes/conversations.ts

**Files:**
- Create: `sidecar/src/routes/health.ts`
- Create: `sidecar/src/routes/conversations.ts`

通过 Task 12 server.ts 接进 Hono app 后做集成测试。

- [ ] **Step 1: 实现 routes/health.ts**

文件 `sidecar/src/routes/health.ts`：

```ts
import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => c.json({ ok: true, pid: process.pid }));
```

- [ ] **Step 2: 实现 routes/conversations.ts**

文件 `sidecar/src/routes/conversations.ts`：

```ts
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  updatePin,
  updateTitle,
} from "../services/conversations";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function validateId(id: string): boolean {
  return ULID_RE.test(id);
}

export function buildConversationRoutes(db: Database): Hono {
  const app = new Hono();

  app.post("/conversations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      prompt?: string;
      projectId?: string | null;
      mode?: "ask" | "agent";
    } | null;
    if (!body?.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt_required" }, 400);
    }
    const mode = body.mode === "agent" ? "agent" : "ask";
    const conv = createConversation(db, {
      prompt: body.prompt,
      projectId: body.projectId ?? null,
      mode,
    });
    return c.json(conv, 201);
  });

  app.get("/conversations", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "20"), 1), 100);
    const pinnedOnly = c.req.query("pinned") === "true";
    const rows = listConversations(db, { limit, pinnedOnly });
    return c.json(rows);
  });

  app.get("/conversations/:id", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const conv = getConversation(db, id);
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(conv);
  });

  app.patch("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    if (!getConversation(db, id)) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as {
      title?: string;
      pinned?: boolean;
    } | null;
    if (body?.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length === 0) {
        return c.json({ error: "invalid_title" }, 400);
      }
      updateTitle(db, id, body.title);
    }
    if (body?.pinned !== undefined) {
      updatePin(db, id, body.pinned);
    }
    return c.json(getConversation(db, id));
  });

  app.delete("/conversations/:id", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    deleteConversation(db, id);
    return c.json({ ok: true });
  });

  app.get("/conversations/:id/messages", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    return c.json(getMessages(db, id));
  });

  return app;
}
```

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/routes/health.ts sidecar/src/routes/conversations.ts
git commit -m "feat(sidecar): conversation REST routes + health"
```

---

## Task 12: routes/settings.ts + 通过 server.ts wiring 跑通

**Files:**
- Create: `sidecar/src/routes/settings.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 写 routes/settings.ts**

文件 `sidecar/src/routes/settings.ts`：

```ts
import { Hono } from "hono";
import type { ApiKeyState } from "../services/apiKey";

export function buildSettingsRoutes(apiKey: ApiKeyState): Hono {
  const app = new Hono();

  app.post("/settings/api-key", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { apiKey?: string | null } | null;
    if (body === null) return c.json({ error: "invalid_body" }, 400);
    if (body.apiKey !== null && typeof body.apiKey !== "string") {
      return c.json({ error: "invalid_api_key" }, 400);
    }
    apiKey.set(body.apiKey ?? null);
    return c.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 2: 改写 server.ts wiring 所有 routes**

文件 `sidecar/src/server.ts`（**完全替换**当前内容）：

```ts
import { Hono } from "hono";
import path from "node:path";
import { openDb } from "./db";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildSettingsRoutes } from "./routes/settings";
import { createApiKeyState } from "./services/apiKey";

type Args = { port: number; token: string; db: string };

function parseArgs(argv: string[]): Args {
  const get = (key: string) => {
    const prefix = `--${key}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit?.slice(prefix.length);
  };
  const portStr = get("port");
  const token = get("token");
  const dbArg = get("db");
  if (!portStr || !token || !dbArg) {
    console.error("usage: server --port=<n> --token=<s> --db=<path>");
    process.exit(2);
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`invalid port: ${portStr}`);
    process.exit(2);
  }
  return { port, token, db: dbArg };
}

const args = parseArgs(process.argv.slice(2));

// 路径白名单校验：db 必须在父级允许目录内（防 --db=../../etc/foo.db）。
// 这里只做基础规则：必须以 .db 结尾且 resolved。
const dbAbs = path.resolve(args.db);
if (!dbAbs.endsWith(".db")) {
  console.error(`refusing non-.db path: ${dbAbs}`);
  process.exit(2);
}

const db = openDb(dbAbs);
const apiKey = createApiKeyState(process.env.ANTHROPIC_API_KEY);

export const app = new Hono();

app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${args.token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes(db));
app.route("/", buildSettingsRoutes(apiKey));

console.log(`[sidecar] listening on http://127.0.0.1:${args.port} (db=${dbAbs})`);

export default {
  port: args.port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
```

- [ ] **Step 3: 启动 sidecar 手测**

Run:
```bash
cd sidecar && bun run src/server.ts --port=4123 --token=test123 --db=/tmp/test.db &
sleep 0.5
curl -s -H "Authorization: Bearer test123" http://127.0.0.1:4123/health
curl -s -X POST -H "Authorization: Bearer test123" -H "Content-Type: application/json" \
  -d '{"prompt":"hello","mode":"ask"}' http://127.0.0.1:4123/conversations
curl -s -H "Authorization: Bearer test123" "http://127.0.0.1:4123/conversations?limit=10"
kill %1 2>/dev/null
rm /tmp/test.db /tmp/test.db-wal /tmp/test.db-shm 2>/dev/null
```

Expected:
- 1st: `{"ok":true,"pid":...}`
- 2nd: 含 id + title 的 JSON
- 3rd: 1 行的 conversation 数组

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/server.ts sidecar/src/routes/settings.ts
git commit -m "feat(sidecar): wire all routes + add --db arg + ANTHROPIC_API_KEY env"
```

---

## Task 13: routes/conversations 集成测试

**Files:**
- Create: `sidecar/tests/integration/conversations.test.ts`

- [ ] **Step 1: 写测试**

文件 `sidecar/tests/integration/conversations.test.ts`：

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { healthRoutes } from "../../src/routes/health";
import { buildConversationRoutes } from "../../src/routes/conversations";

function buildApp(token: string) {
  const db = new Database(":memory:");
  migrate(db);
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.route("/", healthRoutes);
  app.route("/", buildConversationRoutes(db));
  return { app, db };
}

const TOKEN = "test-token";

describe("auth", () => {
  it("rejects request without token", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/health");
    expect(res.status).toBe(401);
  });

  it("accepts request with correct token", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/health", { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
  });
});

describe("POST /conversations", () => {
  it("creates conversation + first user message", async () => {
    const { app, db } = buildApp(TOKEN);
    const res = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", mode: "ask" }),
    });
    expect(res.status).toBe(201);
    const conv = await res.json();
    expect(conv.title).toBe("hello");

    const msgCount = (db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
    expect(msgCount).toBe(1);
  });

  it("400 on missing prompt", async () => {
    const { app } = buildApp(TOKEN);
    const res = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ask" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /conversations", () => {
  it("returns list ordered by updated_at DESC", async () => {
    const { app } = buildApp(TOKEN);
    await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a", mode: "ask" }),
    });
    await new Promise((r) => setTimeout(r, 5));
    await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "b", mode: "ask" }),
    });
    const res = await app.request("/conversations", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const list = await res.json();
    expect(list[0].title).toBe("b");
    expect(list[1].title).toBe("a");
  });
});

describe("DELETE cascade", () => {
  it("cascade deletes messages", async () => {
    const { app, db } = buildApp(TOKEN);
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x", mode: "ask" }),
    });
    const conv = await createRes.json();
    await app.request(`/conversations/${conv.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const remaining = (db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
    expect(remaining).toBe(0);
  });
});

describe("PATCH /conversations/:id", () => {
  it("toggles pin", async () => {
    const { app } = buildApp(TOKEN);
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x", mode: "ask" }),
    });
    const conv = await createRes.json();
    const patchRes = await app.request(`/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    const updated = await patchRes.json();
    expect(updated.pinned).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `cd sidecar && bun test tests/integration/conversations.test.ts`
Expected: 6 pass

- [ ] **Step 3: Commit**

```bash
git add sidecar/tests/integration/conversations.test.ts
git commit -m "test(sidecar): conversation REST integration"
```

---

## Task 14: routes/messages.ts — SSE + abort map + 并发检查

**Files:**
- Create: `sidecar/src/routes/messages.ts`
- Modify: `sidecar/src/server.ts` (挂载 route)

- [ ] **Step 1: 实现 routes/messages.ts**

文件 `sidecar/src/routes/messages.ts`：

```ts
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  getConversation,
  getMessages,
  insertAssistantMessage,
} from "../services/conversations";
import { aggregateBlocks, query, translateEvents } from "../services/agent";
import { encodeSseFrame, type SseEvent } from "../lib/sse";
import { ulid } from "../lib/ulid";
import type { ApiKeyState } from "../services/apiKey";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const validateId = (id: string) => ULID_RE.test(id);

export function buildMessageRoutes(db: Database, apiKey: ApiKeyState): Hono {
  const app = new Hono();

  /** conversationId → AbortController. v1 内唯一允许的跨请求内存状态。 */
  const inflight = new Map<string, AbortController>();

  app.post("/conversations/:id/messages", async (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const conv = getConversation(db, id);
    if (!conv) return c.json({ error: "not_found" }, 404);

    if (inflight.has(id)) return c.json({ error: "turn_in_progress" }, 409);

    const key = apiKey.get();
    if (!key) return c.json({ error: "api_key_missing" }, 400);

    const body = (await c.req.json().catch(() => null)) as { text?: string } | null;
    if (!body?.text || typeof body.text !== "string") {
      return c.json({ error: "text_required" }, 400);
    }

    // 写 user 消息（同 createConversation 的逻辑分支：当 conversation 已存在但要追加 turn 时调用）
    // 注意：当前 NewTaskView 流走 createConversation 已经写过首条 user 消息。
    // 本路由：仅当 latest 不是 user-with-text 时插入；否则跳过避免重复。
    const msgs = getMessages(db, id);
    const last = msgs.at(-1);
    if (!last || last.role !== "user") {
      const uid = ulid();
      const now = Date.now();
      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
         VALUES (?, ?, 'user', ?, ?, 'end_turn', NULL)`,
      ).run(uid, id, JSON.stringify([{ type: "text", text: body.text }]), now);
    }

    const controller = new AbortController();
    inflight.set(id, controller);

    const messageId = ulid();
    const allMessages = getMessages(db, id);

    return new Response(
      new ReadableStream<Uint8Array>({
        async start(stream) {
          const encoder = new TextEncoder();
          const collected: SseEvent[] = [];

          try {
            const rawIter = query({
              messages: allMessages,
              apiKey: key,
              signal: controller.signal,
            });
            for await (const ev of translateEvents(rawIter, { messageId })) {
              collected.push(ev);
              stream.enqueue(encoder.encode(encodeSseFrame(ev.event, ev.data)));
            }
          } catch (e) {
            const err: SseEvent = {
              event: "error",
              data: {
                code: "agent_error",
                message: e instanceof Error ? e.message : String(e),
              },
            };
            collected.push(err);
            stream.enqueue(encoder.encode(encodeSseFrame(err.event, err.data)));
          } finally {
            const finishEvent = collected.at(-1);
            const finishReason =
              finishEvent?.event === "message-stop"
                ? "end_turn"
                : finishEvent?.event === "aborted"
                  ? "aborted"
                  : "error";
            const errorText =
              finishEvent?.event === "error"
                ? (finishEvent.data as { message: string }).message
                : null;
            insertAssistantMessage(db, id, {
              blocks: aggregateBlocks(collected),
              finishReason,
              errorText,
            });
            inflight.delete(id);
            stream.close();
          }
        },
        cancel() {
          controller.abort();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });

  app.post("/conversations/:id/abort", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const ctrl = inflight.get(id);
    if (!ctrl) return c.json({ error: "not_in_flight" }, 404);
    ctrl.abort();
    return c.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 2: 在 server.ts 挂载 message routes**

修改 `sidecar/src/server.ts` 顶部 import + 路由挂载块：

```ts
import { buildMessageRoutes } from "./routes/messages";
```

在 `app.route("/", buildSettingsRoutes(apiKey));` 之前一行加：

```ts
app.route("/", buildMessageRoutes(db, apiKey));
```

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/routes/messages.ts sidecar/src/server.ts
git commit -m "feat(sidecar): messages SSE route + abort + 409 concurrency guard"
```

---

## Task 15: routes/messages 集成测试（mock SDK）

**Files:**
- Create: `sidecar/tests/integration/messages.test.ts`

- [ ] **Step 1: 写测试**

文件 `sidecar/tests/integration/messages.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { buildConversationRoutes } from "../../src/routes/conversations";
import { buildMessageRoutes } from "../../src/routes/messages";
import { createApiKeyState } from "../../src/services/apiKey";

const TOKEN = "test-token";

function buildApp(opts: { withApiKey: boolean } = { withApiKey: true }) {
  const db = new Database(":memory:");
  migrate(db);
  const apiKey = createApiKeyState(opts.withApiKey ? "sk-fake" : null);
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== `Bearer ${TOKEN}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.route("/", buildConversationRoutes(db));
  app.route("/", buildMessageRoutes(db, apiKey));
  return { app, db };
}

async function createConv(app: Hono, prompt: string): Promise<string> {
  const res = await app.request("/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, mode: "ask" }),
  });
  const conv = await res.json();
  return conv.id as string;
}

async function readSse(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await res.text();
  const frames = text.split("\n\n").filter((f) => f.trim().length > 0);
  return frames.map((f) => {
    const lines = f.split("\n");
    const event = lines.find((l) => l.startsWith("event: "))!.slice(7);
    const data = JSON.parse(lines.find((l) => l.startsWith("data: "))!.slice(6));
    return { event, data };
  });
}

beforeEach(() => {
  process.env.AGENT_SDK_MOCK = "1";
});

describe("POST /conversations/:id/messages", () => {
  it("streams SSE: message-start, text-delta*, message-stop", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "hello world");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello world" }),
    });
    expect(res.status).toBe(200);
    const events = await readSse(res);
    expect(events[0]!.event).toBe("message-start");
    expect(events.at(-1)!.event).toBe("message-stop");
    expect(events.filter((e) => e.event === "text-delta").length).toBeGreaterThan(0);
  });

  it("persists assistant message with finish_reason=end_turn", async () => {
    const { app, db } = buildApp();
    const id = await createConv(app, "ping");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });
    await res.text(); // drain
    const row = db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .get(id) as { finish_reason: string; blocks_json: string };
    expect(row.finish_reason).toBe("end_turn");
    const blocks = JSON.parse(row.blocks_json);
    expect(blocks[0].text.length).toBeGreaterThan(0);
  });

  it("returns 400 api_key_missing when key is null", async () => {
    const { app } = buildApp({ withApiKey: false });
    const id = await createConv(app, "x");
    const res = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "api_key_missing" });
  });
});

describe("POST /conversations/:id/abort", () => {
  it("404 when no turn in flight", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "x");
    const res = await app.request(`/conversations/${id}/abort`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("concurrency", () => {
  it("returns 409 when same conversation has in-flight turn", async () => {
    const { app } = buildApp();
    const id = await createConv(app, "x");
    // 先起一个但不读响应 → in-flight 状态保持
    const p1 = app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x" }),
    });
    // 给一点时间让 inflight.set 执行
    await new Promise((r) => setTimeout(r, 5));
    const res2 = await app.request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x2" }),
    });
    expect(res2.status).toBe(409);
    // drain 第一个
    const r1 = await p1;
    await r1.text();
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `cd sidecar && AGENT_SDK_MOCK=1 bun test tests/integration/messages.test.ts`
Expected: 5 pass

- [ ] **Step 3: Commit**

```bash
git add sidecar/tests/integration/messages.test.ts
git commit -m "test(sidecar): messages SSE + abort + concurrency (mock SDK)"
```

---

## Task 16: abort 集成测试

**Files:**
- Create: `sidecar/tests/integration/abort.test.ts`

- [ ] **Step 1: 写测试**

文件 `sidecar/tests/integration/abort.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db";
import { buildConversationRoutes } from "../../src/routes/conversations";
import { buildMessageRoutes } from "../../src/routes/messages";
import { createApiKeyState } from "../../src/services/apiKey";

const TOKEN = "test";

function build() {
  const db = new Database(":memory:");
  migrate(db);
  const apiKey = createApiKeyState("sk-fake");
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== `Bearer ${TOKEN}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.route("/", buildConversationRoutes(db));
  app.route("/", buildMessageRoutes(db, apiKey));
  return { app, db };
}

beforeEach(() => {
  process.env.AGENT_SDK_MOCK = "1";
});

describe("abort mid-stream", () => {
  it("emits aborted event + persists partial blocks with finish_reason=aborted", async () => {
    const { app, db } = build();
    const createRes = await app.request("/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "one two three four five six seven", mode: "ask" }),
    });
    const conv = await createRes.json();

    const streamRes = await app.request(`/conversations/${conv.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "one two three four five six seven" }),
    });
    // 等到流出第一个 delta 后发 abort
    await new Promise((r) => setTimeout(r, 25));
    const abortRes = await app.request(`/conversations/${conv.id}/abort`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(abortRes.status).toBe(200);
    await streamRes.text(); // drain

    const row = db
      .prepare("SELECT finish_reason, blocks_json FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .get(conv.id) as { finish_reason: string; blocks_json: string };
    expect(row.finish_reason).toBe("aborted");
    const blocks = JSON.parse(row.blocks_json);
    if (blocks.length > 0) {
      expect(blocks[0].text.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `cd sidecar && AGENT_SDK_MOCK=1 bun test tests/integration/abort.test.ts`
Expected: 1 pass

- [ ] **Step 3: Commit**

```bash
git add sidecar/tests/integration/abort.test.ts
git commit -m "test(sidecar): abort mid-stream persists partial + aborted finish reason"
```

---

## Task 17: Agent SDK 真接入

**前置工作（spec §10 风险 1）**：开干前**先脱产** 30 分钟读 `@anthropic-ai/agent-sdk`（或当前正式包名）的 README，确认：
1. 包名（npm registry 上的实际名称）
2. 入口函数签名（`query()` 还是 `agent()` / 其他）
3. 流式事件结构（字段名是否匹配我们 `RawAgentEvent` 假设）
4. AbortSignal 传法
5. apiKey 传法（参数 / env / Anthropic client）

下面假设包名 `@anthropic-ai/claude-agent-sdk` 且签名近似下方。**真包名 / API 形态如有偏差，仅需要改动 `sidecar/src/services/agent.ts` 末尾的真 SDK 适配段，不影响上游 translateEvents / aggregateBlocks。**

**Files:**
- Modify: `sidecar/package.json`
- Modify: `sidecar/src/services/agent.ts`

- [ ] **Step 1: 装真 SDK 依赖**

Run: `cd sidecar && bun add @anthropic-ai/claude-agent-sdk`

如果包名不对，看 README 改正后再装。

- [ ] **Step 2: 改 agent.ts 的 query() 入口走真 SDK**

替换 `sidecar/src/services/agent.ts` 末尾 `query` 函数为：

```ts
export async function* query(opts: QueryOptions): AsyncIterable<RawAgentEvent> {
  if (process.env.AGENT_SDK_MOCK === "1") {
    yield* mockQuery({ messages: opts.messages, signal: opts.signal });
    return;
  }

  // 真 SDK 接入。下面字段名假设，按实际 README 调整。
  const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk");

  const sdkMessages = opts.messages.map((m) => ({
    role: m.role,
    content: m.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join(""),
  }));

  const stream = sdkQuery({
    apiKey: opts.apiKey,
    messages: sdkMessages,
    signal: opts.signal,
  });

  for await (const ev of stream) {
    // 假设 ev.type 已是我们 RawAgentEvent 形状之一。
    // 如果 SDK 用其他事件名（如 "RawMessageStreamEvent" 包裹），在此映射。
    yield ev as RawAgentEvent;
  }
}
```

- [ ] **Step 3: 手测（带真 API key）**

```bash
cd sidecar
export ANTHROPIC_API_KEY="sk-..."  # 真 key
bun run src/server.ts --port=4123 --token=test --db=/tmp/real.db &
sleep 0.5
curl -sN -X POST -H "Authorization: Bearer test" -H "Content-Type: application/json" \
  -d '{"prompt":"say hi in 5 words","mode":"ask"}' http://127.0.0.1:4123/conversations \
  | jq -r .id | tee /tmp/conv-id
# 拿 id 后发消息
ID=$(cat /tmp/conv-id)
curl -sN -X POST -H "Authorization: Bearer test" -H "Content-Type: application/json" \
  -d '{"text":"say hi in 5 words"}' \
  "http://127.0.0.1:4123/conversations/${ID}/messages"
kill %1
rm /tmp/real.db /tmp/real.db-wal /tmp/real.db-shm 2>/dev/null
unset ANTHROPIC_API_KEY
```

Expected: 看到 `event: message-start` → 多个 `event: text-delta` → `event: message-stop`。文本是 Claude 的真实输出。

**若失败：** 看 SDK README，调整 sdkQuery 调用形状或 RawAgentEvent 映射。

- [ ] **Step 4: 跑所有 sidecar 单测确认 mock 路径未被破坏**

Run: `cd sidecar && AGENT_SDK_MOCK=1 bun test`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add sidecar/package.json sidecar/bun.lock sidecar/src/services/agent.ts
git commit -m "feat(sidecar): wire real @anthropic-ai/claude-agent-sdk in agent.ts query()"
```

---

## Task 18: Tauri Rust setup() — db path + ANTHROPIC_API_KEY env 注入

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 改 capability 加 `--db=` 校验**

Read `src-tauri/capabilities/default.json` 找到 `shell:allow-spawn` 节点下 `binaries/agent-studio-sidecar` 的 `args` 数组，追加：

```json
{ "validator": "^--db=.+\\.db$" }
```

- [ ] **Step 2: 改 lib.rs**

Read `src-tauri/src/lib.rs`，在 `setup` 闭包里 sidecar spawn 段改动：

```rust
// 现有: let token = ...; let port = ...;
let app_data = app.path().app_data_dir()?;
std::fs::create_dir_all(&app_data)?;
let db_path = app_data.join("agent-studio.db");

let api_key: Option<String> = {
    let store = app.store("settings.json")?;
    store.get("anthropic_api_key").and_then(|v| v.as_str().map(String::from))
};

let mut cmd = app.shell()
    .sidecar("agent-studio-sidecar")?
    .args([
        format!("--port={}", port),
        format!("--token={}", token),
        format!("--db={}", db_path.display()),
    ]);
if let Some(k) = api_key {
    cmd = cmd.env("ANTHROPIC_API_KEY", k);
}
let (_rx, child) = cmd.spawn()?;
```

（实际行号 / 上下文取决于现有 lib.rs；这一步在 implementation 时按文件结构合并。）

- [ ] **Step 3: cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 0 errors

- [ ] **Step 4: 手测启动 Tauri dev 验证 sidecar 能拿到 db 参数**

Run: `bun run build:sidecar -- --host-only && bun run tauri:dev`

启动后看终端：应能看到 `[sidecar] listening on http://127.0.0.1:<port> (db=/.../agent-studio.db)`。

打开 macOS app data dir 确认 `agent-studio.db` 文件被创建。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(tauri): pass db path + ANTHROPIC_API_KEY env to sidecar on spawn"
```

---

## Task 19: Tauri set_api_key command

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 加 command 函数**

Read `src-tauri/src/lib.rs` 找到已有的 `get_sidecar_info` 命令，在它附近追加：

```rust
#[tauri::command]
async fn set_api_key(
    app: tauri::AppHandle,
    key: String,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    if key.is_empty() {
        store.delete("anthropic_api_key");
    } else {
        store.set("anthropic_api_key", key);
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
```

然后在 `tauri::Builder::default()` 的 `.invoke_handler(tauri::generate_handler![...])` 列表里追加 `set_api_key`。

- [ ] **Step 2: cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 0 errors

- [ ] **Step 3: 手测 invoke**

启动 `bun run tauri:dev`，在 DevTools console:

```js
const { invoke } = await import("@tauri-apps/api/core");
await invoke("set_api_key", { key: "sk-test-123" });
```

应无报错。重启应用，验证 plugin-store 持久化（`agent-studio.db` 同目录看 `settings.json` 文件）。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): set_api_key command — writes plugin-store"
```

---

## Task 20: src/lib/data/types.ts + src/lib/data/sse.ts

**Files:**
- Create: `src/lib/data/types.ts`
- Create: `src/lib/data/sse.ts`

- [ ] **Step 1: types.ts**

文件 `src/lib/data/types.ts`：

```ts
export type ContentBlock = { type: "text"; text: string };

export type ConversationMode = "ask" | "agent";
export type ConversationStatus = "active" | "done" | "failed" | "aborted";
export type FinishReason = "end_turn" | "aborted" | "error" | null;

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  createdAt: number;
  finishReason: FinishReason;
  errorText: string | null;
}

export type SseEvent =
  | { event: "message-start"; data: { messageId: string; role: "assistant" } }
  | { event: "text-delta"; data: { messageId: string; blockIndex: number; text: string } }
  | { event: "message-stop"; data: { messageId: string; finishReason: "end_turn" } }
  | { event: "error"; data: { code: string; message: string } }
  | { event: "aborted"; data: { messageId: string } };
```

- [ ] **Step 2: sse.ts — async iterator parser**

文件 `src/lib/data/sse.ts`：

```ts
import { fetchSidecar } from "../sidecar-client";
import type { SseEvent } from "./types";

/**
 * Parse text/event-stream into AsyncIterable<SseEvent>.
 * 复用 fetchSidecar (它注入 Bearer token + base url)。
 */
export async function* fetchSseStream(
  path: string,
  init: RequestInit,
): AsyncIterable<SseEvent> {
  const res = await fetchSidecar(path, init);
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SSE request failed: ${res.status} ${errText}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let eventName = "message";
      let dataLine = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      yield { event: eventName, data: JSON.parse(dataLine) } as SseEvent;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/sse.ts
git commit -m "feat(data): client types + SSE async iterator parser"
```

---

## Task 21: src/lib/data/conversations.ts

**Files:**
- Create: `src/lib/data/conversations.ts`

- [ ] **Step 1: 实现**

文件 `src/lib/data/conversations.ts`：

```ts
import { fetchSidecar } from "../sidecar-client";
import { fetchSseStream } from "./sse";
import type { Conversation, ConversationMode, Message, SseEvent } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as { error?: string };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateConversationArgs {
  prompt: string;
  projectId?: string | null;
  mode: ConversationMode;
}

export async function createConversation(args: CreateConversationArgs): Promise<Conversation> {
  const res = await fetchSidecar("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<Conversation>(res);
}

export async function listRecents(limit = 20): Promise<Conversation[]> {
  const res = await fetchSidecar(`/conversations?limit=${limit}`);
  return expectJson<Conversation[]>(res);
}

export async function listPinned(): Promise<Conversation[]> {
  const res = await fetchSidecar(`/conversations?limit=100&pinned=true`);
  return expectJson<Conversation[]>(res);
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`);
  return expectJson<Conversation>(res);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetchSidecar(`/conversations/${conversationId}/messages`);
  return expectJson<Message[]>(res);
}

export async function togglePin(id: string, pinned: boolean): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  return expectJson<Conversation>(res);
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return expectJson<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetchSidecar(`/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

/** 返回 SSE 事件迭代器。调用方持有 AbortController 控制取消。 */
export function sendMessage(
  conversationId: string,
  text: string,
  signal: AbortSignal,
): AsyncIterable<SseEvent> {
  return fetchSseStream(`/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
}

/** 服务端 abort（与客户端 AbortController 配对调用）。 */
export async function abortStream(conversationId: string): Promise<void> {
  const res = await fetchSidecar(`/conversations/${conversationId}/abort`, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`abort_failed_${res.status}`);
  }
}
```

- [ ] **Step 2: 验证 TS 编译**

Run: `bun run build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/conversations.ts
git commit -m "feat(data): conversations HTTP/SSE client"
```

---

## Task 22: src/lib/data/settings.ts

**Files:**
- Create: `src/lib/data/settings.ts`

- [ ] **Step 1: 实现**

文件 `src/lib/data/settings.ts`：

```ts
import { invoke } from "@tauri-apps/api/core";
import { fetchSidecar } from "../sidecar-client";

/**
 * 更新 API key：先写 plugin-store (持久化)，再通知 sidecar 热更新内存。
 * 调用一次完成两件事，UI 不需要分别 invoke。
 */
export async function setApiKey(key: string): Promise<void> {
  await invoke("set_api_key", { key });
  const res = await fetchSidecar("/settings/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key.length > 0 ? key : null }),
  });
  if (!res.ok) throw new Error(`api_key_sidecar_${res.status}`);
}
```

- [ ] **Step 2: 验证 TS 编译**

Run: `bun run build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/settings.ts
git commit -m "feat(data): setApiKey — writes plugin-store + hot-updates sidecar"
```

---

## Task 23: SettingsView 加 API key 字段

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/i18n/locales/zh/settings.ts`
- Modify: `src/i18n/locales/en/settings.ts`

- [ ] **Step 1: 加 i18n key**

在 `src/i18n/locales/zh/settings.ts` 的 `settings` 对象里追加 `apiKey` 子节点：

```ts
apiKey: {
  title: "Anthropic API Key",
  description: "用于调用 Claude 模型。键值保存在本机 plugin-store 中（明文）。",
  placeholder: "sk-ant-...",
  save: "保存",
  saved: "已保存",
  saveError: "保存失败",
},
```

在 `src/i18n/locales/en/settings.ts` 的同位置追加：

```ts
apiKey: {
  title: "Anthropic API Key",
  description: "Required to call Claude. Stored locally in plugin-store (plaintext).",
  placeholder: "sk-ant-...",
  save: "Save",
  saved: "Saved",
  saveError: "Save failed",
},
```

- [ ] **Step 2: 改 SettingsView**

Read `src/features/settings/SettingsView.tsx`，在已有 Appearance 段落之前或之后插入一个 "Anthropic API Key" section。完整新组件大致结构：

```tsx
// 在 SettingsView 顶部 imports 加：
import { useState } from "react";
import { setApiKey } from "@/lib/data/settings";

// 在 component 内：
const [apiKeyInput, setApiKeyInput] = useState("");
const [saving, setSaving] = useState(false);
const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null);

const handleSaveApiKey = async () => {
  setSaving(true);
  setSaveMsg(null);
  try {
    await setApiKey(apiKeyInput.trim());
    setSaveMsg("saved");
    setApiKeyInput("");
  } catch {
    setSaveMsg("error");
  } finally {
    setSaving(false);
  }
};

// 在 JSX 内（Appearance section 之前）插入：
<section className="space-y-3">
  <div>
    <h2 className="text-base font-medium text-foreground">{t("settings.apiKey.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("settings.apiKey.description")}</p>
  </div>
  <div className="flex gap-2">
    <input
      type="password"
      value={apiKeyInput}
      onChange={(e) => setApiKeyInput(e.target.value)}
      placeholder={t("settings.apiKey.placeholder")}
      className="flex-1 rounded-md border border-border bg-bg-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
    />
    <button
      type="button"
      onClick={handleSaveApiKey}
      disabled={saving || apiKeyInput.length === 0}
      className="rounded-md bg-text-100 px-4 py-2 text-sm text-bg-100 hover:opacity-90 disabled:opacity-50"
    >
      {t("settings.apiKey.save")}
    </button>
  </div>
  {saveMsg === "saved" && <p className="text-sm text-green-600">{t("settings.apiKey.saved")}</p>}
  {saveMsg === "error" && <p className="text-sm text-red-600">{t("settings.apiKey.saveError")}</p>}
</section>
```

**注意**：sample 中颜色 `text-green-600` / `text-red-600` 是占位。按 spec §第 7 条 design tokens 规则，**用 semantic tokens 重写**：例如 `text-[color:hsl(var(--success-100))]` / `text-[color:hsl(var(--danger-100))]`。若仓库尚未定义这两个 semantic token，先在 `src/styles/semantic/colors.css` 加映射到 primitives，**或** 暂用 inline style `style={{ color: "hsl(var(--text-300))" }}` 直到 design-tokens skill 评审通过。

- [ ] **Step 3: 跑 dev 手测**

Run: `bun run tauri:dev`

操作：进 Settings → 输入 `sk-test-123` → 点 Save → 应见 "已保存" 提示。重启应用后，sidecar 进程的 `process.env.ANTHROPIC_API_KEY` 应该是 `sk-test-123`（可在 sidecar 启动日志或临时打印验证）。

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsView.tsx src/i18n/locales/zh/settings.ts src/i18n/locales/en/settings.ts
git commit -m "feat(settings): Anthropic API key input + Save"
```

---

## Task 24: AppShellContext 加 streamingStore

**Files:**
- Modify: `src/app/AppShellContext.tsx`

- [ ] **Step 1: 加类型与状态**

Read `src/app/AppShellContext.tsx`。在 `AppShellContextValue` 接口上追加：

```ts
interface StreamState {
  status: "streaming" | "done" | "aborted" | "error";
  textBuffer: string;
  messageId: string | null;
  errorMessage?: string;
}

// in AppShellContextValue:
streamingByConversation: Map<string, StreamState>;
setStreamState: (conversationId: string, state: StreamState) => void;
clearStreamState: (conversationId: string) => void;
```

在 `AppShellProvider` 内：

```ts
const [streamingByConversation, setStreamingByConversation] = useState<Map<string, StreamState>>(
  new Map(),
);

const setStreamState = useCallback((conversationId: string, state: StreamState) => {
  setStreamingByConversation((prev) => {
    const next = new Map(prev);
    next.set(conversationId, state);
    return next;
  });
}, []);

const clearStreamState = useCallback((conversationId: string) => {
  setStreamingByConversation((prev) => {
    const next = new Map(prev);
    next.delete(conversationId);
    return next;
  });
}, []);
```

把这三个字段加进 provider 的 value object。

- [ ] **Step 2: 验证 TS 编译**

Run: `bun run build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/AppShellContext.tsx
git commit -m "feat(app-shell): streamingByConversation map for in-flight SSE state"
```

---

## Task 25: NewTaskView 接入 createConversation

**Files:**
- Modify: `src/features/new-task/NewTaskView.tsx`
- Modify: `src/app/AppShellContext.tsx` (如缺 `pendingFirstPrompt`)

- [ ] **Step 1: AppShellContext 加 pendingFirstPrompt**

在 `AppShellContextValue` 增：

```ts
pendingFirstPrompt: { conversationId: string; text: string } | null;
setPendingFirstPrompt: (v: { conversationId: string; text: string } | null) => void;
```

provider 内对应 state + setter（同 Task 24 模式）。

- [ ] **Step 2: 改 NewTaskView**

Read `src/features/new-task/NewTaskView.tsx`。把当前 `<PromptInput onSubmit={() => setView("task")}>` 改为：

```tsx
const { setView, setActiveTaskId, setPendingFirstPrompt } = useAppShell();
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleSubmit = async (text: string) => {
  if (text.trim().length === 0 || submitting) return;
  setSubmitting(true);
  setError(null);
  try {
    const conv = await createConversation({ prompt: text, mode: "ask" });
    setActiveTaskId(conv.id);
    setPendingFirstPrompt({ conversationId: conv.id, text });
    setView("task");
  } catch (e) {
    setError(e instanceof Error ? e.message : "submit_failed");
  } finally {
    setSubmitting(false);
  }
};
```

把 PromptInput 改成：`<PromptInput onSubmit={handleSubmit}>` 并在底部加错误提示行：

```tsx
{error && (
  <p className="mt-2 text-sm" style={{ color: "hsl(var(--danger-100))" }}>
    {error === "api_key_missing"
      ? t("newTask.error.apiKeyMissing")
      : t("newTask.error.generic", { msg: error })}
  </p>
)}
```

- [ ] **Step 3: 加 i18n key**

`src/i18n/locales/zh/newTask.ts` 内 `newTask` 节点加：

```ts
error: {
  apiKeyMissing: "未配置 API key。前往 设置 添加。",
  generic: "提交失败：{{msg}}",
},
```

`en/newTask.ts` 同位置加：

```ts
error: {
  apiKeyMissing: "API key not configured. Add it in Settings.",
  generic: "Submit failed: {{msg}}",
},
```

- [ ] **Step 4: import 整理**

NewTaskView 顶部 import 加：

```ts
import { useState } from "react";
import { createConversation } from "@/lib/data/conversations";
import { useAppShell } from "@/app/AppShellContext";
```

- [ ] **Step 5: 手测**

`bun run tauri:dev` → NewTask 输入 "hello" 提交 → 期望 URL/view 切到 task 但 TaskView 还没接消息流，会显示空。**这一步只验跳转**，下一 task 接消息。

- [ ] **Step 6: Commit**

```bash
git add src/features/new-task/NewTaskView.tsx src/app/AppShellContext.tsx \
        src/i18n/locales/zh/newTask.ts src/i18n/locales/en/newTask.ts
git commit -m "feat(new-task): submit → createConversation → setView(task)"
```

---

## Task 26: TaskView 流式渲染

**Files:**
- Modify: `src/features/task/TaskView.tsx`
- Modify: `src/features/task/ChatStream.tsx`
- 删除使用 mock 的部分

- [ ] **Step 1: 改写 TaskView 加载 + 流式逻辑**

Read `src/features/task/TaskView.tsx` 当前实现。重写为：

```tsx
import { useEffect, useRef, useState } from "react";
import { useAppShell } from "@/app/AppShellContext";
import { getMessages, sendMessage } from "@/lib/data/conversations";
import type { Message } from "@/lib/data/types";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskHeader } from "@/features/task/TaskHeader";
// 其余原 import（TaskRightPanel / PreviewPane 等）保留

export function TaskView() {
  const {
    activeTaskId,
    streamingByConversation,
    setStreamState,
    clearStreamState,
    pendingFirstPrompt,
    setPendingFirstPrompt,
  } = useAppShell();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // 初次加载历史
  useEffect(() => {
    if (!activeTaskId) return;
    setLoading(true);
    getMessages(activeTaskId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [activeTaskId]);

  // 如果 NewTask 跳过来且有 pendingFirstPrompt，触发首轮 stream
  useEffect(() => {
    if (!activeTaskId || !pendingFirstPrompt) return;
    if (pendingFirstPrompt.conversationId !== activeTaskId) return;
    const conversationId = pendingFirstPrompt.conversationId;
    const text = pendingFirstPrompt.text;
    setPendingFirstPrompt(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreamState(conversationId, {
      status: "streaming",
      textBuffer: "",
      messageId: null,
    });

    (async () => {
      let buffer = "";
      let messageId: string | null = null;
      try {
        for await (const ev of sendMessage(conversationId, text, ctrl.signal)) {
          if (ev.event === "message-start") {
            messageId = ev.data.messageId;
            setStreamState(conversationId, {
              status: "streaming",
              textBuffer: "",
              messageId,
            });
          } else if (ev.event === "text-delta") {
            buffer += ev.data.text;
            setStreamState(conversationId, {
              status: "streaming",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "message-stop") {
            setStreamState(conversationId, {
              status: "done",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "aborted") {
            setStreamState(conversationId, {
              status: "aborted",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "error") {
            setStreamState(conversationId, {
              status: "error",
              textBuffer: buffer,
              messageId,
              errorMessage: ev.data.message,
            });
          }
        }
      } catch (e) {
        setStreamState(conversationId, {
          status: "error",
          textBuffer: buffer,
          messageId,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      } finally {
        // stream 结束后从 DB 重读 messages（包括服务端写入的 assistant row）
        const fresh = await getMessages(conversationId).catch(() => null);
        if (fresh) setMessages(fresh);
        // 保留 streamState 一帧供 ChatStream 渲染"已停止/失败"标记；
        // 用户切走视图或点 Resend 时再 clearStreamState
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [activeTaskId, pendingFirstPrompt, setPendingFirstPrompt, setStreamState]);

  if (!activeTaskId) return null;
  const stream = streamingByConversation.get(activeTaskId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <TaskHeader conversationId={activeTaskId} streaming={stream?.status === "streaming"} />
      <ChatStream messages={messages} stream={stream} loading={loading} />
      {/* 其余 RightPanel / PreviewPane 保留原结构，但传入空数据 */}
    </div>
  );
}
```

- [ ] **Step 2: 改 ChatStream 接受 stream prop**

Read `src/features/task/ChatStream.tsx`。改 props：

```tsx
import type { Message } from "@/lib/data/types";

interface StreamState {
  status: "streaming" | "done" | "aborted" | "error";
  textBuffer: string;
  messageId: string | null;
  errorMessage?: string;
}

interface ChatStreamProps {
  messages: Message[];
  stream: StreamState | null;
  loading: boolean;
}

export function ChatStream({ messages, stream, loading }: ChatStreamProps) {
  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <div className="flex-1 overflow-y-auto px-12 py-6">
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
      {stream && stream.status === "streaming" && (
        <MessageRow
          message={{
            id: "in-flight",
            conversationId: "",
            role: "assistant",
            blocks: [{ type: "text", text: stream.textBuffer }],
            createdAt: Date.now(),
            finishReason: null,
            errorText: null,
          }}
          streaming
        />
      )}
      {stream && stream.status === "aborted" && (
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--text-300))" }}>
          已停止
        </p>
      )}
      {stream && stream.status === "error" && (
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--danger-100))" }}>
          错误：{stream.errorMessage}
        </p>
      )}
    </div>
  );
}

function MessageRow({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  // spec §6.4 resumption：DB 加载时 finish_reason=null 表示"残留 in-flight"（sidecar 崩溃 / 应用重启）。
  // finish_reason="error" 表示流过程中出错。两种情况都在消息末尾渲染状态尾标 + Resend。
  const interrupted = message.role === "assistant" && !streaming && message.finishReason === null;
  const failed = message.role === "assistant" && message.finishReason === "error";
  const aborted = message.role === "assistant" && message.finishReason === "aborted";

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs uppercase text-muted-foreground">
        {message.role === "user" ? "You" : "Claude"}
      </div>
      {message.blocks.map((b, i) => (
        <p key={i} className="text-sm text-foreground">
          {b.type === "text" ? b.text : null}
          {streaming && i === message.blocks.length - 1 && (
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-current" />
          )}
        </p>
      ))}
      {(interrupted || failed || aborted) && (
        <p className="mt-2 text-xs" style={{ color: "hsl(var(--text-300))" }}>
          {interrupted && "已中断"}
          {aborted && "已停止"}
          {failed && `失败：${message.errorText ?? "unknown"}`}
          {" · "}
          <button className="underline" type="button">Resend</button>
        </p>
      )}
    </div>
  );
}
```

注：保留原 ChatStream 的 ContentBlock 分支结构（tool-call-timeline / artifact / prose / brand-star）作为死路径但不渲染。

- [ ] **Step 3: 跑 build**

Run: `bun run build`
Expected: 0 errors（如果 ChatStream 别处还引用 mock 类型，按编译错误修）

- [ ] **Step 4: 手测端到端**

```bash
bun run tauri:dev
# 在 Settings 输入真 API key 保存
# 回到 New task 输入 "hello"
# 期望 TaskView 显示 user 消息 + 流式 assistant 响应
```

- [ ] **Step 5: Commit**

```bash
git add src/features/task/TaskView.tsx src/features/task/ChatStream.tsx
git commit -m "feat(task): real conversation + streaming SSE rendering"
```

---

## Task 27: TaskHeader Stop → 双 abort

**Files:**
- Modify: `src/features/task/TaskHeader.tsx`

- [ ] **Step 1: 接 abortStream**

Read 现有 `src/features/task/TaskHeader.tsx`。加 props + handler：

```tsx
import { abortStream } from "@/lib/data/conversations";

interface TaskHeaderProps {
  conversationId: string;
  streaming: boolean;
}

export function TaskHeader({ conversationId, streaming }: TaskHeaderProps) {
  // ... 现有 UI

  const handleStop = async () => {
    // 客户端 AbortController.abort() 由 TaskView useEffect cleanup 触发（视图卸载）
    // 此处只发服务端 abort —— 让 sidecar 停止烧 token、把 partial 入库
    try {
      await abortStream(conversationId);
    } catch (e) {
      console.warn("abort failed", e);
    }
  };

  // 在 Stop 按钮节点上挂 onClick:
  <button onClick={handleStop} disabled={!streaming}>Stop</button>
}
```

**注意客户端 AbortController**：客户端那一半要 TaskView 持有的 `abortRef` 也调 `.abort()`。把 `abortRef` 暴露到 context 或者通过 props 传给 TaskHeader。最干净的做法：在 AppShellContext 加一个 `abortLocalStream(conversationId): void` 方法，TaskView 注册自己的 AbortController，TaskHeader 调 context 方法。

加到 `src/app/AppShellContext.tsx`：

```ts
// 在 AppShellContextValue 加
abortLocalStream: (conversationId: string) => void;
registerLocalAbort: (conversationId: string, controller: AbortController) => void;

// provider 内
const localAbortsRef = useRef<Map<string, AbortController>>(new Map());
const registerLocalAbort = useCallback((id: string, c: AbortController) => {
  localAbortsRef.current.set(id, c);
}, []);
const abortLocalStream = useCallback((id: string) => {
  const c = localAbortsRef.current.get(id);
  c?.abort();
  localAbortsRef.current.delete(id);
}, []);
```

TaskView 的 useEffect 改：在 `abortRef.current = ctrl` 后加 `registerLocalAbort(conversationId, ctrl);`。

TaskHeader 的 `handleStop` 改为：

```tsx
const { abortLocalStream } = useAppShell();
const handleStop = async () => {
  abortLocalStream(conversationId);
  try {
    await abortStream(conversationId);
  } catch {}
};
```

- [ ] **Step 2: 手测**

启动应用，提交长 prompt（要求长回答），0.5s 内点 Stop → 流停 → ChatStream 显示"已停止" → DB assistant 行 finish_reason=aborted（用 `sqlite3 ~/Library/Application\ Support/.../agent-studio.db "select role, finish_reason from messages"` 验证）。

- [ ] **Step 3: Commit**

```bash
git add src/features/task/TaskHeader.tsx src/app/AppShellContext.tsx src/features/task/TaskView.tsx
git commit -m "feat(task): Stop button — client + server abort"
```

---

## Task 28: SidebarContent 读真实 Recents + Pinned

**Files:**
- Modify: `src/features/sidebar/SidebarContent.tsx`
- Modify: `src/app/AppShellContext.tsx`（如缺 recents/pinned 改异步加载）

- [ ] **Step 1: AppShellContext 把 recents/pinned 改为可异步刷新**

Read `src/app/AppShellContext.tsx`，现有 `pinned` / `recents` 状态已存在（per summary "lift pinned/recents to context"）。加：

```ts
refreshRecentsAndPinned: () => Promise<void>;
```

provider 内：

```ts
import { listRecents, listPinned } from "@/lib/data/conversations";

const refreshRecentsAndPinned = useCallback(async () => {
  const [r, p] = await Promise.all([listRecents(20), listPinned()]);
  // 把 Conversation 映射到 MockRecentItem / MockPinnedItem 形状
  setRecents(
    r.map((c) => ({
      id: c.id,
      kind: "conversation" as const,
      title: c.title,
      status: c.status === "active" ? "active" : c.status === "done" ? "done" : "failed",
      time: new Date(c.updatedAt).toLocaleString(),
    })),
  );
  setPinned(
    p.map((c) => ({
      id: c.id,
      kind: "task" as const,
      name: c.title,
      status: c.status === "active" ? "active" : c.status === "done" ? "done" : "failed",
    })),
  );
}, []);

useEffect(() => {
  void refreshRecentsAndPinned();
}, [refreshRecentsAndPinned]);
```

- [ ] **Step 2: SidebarContent 点击 recent / pinned 跳转**

Read 现有 `SidebarContent.tsx`。recent / pinned 行的 onClick 改为：

```tsx
onClick={() => {
  setActiveTaskId(item.id);
  setView("task");
}}
```

togglePin 接 DB：

```tsx
import { togglePin as togglePinApi } from "@/lib/data/conversations";

const handleTogglePin = async (id: string, currentlyPinned: boolean) => {
  await togglePinApi(id, !currentlyPinned);
  await refreshRecentsAndPinned();
};
```

- [ ] **Step 3: 让 TaskView stream 完成后刷新 sidebar**

回到 `src/features/task/TaskView.tsx` 的 finally 块，加：

```ts
const { refreshRecentsAndPinned } = useAppShell();
// finally 内：
void refreshRecentsAndPinned();
```

- [ ] **Step 4: 手测**

启动应用，提 3 个不同 prompt → Sidebar Recents 出现 3 行 → 重启应用 → Recents 仍按时间倒序在。Pin 1 个 → 出现在 Pinned 段。

- [ ] **Step 5: Commit**

```bash
git add src/app/AppShellContext.tsx src/features/sidebar/SidebarContent.tsx src/features/task/TaskView.tsx
git commit -m "feat(sidebar): real Recents + Pinned from DB + togglePin write-through"
```

---

## Task 29: TaskView 空状态清理 — PlanCard / RightPanel

**Files:**
- Modify: `src/features/task/TaskRightPanel.tsx`
- Modify: `src/features/task/PlanCard.tsx`（如存在；spec §5.2 引用过）

- [ ] **Step 1: 真会话模式下 RightPanel 渲染空状态**

Read `src/features/task/TaskRightPanel.tsx`。当前可能依赖 mockTask 的 artifacts/files。改为：当 props 中传入空数组时显示"暂无 artifacts / 暂无文件"占位。

如果当前实现是 hardcode 引用 mock，加 prop：

```tsx
interface TaskRightPanelProps {
  artifacts?: Array<{ id: string; name: string; type: string }>;
  files?: Array<{ id: string; name: string }>;
}

export function TaskRightPanel({ artifacts = [], files = [] }: TaskRightPanelProps) {
  // 当 length=0 显示空状态
  if (artifacts.length === 0 && files.length === 0) {
    return (
      <aside className="w-[320px] p-6 text-sm text-muted-foreground">
        {/* i18n key task.rightPanel.empty */}
        暂无产出
      </aside>
    );
  }
  // ... 原渲染
}
```

TaskView 调用时不传任何 props（默认 `[]`）。

- [ ] **Step 2: PlanCard 同样空状态**

如有 PlanCard 文件，让其根据 props 决定是否渲染；TaskView 不传 plan → 不渲染或显示 "Direct answer"。

- [ ] **Step 3: 加 i18n key**

`zh/task.ts` 加：

```ts
rightPanel: {
  empty: "暂无产出",
},
```

`en/task.ts` 加：

```ts
rightPanel: {
  empty: "No artifacts yet",
},
```

- [ ] **Step 4: build + 视觉验证**

```bash
bun run build
bun run tauri:dev
```

新建会话 → TaskView 右侧应显示"暂无产出"，无 mock artifact。

- [ ] **Step 5: Commit**

```bash
git add src/features/task/TaskRightPanel.tsx src/features/task/PlanCard.tsx \
        src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "feat(task): empty state for PlanCard / RightPanel in real conversations"
```

---

## Task 30: 删除 src/lib/mock/task.ts + 引用收敛

**Files:**
- Delete: `src/lib/mock/task.ts`
- Modify: 引用方（grep 找）

- [ ] **Step 1: 找所有引用**

Run: `grep -rn "lib/mock/task" src/ --include="*.ts*"`

应只见 TaskView / ChatStream / RightPanel / PreviewPane / ContextTab / FilesTab / ProcessTab / 等 task 子组件。

- [ ] **Step 2: 一一替换**

对每个引用：
- 如果文件已经在前面任务（26、29）切到真 conversation 数据，移除 mock import
- 如果是辅助 tab（ContextTab / FilesTab / ProcessTab），保留组件外壳但 prop 改为可空数组，调用方传 `[]`

- [ ] **Step 3: 删 mock 文件**

Run: `rm src/lib/mock/task.ts`

- [ ] **Step 4: 验证 build**

Run: `bun run build`
Expected: 0 errors

- [ ] **Step 5: Commit**

显式列出要提交的文件（不要用 `-A` — 仓库存在未提交的 WIP 文件，`-A` 会误提交）：

```bash
git add src/lib/mock/task.ts                 # 已被 rm，记为 deletion
# 把 Step 2 中实际修改的引用文件逐一加入，例如：
git add src/features/task/ContextTab.tsx
git add src/features/task/FilesTab.tsx
git add src/features/task/ProcessTab.tsx
# ...等 grep 找到的全部引用方
git status   # 确认 staged 列表里只有本 task 修改的文件
git commit -m "chore: remove src/lib/mock/task.ts — TaskView fully driven by DB"
```

---

## Task 31: 端到端验收脚本

**Files:**
- Create: `docs/superpowers/plans/2026-05-18-acceptance.md`（手测脚本记录）

这一步不写代码；按 spec §9 跑 11 项验收，逐条勾选并记录。

- [ ] **Step 1: 全新数据库环境**

```bash
# 备份并清空当前 DB
mv ~/Library/Application\ Support/com.ugreen.agent-studio/agent-studio.db{,.bak} 2>/dev/null
mv ~/Library/Application\ Support/com.ugreen.agent-studio/settings.json{,.bak} 2>/dev/null
```

- [ ] **Step 2: 启动应用**

Run: `bun run tauri:dev`

- [ ] **Step 3: 逐项验证 spec §9 的 11 条**

记录到 `docs/superpowers/plans/2026-05-18-acceptance.md`：

```markdown
# Backend Integration Chat Vertical · 验收

日期：[填]

| # | 验收项 | 通过 | 备注 |
|---|---|---|---|
| 1 | 全新安装 → API key Save → 不重启即可用 |  |  |
| 2 | NewTask "hello" → 1s 内首 token → DB 两行 |  |  |
| 3 | Stop 中断 → DB finish_reason=aborted、partial 非空 |  |  |
| 4 | kill sidecar 中断 → 重启 → "已中断" + Resend |  |  |
| 5 | Recents 跨重启 + Pin 持久化 |  |  |
| 6 | 同会话连提 2 次 → 409 |  |  |
| 7 | 删 API key → banner |  |  |
| 8 | 错 key → inline 错误卡 |  |  |
| 9 | `cd sidecar && bun test` 全绿 |  |  |
| 10 | `bun run build` + `cargo check` 全绿 |  |  |
| 11 | Projects / Scheduled / Customize 视觉无回归 |  |  |
```

- [ ] **Step 4: 跑 sidecar 完整测试**

```bash
cd sidecar && bun test
```

期望：所有 services + integration 测试通过（unit 部分不需 AGENT_SDK_MOCK；integration messages/abort 需要）。如果 integration 默认未启 mock：

```bash
cd sidecar && AGENT_SDK_MOCK=1 bun test tests/integration
```

- [ ] **Step 5: 跑前端 build + Rust check**

```bash
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 6: Commit 验收记录**

```bash
git add docs/superpowers/plans/2026-05-18-acceptance.md
git commit -m "docs: backend integration chat vertical — acceptance log"
```

---

## 自检（self-review 笔记，不必执行）

- ✅ spec §1 完成态 5 条 → Task 7/14-17/26-28
- ✅ spec §4 数据模型 → Task 3-7
- ✅ spec §5 模块边界 → Task 1-15（sidecar）+ 20-22（前端 seam）+ 18-19（Rust）
- ✅ spec §6.2 双 abort → Task 14 服务端 + Task 27 客户端
- ✅ spec §6.3 并发 409 → Task 14 + Task 15 测试
- ✅ spec §6.4 resumption → Task 24 streamingStore + Task 26 finally 块读 finish_reason
- ✅ spec §7 后端测试 → Task 5/6/7/8/10/13/15/16
- ✅ spec §10 风险 1（SDK 形态）→ Task 17 前置 30 分钟阅读
- ✅ spec §10 风险 2（bun:sqlite compile）→ Task 0
- ✅ spec §11 不在范围 → 计划内未触碰 projects / scheduled / customize 子系统

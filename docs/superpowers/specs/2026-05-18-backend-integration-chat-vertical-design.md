# Agent Studio · 后端接入第一阶段（Chat Vertical）Design

> 设计版本 v1 · 2026-05-18
> 状态：待评审

---

## 1. 目标 / 范围

把现有静态 UI 的 **Chat 主干**（NewTask 提交 → TaskView 流式渲染 → DB 持久化 → Sidebar 真实会话列表）端到端接通 Bun sidecar 里的 Claude Agent SDK。打通本片之后，其余 5 个子系统（持久化扩展 / 调度执行器 / 文件系统接入 / 插件&MCP 配置 / 身份与密钥升级）各自独立设计。

**完成态**：
- 用户配 API key → NewTaskView 提交 prompt → TaskView 见流式文本 token → 完整消息入 SQLite → Sidebar Recents 出现该会话 → 重启应用历史还在
- Stop 能中断流并把已生成部分入库；同会话并发提交被服务端 409 拒
- sidecar 后端集成测试全绿（services / routes / SSE 翻译 / abort / 并发）
- `bun run build` + `cargo check` 全绿

**v1 不在范围**：
- Tool 调用（v1 文本-only，PRD 中 bash / fs / web-search 不接）
- Plan card / Artifact / RightPanel files 接真实数据（v1 真实会话下渲染空状态）
- Projects / Scheduled / Customize 视图后端接入（仍走 mock 数据）
- 应用重启自动 resume in-flight 流（重启后中断状态由 UI 显式呈现，用户手动 Resend）
- sidecar 崩溃自动重启
- 多窗口、多 sidecar
- CI

---

## 2. 决策记录

| # | 决策 | 选项与理由 |
|---|---|---|
| D1 | **接入范围** | Chat agent 端到端 vertical（vs 数据 seam 全铺 / 持久化&调度 / 全量后端总览）。理由：核心价值最高，会顺带带出数据 seam 与最小持久化的基础设施 |
| D2 | **Agent SDK 运行形态** | Stateless per turn（vs in-memory session map / 子进程 per turn）。每次 `POST .../messages` 从 DB 重载完整历史给 SDK，依赖 Anthropic prompt caching 抵消重复成本。无会话内存状态、重启 sidecar 不丢业务状态 |
| D3 | **持久化分层** | 混合：SQLite (sidecar bun:sqlite) 存 chat 数据 + tauri-plugin-store (Rust) 存 settings / API key（vs 全 SQLite / 全 plugin-store）。理由：聊天数据需查询/排序/索引，plugin-store JSON KV 不适合；settings 维持现有 Rust 路径，无需绕回 sidecar |
| D4 | **工具范围** | 文本-only（vs WebFetch+WebSearch / +fs / 全套）。理由：MVP 验证主干，先不引入 tool 执行模型 / 沙盒 / 授权 prompt |
| D5 | **API key 渠道** | Settings UI 输入框 + plugin-store 保存 + 启动时 env 注入 sidecar（vs 仅 env / ENV>Settings fallback / OS keychain）。理由：终端用户友好 + 不在 `ps aux` 暴露 + 后续升级 keychain 路径清晰 |
| D6 | **v1 周边接入** | Recents 列表读 DB + Pinned 同步 DB + NewTask Work-in-project 选择带入请求 metadata + Stop 双 abort（vs 仅 Chat 不带周边）。理由：demo 完整度需要这 4 项才不"看着像假的" |
| D7 | **SSE 事件协议** | 服务端翻译 Agent SDK 事件成我们的词表（vs raw 透传）。客户端只认 `text-delta` / `message-start` / `message-stop` / `error` / `aborted`，与 SDK 版本解耦 |
| D8 | **消息存储形态** | `messages.blocks_json` 一列 JSON（vs `content_blocks` 关系表）。v1 只有 text block，关系建模空转 |
| D9 | **mock task.ts 清理** | v1 删除 `src/lib/mock/task.ts`，TaskView 完全走 DB（vs 保留 fallback）。Plan card / RightPanel artifacts 渲染空状态 |

---

## 3. 架构总览 & 数据流

```
┌──────────────────────────────────────────────────────────────────────────┐
│ React (src/)                                                              │
│ ┌────────────────────────────────┐                                        │
│ │ features/new-task NewTaskView  │  PromptInput.onSubmit                  │
│ └────────────────────────────────┘     │                                  │
│ ┌─────────────────────────────────────────────────────┐                   │
│ │ lib/data/conversations.ts (NEW)                     │                   │
│ │   createConversation / listRecents / listPinned     │                   │
│ │   getMessages / sendMessage / abortStream           │                   │
│ │   togglePin / renameConversation / deleteConversation                   │
│ └──────────────┬──────────────────────────────────────┘                   │
│                │ fetchSidecar / subscribeSSE (existing)                   │
│                ▼                                                          │
│           Authorization: Bearer <token>                                   │
└──────────────────────────────────────────────────────────────────────────┘
                                 ↓ HTTP/SSE 127.0.0.1:<port>
┌──────────────────────────────────────────────────────────────────────────┐
│ Bun + Hono sidecar (sidecar/src/)                                        │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ auth middleware (existing — Bearer token)                           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  routes/             ─→  services/                                       │
│   conversations.ts        conversations.ts  (DB CRUD)                    │
│   messages.ts (SSE)       agent.ts          (Agent SDK turn + 翻译)      │
│   settings.ts             apiKey.ts                                      │
│   health.ts                                                              │
│                          ↓                                               │
│   db.ts  bun:sqlite, 路径由 --db=<absPath> CLI 参数传入                  │
│      tables: conversations, messages                                      │
└────┬─────────────────────────────────────────────────────────────────────┘
     │ spawn (--port --token --db, ANTHROPIC_API_KEY env)
     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Tauri Rust shell (src-tauri/src/)                                        │
│   setup():                                                                │
│     port = portpicker, token = rand Alphanumeric                          │
│     db_path = app_data/agent-studio.db                                    │
│     api_key = plugin-store.get("anthropic_api_key").ok()                  │
│     spawn sidecar with args + env ANTHROPIC_API_KEY                       │
│   tauri commands:                                                         │
│     get_sidecar_info() -> { port, token }       (existing)                │
│     set_api_key(key)   -> store.set + 通知前端                            │
│   plugin-store: { theme, language, anthropic_api_key }                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.1 关键数据流：NewTask → 首轮回复

1. `NewTaskView.PromptInput.onSubmit(text)` → `createConversation({ prompt, projectId, mode })`
2. → `POST /conversations` → sidecar 插入 row → 返回 `{ id, title }`
3. 前端 `setActiveTaskId(id)` + `setView("task")`
4. TaskView mount → `getMessages(id)` 拿 user 消息 + `sendMessage(id, prompt)` 触发首轮 SSE
5. Sidecar `POST /conversations/:id/messages`：
   - load history from DB
   - 写入 user 消息 row
   - 调 Agent SDK `query({ messages, apiKey, signal })` 拿 async iterator
   - Hono `streamSSE` 把 iterator events 翻译成 ContentBlock 增量事件发回
   - 流结束后写入 assistant 消息 row（聚合后的完整 blocks + finish_reason）

**conversation 创建与首轮发送解耦**（步骤 2 和 4 是两次调用），不合并成 `POST /conversations` 同步开 SSE — 为后续 Recents 重新发送、resend 等场景留口。

### 3.2 API key 流通

- Rust 启动时从 plugin-store 读 key，**作为环境变量 `ANTHROPIC_API_KEY` 注入 sidecar 子进程**（不走 CLI 参数 — 避免 `ps aux` 暴露）
- 运行时改 key：Settings UI → `invoke('set_api_key', ...)` 写 plugin-store + 前端发 `POST /settings/api-key` 让 sidecar 在内存里热更新（无需重启）

---

## 4. 数据模型 & SSE 协议

### 4.1 SQLite schema (`sidecar/src/db.ts`)

```sql
-- conversations: 一行 = NewTask 提交的一次会话
CREATE TABLE conversations (
  id            TEXT PRIMARY KEY,           -- ulid，由 sidecar 生成
  title         TEXT NOT NULL,              -- 默认取 prompt 前 60 字
  project_id    TEXT,                       -- NewTaskView 选中的 project；NULL = 未关联
  mode          TEXT NOT NULL,              -- "ask" | "agent" (v1 都是文本，先存值供后续区分)
  status        TEXT NOT NULL,              -- "active" | "done" | "failed" | "aborted"
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_conv_updated ON conversations (updated_at DESC);
CREATE INDEX idx_conv_pinned  ON conversations (pinned, updated_at DESC);

-- messages: 一行 = 一次 user / assistant turn
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,           -- "user" | "assistant"
  blocks_json     TEXT NOT NULL,           -- JSON: ContentBlock[]  (v1 只有 text block)
  created_at      INTEGER NOT NULL,
  finish_reason   TEXT,                    -- "end_turn" | "aborted" | "error" | NULL (in-flight)
  error_text      TEXT
);
CREATE INDEX idx_msg_conv ON messages (conversation_id, created_at);
```

**Migrations**：v1 一次性建表，PRAGMA 同设：`journal_mode=WAL; synchronous=NORMAL;`。后续 schema 演进引入版本号列时再做版本化迁移。

### 4.2 TS 类型（手动 mirror 服务端 ↔ 客户端）

`sidecar/src/types.ts` 与 `src/lib/data/types.ts` 同源但分别维护（一个 sidecar 只服务一个客户端，drift 风险可控）：

```ts
export type ContentBlock =
  | { type: "text"; text: string };
  // v1 仅 text block；后续扩展 tool-call-timeline / prose / artifact / brand-star

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  mode: "ask" | "agent";
  status: "active" | "done" | "failed" | "aborted";
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
  finishReason: "end_turn" | "aborted" | "error" | null;
  errorText: string | null;
}
```

### 4.3 SSE 事件词表（`POST /conversations/:id/messages` 响应流）

服务端翻译 Agent SDK 原生事件，客户端只认这套：

| event           | data (JSON)                                | 何时发                          |
|-----------------|--------------------------------------------|---------------------------------|
| `message-start` | `{ messageId, role: "assistant" }`         | Agent SDK message_start         |
| `text-delta`    | `{ messageId, blockIndex: 0, text }`       | content_block_delta(text_delta) |
| `message-stop`  | `{ messageId, finishReason: "end_turn" }`  | message_stop                    |
| `error`         | `{ code, message }`                        | catch 块                        |
| `aborted`       | `{ messageId }`                            | AbortSignal 触发                |

事件名带破折号，与 Agent SDK 原生 snake_case 视觉区分。

### 4.4 REST 端点清单

| Method | Path | 用途 |
|---|---|---|
| GET | `/health` | 已有 |
| POST | `/conversations` | body `{ prompt, projectId?, mode }` → `{ id, title }`，同时插入第一条 user 消息 |
| GET | `/conversations?limit=20&pinned=true` | 列表，按 updated_at DESC |
| GET | `/conversations/:id` | 详情 |
| PATCH | `/conversations/:id` | body `{ title?, pinned? }` |
| DELETE | `/conversations/:id` | cascade messages |
| GET | `/conversations/:id/messages` | 历史消息列表 |
| POST | `/conversations/:id/messages` | body `{ text }` → SSE 流；产出 assistant 消息 |
| POST | `/conversations/:id/abort` | 中断当前 in-flight turn |
| POST | `/settings/api-key` | body `{ apiKey }` → 热更新 sidecar 内存中 key |

---

## 5. 模块边界 & 文件清单

### 5.1 Sidecar (`sidecar/src/`)

```
sidecar/src/
  server.ts              # 改 — argv 加 --db；env 读 ANTHROPIC_API_KEY；挂 routes
  db.ts                  # NEW — bun:sqlite 单例 + migrations()
  types.ts               # NEW — Conversation / Message / ContentBlock / SseEvent
  routes/
    conversations.ts     # NEW
    messages.ts          # NEW — SSE + abort map
    settings.ts          # NEW — POST /settings/api-key
    health.ts            # 已有 /health 迁过来
  services/
    conversations.ts     # NEW — DB CRUD 纯函数
    agent.ts             # NEW — Agent SDK 调用 + 事件翻译
    agent.mock.ts        # NEW — AGENT_SDK_MOCK=1 时替身
    apiKey.ts            # NEW — 内存里的 key state
  lib/
    ulid.ts              # NEW — id 生成
    sse.ts               # NEW — streamSSE 的薄包装
```

**职责切分硬规则**：
- `routes/*` 只做 HTTP 解析 + 调 service + 写响应。**不** 直连 DB / SDK。
- `services/conversations.ts` 只懂 DB。**不** 知道 HTTP。
- `services/agent.ts` 输入 `Message[]` + apiKey + signal，输出 `AsyncIterable<SseEvent>`。**不** 写 DB（DB 写由 message route 在流首尾做）。

理由：可独立 unit test、route 层薄到几乎不需要测。

### 5.2 前端 (`src/`)

```
src/lib/data/
  conversations.ts       # NEW — createConversation / listRecents / listPinned /
                         #        getMessages / sendMessage / abortStream /
                         #        togglePin / renameConversation / deleteConversation
  settings.ts            # NEW — getApiKey / setApiKey
  types.ts               # NEW — mirror sidecar types
  sse.ts                 # NEW — parseSseEvents → AsyncIterable<SseEvent>
```

视图改造（最小）：

| 视图 | 改动 |
|---|---|
| `new-task/NewTaskView.tsx` | `onSubmit` → `await createConversation(...)` → `setActiveTaskId(id)` + `setView("task")` |
| `task/TaskView.tsx` | mount 调 `getMessages(id)` + 视来源决定是否 `sendMessage` 拿 SSE |
| `task/ChatStream.tsx` | 新增 `streaming` prop，最后一条 assistant 显示打字光标 |
| `task/TaskHeader.tsx` | Stop 按钮 → `abortStream(id)` |
| `task/PlanCard.tsx` 等 | v1 真实会话渲染空状态 |
| `sidebar/SidebarContent.tsx` | mount 拉 `listRecents(20)` + `listPinned()` 灌 AppShellContext |
| `settings/SettingsView.tsx` | 新增 "Anthropic API key" password input + Save → `setApiKey` |
| `app/AppShellContext.tsx` | 增 `streamingStore: Map<conversationId, StreamState>`（in-flight SSE 状态）+ `recents` / `pinned` 改异步加载（已有这些字段） |

**保持 mock 不动**：Projects / ProjectDetail / Scheduled / Customize 全部子视图。

**清理**：`src/lib/mock/task.ts` 整文件删除。

### 5.3 Tauri Rust (`src-tauri/src/lib.rs`)

setup() 改：
```rust
let db_path = app.path().app_data_dir()?.join("agent-studio.db");
tokio::fs::create_dir_all(db_path.parent().unwrap()).await?;
let api_key = store.get("anthropic_api_key")
    .and_then(|v| v.as_str().map(String::from));
let mut cmd = app.shell().sidecar("agent-studio-sidecar")?
    .args([
        format!("--port={port}"),
        format!("--token={token}"),
        format!("--db={}", db_path.display()),
    ]);
if let Some(k) = api_key { cmd = cmd.env("ANTHROPIC_API_KEY", k); }
let (_rx, child) = cmd.spawn()?;
```

新增 command：`set_api_key(key: String)` → store.set。

**Capability 改动**（`src-tauri/capabilities/default.json`）：`shell:allow-spawn` 的 args 验证表加 `^--db=.+\.db$`。

### 5.4 不动的部分

- `src/lib/mock/*`（除 task.ts）— 其它视图还在用
- `src/lib/sidecar-client.ts` — `fetchSidecar` / `subscribeSSE` 已经够用
- `sidecar/src/server.ts` 的 auth middleware — 不动

---

## 6. 错误 / 取消 / 边界

### 6.1 错误分类

| 来源 | HTTP / SSE 表现 | 前端处理 |
|---|---|---|
| API key 缺失或无效 | 400 `{ code: "api_key_missing" }` 或 SSE `error { code: "invalid_api_key" }` | TaskView 顶部 banner + 跳 Settings 按钮 |
| Anthropic 上游 5xx / 网络 | SSE `error { code: "upstream_unavailable" }` | inline 错误卡 + Retry（resend last user message） |
| Anthropic 429 | SSE `error { code: "rate_limited", retryAfter? }` | inline 错误卡，文案带 retryAfter |
| sidecar 崩溃 | fetch reject (ECONNREFUSED) | banner "后端连接断开" + `getSidecarInfo` 缓存清空（v1 不自动 respawn） |
| DB 写失败 | 500 `{ error: "db_write_failed" }` | 全局 toast；in-memory 状态保留 |
| 请求被 abort | SSE 流提前结束 + `aborted` 事件 | 最后 assistant 消息打"已停止" + Resend |

### 6.2 取消语义（双 abort）

```
TaskHeader [Stop] →
  lib/data/conversations.abortStream(conversationId):
    1. 本地 AbortController.abort()  → subscribeSSE reader done
    2. POST /conversations/:id/abort  → 通知服务端

sidecar routes/messages.ts POST /:id/abort:
  - 在全局 Map<conversationId, AbortController> 找对应 controller
  - controller.abort()  → Agent SDK query() 持有同 signal → 中断推理
  - 已累积 assistant blocks 写入 DB，finish_reason="aborted"
  - SSE 流前发 `aborted` 事件后关闭
```

**关键**：客户端 abort + 服务端 abort 是两个独立信号。仅关闭 fetch reader 会让 SSE socket 死掉，但 Agent SDK 仍在烧 token。所以**必须**有 `POST /conversations/:id/abort`。

`Map<conversationId, AbortController>` 是 sidecar 内**唯一**允许的"跨请求内存状态"——"stateless per turn"指业务状态，不指底层抽象。

### 6.3 并发约束

- 同一 conversation 同时只能有 1 个 in-flight assistant turn。`POST .../messages` 进入前检查 `inflightControllers.has(conversationId)` → 已存在则 **409** `{ error: "turn_in_progress" }`。
- 不同 conversation 之间可并发，v1 不限制。

### 6.4 Resumption

- **视图切换**：sendMessage 触发的 SSE iterator 在 TaskView 卸载时**继续跑到底**，写入 conversationId-keyed 的 AppShellContext store。TaskView 重挂载时从 store 读。
- **应用重启时正在流式中**：sidecar 被 kill → in-flight turn 丢失。重启后该 conversation 最后 assistant 行 `finish_reason=null` → 前端识别为"残留 in-flight"，渲染"已中断 · Resend"状态。
- v1 不做"应用重启自动 resume"。

### 6.5 安全

- `--db=` 参数 capability validator 限定 `\.db$`；sidecar 启动后用 `path.resolve` 再校验在 app_data 之内
- conversation_id 在 route handler 校验是合法 ulid（防 `../../`、防 SQL injection 作 defense-in-depth）
- API key 不落日志（任何 `console.log` 不打 env、不 stringify 完整 request body）

---

## 7. 测试策略

### 7.1 Sidecar 单元测试（`bun test`）

`sidecar/tests/services/`：

| 文件 | 关键 case |
|---|---|
| `conversations.test.ts` | `Database(":memory:")` + migrations → create / list (updated_at DESC) / pin 影响排序 / delete cascade messages |
| `agent.test.ts` | **不调真 Anthropic**：手写 fake async iterator yield message_start/text_delta×3/message_stop → 验事件翻译产出 `[message-start, text-delta×3, message-stop]`。abort 注入 → 产出 `aborted` |
| `lib/sse.test.ts` | event/data 行分隔、含换行 payload 转义 |
| `lib/ulid.test.ts` | 1000 次无碰撞、字典序递增 |

### 7.2 Sidecar 集成测试

`sidecar/tests/integration/`：启动真 sidecar（临时 db + 假 ANTHROPIC_API_KEY），fetch 直接打：

| 文件 | 关键 case |
|---|---|
| `auth.test.ts` | 无 / 错 token → 401；对 token → 200 |
| `conversations.test.ts` | POST → 200 + id；GET 分页；DELETE cascade |
| `messages.test.ts` | `AGENT_SDK_MOCK=1` → POST .../messages 拿 SSE → 验事件序列 + DB 落盘 finish_reason=end_turn |
| `abort.test.ts` | abort 后 finish_reason=aborted、partial blocks 已持久化、AbortController map 清理 |
| `concurrency.test.ts` | 同 conversation 两次起 → 第二次 409 |

**Agent SDK mock 开关**：`services/agent.ts` 顶层 `if (process.env.AGENT_SDK_MOCK === "1") return import("./agent.mock")`。生产路径**不能**走 mock；CI 集成测试显式开。

### 7.3 前端

v1 **不引入** Vitest / Playwright。手测脚本进 §9 验收清单。

### 7.4 Rust

不加测试。改动量 ~20 行；靠 `cargo check` 防编译破。

### 7.5 CI

v1 不做。下一 wave（打包前）加 GitHub Actions 跑 `bun test` + `cargo check`。

---

## 8. 落地顺序（12 片）

每片是一个独立可验证单元：

| # | 片名 | 改动范围 | 交付时验证 |
|---|---|---|---|
| 1 | DB + types 骨架 | `sidecar/src/db.ts` + migrations、`types.ts`、`lib/ulid.ts`、`services/conversations.ts` + 单测 | `bun test services/conversations.test.ts` 全绿 |
| 2 | conversations REST | `routes/conversations.ts` + 集成测试 | curl POST → 拿 id；GET list 有序；DELETE cascade |
| 3 | API key 通路 | `services/apiKey.ts`、`routes/settings.ts`、Rust env 注入 + `set_api_key` command、Settings UI 输入框 | UI 改 → invoke + POST → sidecar 内存更新；重启读到 |
| 4 | Agent SDK mock 优先接入 | `services/agent.ts` + `agent.mock.ts`、`routes/messages.ts` SSE + abort map + 集成测试 | `AGENT_SDK_MOCK=1 bun test` 全绿（含 abort + 409） |
| 5 | Agent SDK 真接入 | 加真依赖（`@anthropic-ai/agent-sdk` 或对应包），mock flag 未设走真 SDK | curl POST .../messages 带真 key → 见真模型流式 |
| 6 | 前端数据 seam | `src/lib/data/conversations.ts` + `settings.ts` + `sse.ts` | DevTools console `listRecents(10)` 返回空数组 |
| 7 | NewTaskView 接入 | onSubmit → createConversation → setView | 提交 prompt → 切到 task → 见 SSE 帧 |
| 8 | TaskView 流式渲染 | `getMessages` 初始加载、`sendMessage` 增量拼接、PlanCard / RightPanel 走空状态 | 提交 → 文本逐 token 出现 → 停止后整条入 DB |
| 9 | Stop + Resend | TaskHeader Stop → 双 abort；最后消息标记 + Resend | 提交 → 0.5s 内 Stop → 流停 + "已停止" + Resend 可点 |
| 10 | Sidebar Recents + Pinned | SidebarContent mount 拉数据；togglePin 写 DB | 新建 3 会话 → 重启 → Recents 倒序；pin 1 个 → 移到 Pinned |
| 11 | mock task.ts 清理 | 删文件、引用收敛、ChatStream 死分支注释 | `bun run build` 绿 + TaskView 空会话不崩 |
| 12 | 手测脚本 | 跑 §9 全清单 | 全过 |

**依赖图**：1→2→3，1→4→5，2+5→8。6 可与 4 并行（前端 mock SSE 自测）。9 / 10 / 11 在 8 之后。

---

## 9. 端到端验收清单

执行完 12 片后必须跑通：

1. ✅ 全新安装 → 首次启动 → Settings 输 API key → Save → 不重启应用，下一条 prompt 跑通
2. ✅ NewTask 提交 "hello" → 1s 内 TaskView 出现首个 token → 整段 stream 完成 → DB 两行（user + assistant，`finish_reason=end_turn`）
3. ✅ Stop 中断 → DB assistant 行 `finish_reason=aborted`、`blocks_json` 非空（含已生成部分）
4. ✅ 在流式中断 sidecar（kill -9）→ 重启应用 → 该会话最后 assistant 行 `finish_reason=null` → UI 渲染"已中断" + Resend
5. ✅ Sidebar Recents 显示真实新建会话；Pin 持久化跨重启
6. ✅ 同会话连提 2 次 → 第二次 inline 错误"该会话有任务进行中"
7. ✅ 删 API key → 提交 → banner "未配置 API key"
8. ✅ Anthropic 端 401（错 key）→ inline 错误卡 + Retry
9. ✅ `cd sidecar && bun test` 全绿
10. ✅ `bun run build` + `cargo check --manifest-path src-tauri/Cargo.toml` 全绿
11. ✅ Projects / Scheduled / Customize 视图视觉无回归（mock 数据保留显示）

---

## 10. 风险记录

1. **Agent SDK TS 包名 / API 形态未对齐** — 片 5 开干前**先脱产 30 分钟读官方 README**，确认 `query()` 返回值、AbortSignal 传法、token 计数。如果 API 偏差大，回头改 `services/agent.ts` 类型与事件翻译。
2. **bun:sqlite 在 `bun build --compile` 产物里是否可用** — 这是**片 1 第一件事要验**。不能延后。如果不行：备选 A 换 `better-sqlite3`（需 node-gyp，跨平台编译成本上来）；备选 B db 路径走 Rust 侧（sqlx），sidecar 通过额外 HTTP 命令访问。
3. **WAL 锁竞争** — 多 in-flight turn 并发写 messages 表。v1 单 sidecar + 同会话串行，理论上无冲突；保险起见 migrations 时 `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`。
4. **AppShellContext 增 in-flight stream store** — Context value 会再胖一圈。分裂 context 是后续 wave，v1 接受。
5. **API key 明文存 plugin-store** — v1 接受（plugin-store 写在 app_data 下普通 JSON）。下一 wave 接 keychain。
6. **手动 mirror 服务端 ↔ 客户端类型** — v1 接受 drift 风险（只 1 个客户端）。后续若引入第二客户端再考虑代码共享层（git submodule / openapi / 工程脚本同步）。

---

## 11. 不在本 spec 范围（明确列出）

后续每个独立设计：

- **持久化扩展**：projects / scheduled / customize 配置入 DB
- **调度执行器**：Scheduled view frequency + timeOfDay 真实 cron 触发，调起 sidecar 的 conversation turn
- **文件系统接入**：computerContext 路径访问、artifact 写入、TaskView RightPanel 真实文件列表
- **Tool 接入**：bash / fs-read / fs-write / web-search / web-fetch 工具执行模型、授权 prompt、沙盒
- **插件 & MCP 配置**：Customize Skills / Agents / Plugins 子视图的 install / connect / 系统提示词运行时注入
- **身份与密钥升级**：OS keychain（macOS Keychain / Windows Credential Manager）
- **多窗口 / 多 sidecar / 离线模式 / 自动重启**
- **CI / 前端测试框架引入**

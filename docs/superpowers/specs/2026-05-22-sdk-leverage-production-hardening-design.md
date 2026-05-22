# Claude Agent SDK 红利收口 — Production Hardening Phase 1

**Goal:** 用 Claude Agent SDK 已经提供的能力替换 / 补强 sidecar 中自研或缺失的部分，让 cowork 产品在 reliability / security / observability 上达到生产级，同时不引入跟 SDK 无关的工程债务。

**Architecture:** 在 `sidecar/src/agui/provider-claude/provider.ts` 配置 SDK 的 `sandbox` / `hooks` / `prependedSystemPrompt` / `env` 钩子；在 `bridge.ts` 完整消费 SDK 已经发出的事件（usage、permission_denials、SDKAPIError、SDKRetry）；session_id 的事实源迁移到 SDK 自身（通过 `tagSession` + `listSessions` 检索）；新增 `tool_audit` 表承接 hook 写入的合规日志。

**Tech Stack:**
- `@anthropic-ai/claude-agent-sdk` ≥ 0.3.144（当前 `sidecar/package.json` 已对齐）
- Bun + Hono sidecar，SQLite 持久化（已 WAL）
- Tauri v2 / React 19 前端（本 phase 仅 settings + per-thread 工具选择的 UI 改动）

---

## Scope

| # | 项 | SDK 能力 | 替换的当前实现 |
|---|---|---|---|
| T1 | Session 持久化 | `tagSession()` + `listSessions()` | `provider.ts:46` 的 in-memory Map |
| T2 | OS-level sandbox | `sandbox: { enabled, filesystem.allowWrite }` | 字符串路径检查 `sandbox.ts`（保留为 UX 提示） |
| T3 | 审计日志 | `hooks.PreToolUse` + `hooks.PostToolUse` | 无 |
| T4 | 错误事件分类 | 消费 `SDKAPIErrorMessage` + `SDKRetryMessage` | 全部塌缩到 `RUN_ERROR` |
| T5 | SDK 类型迁移 | `SDKMessage` 导出类型 | `bridge.ts:17-64` 手抄的 `Sdk*Like` |
| T6 | Usage / permission_denials 落库 | `SDKResultMessage.usage` / `total_cost_usd` / `permission_denials[]` | 完全忽略 |
| T7 | Per-thread allowedTools | `Options.allowedTools` per-query | `server.ts:95` 硬编码 `["Bash"]` |

## 不在本 phase（独立 sprint）

- A1 multi text-block 消息丢失（bridge 内部 bug）
- A2 tool args 流式（bridge 内部 bug）
- A5 SQLite WAL（已开启）
- A6 CORS lockdown（infra 项）
- B5 abort 与 HITL deferred race
- 多用户认证 / JWT / 多租户 API key
- 自定义 MCP 工具（E2，差异化产品功能，独立 spec）

---

## T1 — Session 持久化（tagSession + listSessions）

**问题点：** `provider.ts:46` `const sessionByThread = new Map<string, string>()` 是进程内存，sidecar 重启 → 所有 thread 失去 resume，体验为"对话突然失忆"。

**设计：** 让 SDK 自己的 JSONL session store 成为唯一事实源。

工作流：

1. **首轮（无 resume）：** 从 `system/init` 消息拿到新分配的 `session_id`，立即调用 `tagSession(session_id, threadId, { dir: ctx.cwd })`。
2. **后续轮（resume）：** 调用 `listSessions({ dir: ctx.cwd })`，`find(s => s.tag === threadId)` 取最新一条，把 `s.sessionId` 作为 `options.resume`。
3. **fallback：** `listSessions` 抛错或返回空 → 当作首轮处理（SDK 会分配新 session_id，再次 tag 即可）。

**关键代码（provider.ts 改造后）：**

```ts
import { listSessions, tagSession } from "@anthropic-ai/claude-agent-sdk";

async function getResumeSessionId(threadId: string, dir: string): Promise<string | undefined> {
  try {
    const sessions = await listSessions({ dir });
    return sessions.find((s) => s.tag === threadId)?.sessionId;
  } catch {
    return undefined;
  }
}

// runTurn:
const resumeSessionId = await getResumeSessionId(ctx.threadId, ctx.cwd);
const sdkStream = sdkQuery({
  prompt,
  options: {
    // ...
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
  },
});

return claudeSdkToAgui(sdkStream, {
  threadId: ctx.threadId,
  runId: ctx.runId,
  callbacks: ctx.callbacks,
  onSessionId: async (sid) => {
    // 首轮：sid 是新的；后续轮：sid 等于 resumeSessionId，tag 已存在 → 幂等
    try {
      await tagSession(sid, ctx.threadId, { dir: ctx.cwd });
    } catch (err) {
      // tag 失败不阻断 turn，但记日志（下一轮 resume 会失败 → 上下文断裂）
      console.error(`[provider] tagSession failed: ${err}`);
    }
  },
});
```

**性能注意：** `listSessions({ dir })` 在某个 cwd 下 session 数量大时扫文件目录。Cowork 用户单 project 一般 < 100 thread，可接受；若 > 500 应回 SQLite 兜底。本 phase 不实现兜底（约束驱动）。

**测试：**
- 首轮 → tag 调用一次，session_id 写入 SDK 文件
- 第二轮 → listSessions 找到 tag，resume 传入 sid
- 模拟 sidecar 重启（清空 provider 内存）→ 第二轮仍然 resume 上一会话
- `listSessions` 抛错 → 当作首轮，模型回应不挂

**Files touched:**
- `sidecar/src/agui/provider-claude/provider.ts`：删 `sessionByThread`，加 `getResumeSessionId` + `tagSession` 在 onSessionId
- `sidecar/src/agui/provider-claude/provider.test.ts`（新增或扩充）

---

## T2 — OS-level sandbox（仅写限制）

**问题点：** `provider.ts:106` 没传 `sandbox`，只靠 `sandbox.ts` 做字符串路径检查 —— 那是 UX 层而非安全边界。模型一旦绕过 canUseTool（理论上 prompt injection 可以让模型构造路径变体），整个用户家目录都暴露。

**设计：** 启用 OS-level sandbox（macOS Seatbelt / Linux bwrap）。

**策略（按 brainstorming 决策：仅写限）：**

```ts
sandbox: {
  enabled: true,
  failIfUnavailable: true,            // 缺 bwrap 立即报错，不静默降级
  autoAllowBashIfSandboxed: true,     // Bash 由 OS 边界保护，自动 allow（HITL 仍可拦截）
  allowUnsandboxedCommands: false,    // 不开逃逸口
  excludedCommands: [],
  filesystem: {
    allowWrite: [ctx.cwd],            // 只能写 thread 的 cwd
  },
  // network 不限（仅写限策略）
},
```

**`sandbox.ts` 的去留：** 保留为 **UX-层快速 deny**。OS 拦截给出的错误信息对模型不够友好；`canUseTool` 提前 deny 并附说明，模型自我纠正更快。但定位明确：**它不是安全边界，OS 才是**。

**`failIfUnavailable: true` 的含义：**
- macOS（Seatbelt 内置）→ 永不触发
- Linux（需要 bwrap）→ 缺 bwrap 时 sidecar 启动后第一个 query 失败，明确日志「sandbox 不可用」；不静默退化到无沙箱
- Windows → SDK 支持有限，跑通后 follow up

**注意 `cwd` 变化：** thread 可能在生命周期内换 `cwd`（用户改 working_dir）。每个 turn 都从 `ctx.cwd` 重读，sandbox 是 per-query 的，无状态。

**Files touched:**
- `sidecar/src/agui/provider-claude/provider.ts`：加 `sandbox` 配置
- `sidecar/src/agui/provider-claude/sandbox.ts`：注释更新（明确「UX 层」定位）
- `sidecar/src/agui/provider-claude/provider.test.ts`：mock query 验证 sandbox 配置传入

**验收：**
- macOS 上 sandbox 启用后，agent 用 Write 写 `/tmp/foo.txt`（cwd 外）→ OS 拒绝（不依赖 canUseTool）
- canUseTool 链路保持工作（HITL 卡片仍出现）
- 关闭 sandbox（dev mode）回归测试通过

---

## T3 — Audit 日志（PreToolUse + PostToolUse hooks）

**问题点：** Cowork 产品 compliance 的核心是「谁、什么时候、用 agent 做了什么」。当前完全没有审计。

**设计：** 新增 `tool_audit` 表，hooks 同步写入。

**表结构（迁移加入 `db.ts`）：**

```sql
CREATE TABLE IF NOT EXISTS tool_audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,
  phase           TEXT NOT NULL CHECK (phase IN ('pre', 'post', 'denied')),
  session_id      TEXT,
  thread_id       TEXT,
  run_id          TEXT,
  tool_name       TEXT NOT NULL,
  tool_use_id     TEXT,
  input_json      TEXT,           -- 已 redact 的 input
  duration_ms     INTEGER,
  is_error        INTEGER NOT NULL DEFAULT 0,
  -- 不加 FK：runs/threads 可被删除，审计是 append-only immutable
  cwd             TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON tool_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_thread ON tool_audit (thread_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON tool_audit (tool_name, ts DESC);
```

**Hook 设计：**

```ts
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

const auditPre: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};
  const redacted = redactSecrets(input.tool_input);
  auditDb.append({
    ts: Date.now(),
    phase: "pre",
    session_id: input.session_id,
    thread_id: threadOf(input.session_id),     // 通过 tagSession 反查
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id,
    input_json: JSON.stringify(redacted),
    cwd: input.cwd,
  });
  return {};
};

const auditPost: HookCallback = async (input) => {
  if (input.hook_event_name !== "PostToolUse") return {};
  auditDb.append({
    ts: Date.now(),
    phase: "post",
    session_id: input.session_id,
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id,
    duration_ms: input.duration_ms,
    cwd: input.cwd,
  });
  return {};
};
```

Provider 注入：

```ts
options: {
  // ...
  hooks: {
    PreToolUse:  [{ hooks: [auditPre], timeout: 2 }],
    PostToolUse: [{ hooks: [auditPost], timeout: 2 }],
  },
}
```

**Redact 规则（`bridge.ts` 既有的 args 字段也走同一函数）：**

```ts
// sidecar/src/agui/provider-claude/redact.ts
const SECRET_KEYS = /(api[_-]?key|token|password|secret|authorization)/i;
const SECRET_VALUE = /(?<=[=:\s])([A-Za-z0-9_\-]{20,})/g;

export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") return input.replace(SECRET_VALUE, "***");
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "***" : redactSecrets(v)]),
    );
  }
  return input;
}
```

**threadId 反查问题：** PreToolUse hook 拿到的是 `session_id`，但我们的业务键是 `thread_id`。两种方案：
- A. **进程内 cache**：provider runTurn 时把 `session_id → threadId` 写进 module-level Map（在 onSessionId 时填充）。简单，但仅当前进程有效。
- B. **每次审计 join SDK listSessions**：太重。

选 A：审计 hook 用 cache 反查；cache miss 时只写 session_id（仍合规，多花一步 SQL 关联）。

**Files touched:**
- `sidecar/src/db.ts`：加 `tool_audit` 表 + 索引
- `sidecar/src/agui/provider-claude/redact.ts`（新）
- `sidecar/src/agui/provider-claude/audit.ts`（新）：hook callbacks + Database insert
- `sidecar/src/agui/provider-claude/provider.ts`：注入 hooks
- `sidecar/src/routes/audit.ts`（新）：`/audit?thread_id=...&since=...` API（cowork UI 后续要用）
- 测试：redact 单测、hook 写入 SQLite 单测

---

## T4 — 错误事件分类

**问题点：** `bridge.ts:442-452` 所有错误塌缩为 `RUN_ERROR`（仅 abort 标 `code: "CANCELLED"`）。UI 没法区分「key 失效」「限流」「网络」。

**设计：** 消费 SDK 已经分类好的事件，扩展 AGUIEvent 的 `code` 字段。

**SDK 提供的错误源（按 sdk.d.ts 实际形状）：**

| SDK 信号 | shape | 我们映射到 |
|---|---|---|
| `SDKAPIRetryMessage { type: 'system', subtype: 'api_retry', attempt, max_retries, retry_delay_ms, error_status, error }` | 上游报错后 SDK 自动重试中 | CUSTOM `agent.retry { attempt, maxRetries, retryDelayMs, errorStatus, error }` |
| `SDKAssistantMessage.error?: SDKAssistantMessageError` | 单条 assistant 消息携带最终错误（耗尽重试或 fatal） | RUN_ERROR `code` 按 enum 映射（见下） |
| `SDKResultError.subtype` | `'error_during_execution' \| 'error_max_turns' \| 'error_max_budget_usd' \| 'error_max_structured_output_retries'` | RUN_ERROR `code` 按 subtype 映射（见下） |
| `AbortError`（既有） | 用户取消 | RUN_ERROR `code: "CANCELLED"` |

**SDKAssistantMessageError enum → 我们的 code：**

| SDK error | 我们的 code |
|---|---|
| `authentication_failed`, `oauth_org_not_allowed` | `AUTH_FAILED` |
| `rate_limit` | `RATE_LIMIT` |
| `server_error` | `UPSTREAM_5XX` |
| `billing_error` | `BILLING_ERROR` |
| `invalid_request`, `model_not_found`, `max_output_tokens`, `unknown` | `MODEL_ERROR` |

**SDKResultError.subtype → 我们的 code：**

| subtype | code |
|---|---|
| `error_max_turns` | `MAX_TURNS` |
| `error_max_budget_usd` | `MAX_BUDGET` |
| `error_during_execution`, `error_max_structured_output_retries` | `EXECUTION_ERROR` |

**bridge.ts 改造（关键 case）：**

```ts
import type {
  SDKAPIRetryMessage,
  SDKAssistantMessage,
  SDKAssistantMessageError,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

function mapAssistantError(e: SDKAssistantMessageError): string {
  switch (e) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return "AUTH_FAILED";
    case "rate_limit": return "RATE_LIMIT";
    case "server_error": return "UPSTREAM_5XX";
    case "billing_error": return "BILLING_ERROR";
    default: return "MODEL_ERROR";
  }
}

// In the for-await loop, NEW cases:

// api_retry comes as type:'system', subtype:'api_retry'
if (m.type === "system" && (m as { subtype?: string }).subtype === "api_retry") {
  const r = m as SDKAPIRetryMessage;
  yield {
    type: EventType.CUSTOM,
    name: "agent.retry",
    value: {
      attempt: r.attempt,
      maxRetries: r.max_retries,
      retryDelayMs: r.retry_delay_ms,
      errorStatus: r.error_status,
      error: r.error,
    },
  } as AGUIEvent;
  continue;
}

// Inside the existing m.type === "assistant" handler, BEFORE persistence:
//   if (am.error) {
//     yield { type: EventType.RUN_ERROR, code: mapAssistantError(am.error), message: am.error } as AGUIEvent;
//     return;
//   }

// Inside the existing m.type === "result" handler, when is_error:
//   const code =
//     r.subtype === "error_max_turns" ? "MAX_TURNS" :
//     r.subtype === "error_max_budget_usd" ? "MAX_BUDGET" :
//     "EXECUTION_ERROR";
//   yield { type: EventType.RUN_ERROR, code, message: ... } as AGUIEvent;
```

**前端联动（按 lib/hooks 架构）：**

不在 `ChatStream.tsx` 里写订阅逻辑。三层落地：

1. **Runtime 层（`src/lib/agui/runtime/reducer.ts`）：** 扩展 ChatState：
   ```ts
   // 在 createInitialState 已有字段之外加：
   errorCode?:
     | "AUTH_FAILED" | "RATE_LIMIT" | "UPSTREAM_5XX" | "BILLING_ERROR"
     | "MODEL_ERROR" | "MAX_TURNS" | "MAX_BUDGET" | "EXECUTION_ERROR"
     | "CANCELLED";
   retry?: { attempt: number; maxRetries: number; retryDelayMs: number; errorStatus: number | null; ts: number };
   ```
   protocol.ts 加 `RUN_ERROR.code` 字段类型，`CUSTOM.agent.retry` 的 value schema。

2. **Hook 层（新文件 `src/lib/agui/react/useRunStatus.ts`）：**
   ```ts
   export function useRunStatus(runId: string | null): {
     status: RunState["status"];
     errorCode?: RunState["errorCode"];
     errorMessage?: string;
     retry?: RunState["retry"];
     isRetryable: boolean;
     isAuthError: boolean;
   };
   ```
   订阅 runtime via `useSyncExternalStore`；派生 `isRetryable` / `isAuthError` 等便利布尔。

3. **组件层（`src/features/task/ChatStream.tsx`）：** 只调 `useRunStatus(runId)` + 渲染。`AUTH_FAILED` → 渲染 `<ApiKeyMissingBanner />`（跳 Settings），`RATE_LIMIT` → `<RetryHint delayMs={retry.delayMs} />`，retry 状态行 → `<RetryingPill attempt={retry.attempt} />`。Banner / Hint / Pill 是 dumb 组件，props 进 JSX 出。

**Files touched:**
- `sidecar/src/agui/provider-claude/bridge.ts`：新 case 分支
- `src/lib/agui/runtime/protocol.ts`：扩 RUN_ERROR.code 类型 + CUSTOM.agent.retry schema
- `src/lib/agui/runtime/reducer.ts`：处理新事件并更新 RunState
- `src/lib/agui/runtime/runtime.test.ts`：reducer 单测覆盖新事件
- `src/lib/agui/react/useRunStatus.ts`（新）
- `src/features/task/ChatStream.tsx`：替换为 useRunStatus
- `src/features/task/ApiKeyMissingBanner.tsx` / `RetryHint.tsx` / `RetryingPill.tsx`（新，dumb 组件）
- `src/i18n/locales/{zh,en}/task.ts`：错误文案

**测试：** mock SDK stream 注入 api_error / retry / abort 三类，断言 bridge 输出对应 code。

---

## T5 — SDK 类型迁移

**问题点：** `bridge.ts:17-64` 手抄了 `SdkContentBlock` / `SdkAssistantLike` / `SdkUserLike` / `SdkResultLike` / `SdkSystemInitLike` / `SdkStreamEventLike`。SDK 升级加字段（最近就加了 `SDKToolProgressMessage` / `SDKPermissionDeniedMessage`）我们要手动跟。`provider.ts:111, 127` 还有两个 `as never`。

**设计：** 直接 import SDK 导出的 discriminated union `SDKMessage`，删本地接口；消除 `as never`。

```ts
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemInitMessage,
  SDKPartialAssistantMessage,
  SDKAPIErrorMessage,
  SDKRetryMessage,
  CanUseTool,
  PermissionResult,
  Options,
} from "@anthropic-ai/claude-agent-sdk";

// bridge.ts
export async function* claudeSdkToAgui(
  sdkStream: AsyncIterable<SDKMessage>,
  opts: BridgeOptions,
): AsyncIterable<AGUIEvent> { /* ... */ }
```

`provider.ts` 的 `canUseTool` 改成 SDK 导出的 `CanUseTool` 签名，第三参数完整字段（`signal` / `suggestions` / `blockedPath`）即可访问。当前先不动 `signal` / `suggestions` 的具体用法（独立 follow-up），只是把类型对齐。

`env` 字段不再 `as never`：SDK 的 `Options['env']` 已经是 `Record<string, string>`。

**Files touched:**
- `sidecar/src/agui/provider-claude/bridge.ts`：删本地 interface，import SDK 类型，按 discriminated union 写 switch
- `sidecar/src/agui/provider-claude/provider.ts`：删 `as never`

**验收：** `bun run tsc -p sidecar/tsconfig.json --noEmit` 通过；bridge.test 全绿。

---

## T6 — Usage / permission_denials 落库

**问题点：** `SDKResultMessage` 携带的 `usage`、`total_cost_usd`、`permission_denials[]` 字段在 `bridge.ts` 完全没被消费。Cowork 产品里"团队本月 AI 消耗"、"模型在尝试越界" 全靠这两个。

**设计：** runs 表加列 + 新增 usage_ledger 时间序列表。

**Schema 变更：**

```sql
-- runs 表加列（用 ensureColumn 迁移）
ALTER TABLE runs ADD COLUMN input_tokens         INTEGER;
ALTER TABLE runs ADD COLUMN output_tokens        INTEGER;
ALTER TABLE runs ADD COLUMN cache_creation_tokens INTEGER;
ALTER TABLE runs ADD COLUMN cache_read_tokens     INTEGER;
ALTER TABLE runs ADD COLUMN total_cost_usd        REAL;
ALTER TABLE runs ADD COLUMN permission_denials    TEXT;  -- JSON array
ALTER TABLE runs ADD COLUMN model_used            TEXT;

-- 新表：时间序列计费/分析
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
```

**bridge.ts → result 处理：**

```ts
if (m.type === "result") {
  const r = m as SDKResultMessage;
  // 既有的 RUN_FINISHED / RUN_ERROR 逻辑保留
  // 新增：在 onMessageEnd / onTerminal 之外，新 callback
  await callbacks?.onRunUsage?.({
    runId: opts.runId,
    threadId: opts.threadId,
    usage: r.usage,
    totalCostUsd: r.total_cost_usd,
    permissionDenials: r.permission_denials,
    model: r.model,
  });
  // ... 原有逻辑
}
```

**ProviderCallbacks 扩展：**

```ts
// agui/core/provider-types.ts
export interface ProviderCallbacks {
  // 既有
  onMessageEnd?: (m: { ... }) => Promise<void>;
  onToolCallEnd?: (t: { ... }) => Promise<void>;
  onToolCallResult?: (t: { ... }) => Promise<void>;
  // 新增
  onRunUsage?: (u: {
    runId: string;
    threadId: string;
    usage: SDKResultMessage["usage"];
    totalCostUsd?: number;
    permissionDenials?: PermissionDenial[];
    model?: string;
  }) => Promise<void>;
}
```

`runWorker` 实现 `onRunUsage`：写 `runs` 表 + append `usage_ledger`。

**API：**
- `GET /usage?from=...&to=...&thread_id=?` → 聚合查询
- 不在本 phase 做 UI 实现，但要把 **data 层 + hook** 准备好，后续 Settings 的"使用统计"页直接接入。

**前端 lib 层准备（不渲染 UI，只准备接入点）：**

- `src/lib/data/usage.ts`（新）：`getUsageSummary({ from, to, threadId? })`、`getUsageLedger(...)` 纯 fetch 函数
- `src/lib/data/usage-queries.ts`（新，或并入 queries.ts）：
  ```ts
  export function useUsageSummary(range: { from: number; to: number; threadId?: string }) {
    return useQuery({ queryKey: ["usage", "summary", range], queryFn: () => getUsageSummary(range), staleTime: 30_000 });
  }
  ```
- 类型 `UsageSummary` / `UsageLedgerEntry` 放 `src/lib/data/types.ts`

UI（Settings 中的图表 / 列表）留作独立 follow-up，但 hook 已经能跑。

**Files touched:**
- `sidecar/src/db.ts`：schema + ensureColumn
- `sidecar/src/agui/core/provider-types.ts`：扩 ProviderCallbacks
- `sidecar/src/agui/provider-claude/bridge.ts`：result 分支调 onRunUsage
- `sidecar/src/agent/runWorker.ts`（或等价文件）：onRunUsage 实现
- `sidecar/src/routes/usage.ts`（新）
- `src/lib/data/usage.ts`（新）
- `src/lib/data/usage-queries.ts`（新或并入 queries.ts）
- `src/lib/data/types.ts`：UsageSummary / UsageLedgerEntry
- 测试：mock result 注入，断言 runs 列 + ledger 行；usage-queries 单测

---

## T7 — Per-thread allowedTools

**问题点：** `server.ts:95` 硬编码 `allowedTools: ["Bash"]`。

**设计：** Settings 提供全局默认，conversations 表加列覆盖。

**Schema 变更：**

```sql
ALTER TABLE conversations ADD COLUMN allowed_tools_json TEXT;
-- NULL = 用全局默认；'[]' = 显式空（只读模式）；'["Bash","Read",...]' = 自定义
```

**全局默认（settings 表，已有 KV 结构）：** key=`allowedTools`，value JSON array。默认 `["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task"]`。

**Provider 构造时合并：**

```ts
function resolveAllowedTools(threadRow: ThreadRow, settings: SettingsService): string[] {
  if (threadRow.allowed_tools_json) return JSON.parse(threadRow.allowed_tools_json);
  return settings.getAllowedTools() ?? DEFAULT_ALLOWED_TOOLS;
}
```

`createClaudeProvider` 改成接收 callback 而不是固定 list：

```ts
opts: ClaudeProviderOptions = {
  // ...
  resolveAllowedTools: (threadId: string) => Promise<string[]>;
}
```

**前端 lib/hooks 落地：**

1. **Data 层（`src/lib/data/thread-tools.ts` 新）：** `getThreadAllowedTools(threadId)` / `setThreadAllowedTools(threadId, tools | null)`；KV 默认 `getDefaultAllowedTools()` / `setDefaultAllowedTools(tools)`。纯 fetch 调用。

2. **Hook 层（`src/lib/data/thread-tools-queries.ts` 新或并入 queries.ts）：**
   ```ts
   export function useThreadAllowedTools(threadId: string | null): {
     tools: string[];                  // 已 resolve（thread 覆盖 || 全局默认）
     overrideMode: "global" | "custom";
     setTools: (tools: string[] | null) => void;   // null → 回到全局默认
     isLoading: boolean;
   };
   export function useDefaultAllowedTools(): {
     tools: string[];
     setTools: (tools: string[]) => void;
   };
   ```
   两个 hook 都用 Tanstack Query + Mutation；mutation 成功后 invalidate `queryKeys.threadTools(id)` / `queryKeys.defaultTools`。

3. **组件层：** Settings 用 `useDefaultAllowedTools`；TaskView 的 RightPanel 用 `useThreadAllowedTools(threadId)`。UI 是 lucide 图标 + checkbox + radio（覆盖默认 / 跟随默认）。**组件不直接 fetch**，全部走 hook。

**Files touched:**
- `sidecar/src/db.ts`
- `sidecar/src/services/threads.ts`：getAllowedTools / setAllowedTools
- `sidecar/src/routes/conversations.ts`：PATCH `/conversations/:id/allowed-tools`
- `sidecar/src/routes/settings.ts`：default allowed tools KV
- `sidecar/src/server.ts`：去掉硬编码，注入 resolveAllowedTools
- `sidecar/src/agui/provider-claude/provider.ts`：runTurn 调 resolveAllowedTools
- `src/lib/data/thread-tools.ts`（新）
- `src/lib/data/thread-tools-queries.ts`（新或并入 queries.ts）：useThreadAllowedTools / useDefaultAllowedTools
- `src/features/settings/SettingsView.tsx`：消费 useDefaultAllowedTools
- `src/features/task/RightPanel.tsx`：消费 useThreadAllowedTools
- `src/i18n/locales/{zh,en}/settings.ts` + `task.ts`：文案

---

## 跨切关注点

### Schema 总迁移（按依赖顺序）

`sidecar/src/db.ts` 的 `migrate()` 内追加：

```ts
// T3
db.exec(`CREATE TABLE IF NOT EXISTS tool_audit (...)`);

// T6
ensureColumn(db, "runs", "input_tokens", "INTEGER");
ensureColumn(db, "runs", "output_tokens", "INTEGER");
ensureColumn(db, "runs", "cache_creation_tokens", "INTEGER");
ensureColumn(db, "runs", "cache_read_tokens", "INTEGER");
ensureColumn(db, "runs", "total_cost_usd", "REAL");
ensureColumn(db, "runs", "permission_denials", "TEXT");
ensureColumn(db, "runs", "model_used", "TEXT");
db.exec(`CREATE TABLE IF NOT EXISTS usage_ledger (...)`);

// T7
ensureColumn(db, "conversations", "allowed_tools_json", "TEXT");
```

老库自动升级，无 destructive 操作。

### 类型边界

`sidecar/src/agui/provider-claude/index.ts` 导出 `SDKMessage` 不出口（仅 provider-internal）。bridge 接收 `AsyncIterable<SDKMessage>`，对外仍是 `AsyncIterable<AGUIEvent>`。

### Frontend lib/hooks 架构（必守）

本 phase 的所有前端落地必须沿用既有三层结构 —— 这层架构 = 此 spec 的硬约束，**禁止**在 `src/features/` 里写 fetch / SSE 订阅 / state 派生逻辑。

```
src/lib/
  agui/
    runtime/        # 框架无关：protocol 类型、reducer、SSE 解析、订阅者注册
    react/          # 仅 React 绑定：useChat / useRunStatus / useAllowedTools 等
                    # 一律 useSyncExternalStore 订阅 runtime；不持有业务 state
  data/             # Tanstack Query 数据访问：fetch 函数 + useQuery/useMutation hook
  hitl-allowlist.ts # 跨 thread 的 module-level 持久化 store（pub/sub + Tauri Store）
  sidecar-client.ts # 底座：fetchSidecar / subscribeSSE
```

**层规则：**

| 层 | 职责 | 禁止 |
|---|---|---|
| `lib/sidecar-client.ts` | HTTP/SSE 底座；注入 Authorization | 业务知识、缓存 |
| `lib/data/*.ts` | 纯 fetch 函数（输入参数 → 返回数据） | React import、缓存逻辑 |
| `lib/data/*-queries.ts` | Tanstack Query hooks（useQuery / useMutation + invalidate） | 直接调 sidecar-client，必须经 data 层 |
| `lib/agui/runtime/*` | 协议解析、reducer、SSE → state 流；订阅者注册（pub/sub） | React import |
| `lib/agui/react/*` | useSyncExternalStore 包 runtime；派生便利 selectors | 业务 state、fetch |
| `src/features/*` 组件 | **只调 hook + 渲染** | 直接 fetch、SSE 订阅、reducer 调用、模块级订阅 |

**新增 hook 命名约定：**

- 服务器状态 → `useXxx` in `lib/data/*-queries.ts`，永远 Tanstack Query
- 实时流 / 推送状态 → `useXxx` in `lib/agui/react/*`，永远 `useSyncExternalStore` 包 runtime store
- 跨会话本地状态（如 allowlist）→ `useXxx` in `lib/*`，`useSyncExternalStore` 包 module-level store

**React 最佳实践兜底（来自 `vercel-react-best-practices` skill，本 phase 严格执行）：**

- `bundle-barrel-imports`：禁止 `index.ts` re-export，组件直接 import 文件路径
- `rerender-derived-state-no-effect`：派生 state 在 render 中算，不要 useEffect + setState
- `rerender-functional-setstate`：setState 用函数式以避免闭包 stale
- `rerender-no-inline-components`：禁止组件内 `function SubBlock(){...}` 内联定义
- `client-swr-dedup` 在我们这里 = Tanstack Query 的去重 / 缓存机制；同一 key 不重复 fetch

**T4 / T6 / T7 三个 task 的前端实现都必须落到上面层级里**。组件文件只看到 hook 返回值；任何 SSE / fetch / 订阅都隐藏在 lib。code review 期间组件文件出现 `subscribeSSE` / `fetchSidecar` / `useEffect` + `addEventListener` = block，不是 nit。

### 性能预算

- `tagSession` 异步，挂在 `onSessionId`，不阻塞 first token（已是 streaming 之后才触发）。
- `listSessions` 在 `runTurn` 开头 await 一次。Cowork 单 project < 100 thread 时实测 < 50ms。如 > 500，加 SQLite 兜底（follow-up）。
- audit hook 是 SQLite 单 INSERT，WAL 模式下 < 1ms。timeout 2s 留余量。
- usage 写入是 1 INSERT runs UPDATE + 1 INSERT ledger，trivial。

### 日志（最小动作）

`console.log("[provider] tagSession failed: ...")` 等关键 fallback 打 stderr。本 phase **不引入** pino / 结构化日志（独立 P2 项）。

---

## Verification

每个 task 独立可验：

1. **T1 session：** 启 sidecar → 起一个 thread 发 5 条消息 → kill sidecar → 重启 → 继续发消息 → SDK 看到完整上下文（验：第 6 条提到第 1 条的内容）。
2. **T2 sandbox：** macOS 上 `ls /Users/.../private` 在 cwd 外 → 模型尝试 Read 该路径 → 收到 OS deny（不是 canUseTool deny）。日志包含 sandbox 关键字。
3. **T3 audit：** 任意 thread 跑 5 个 tool 调用 → `SELECT * FROM tool_audit` 看到 pre/post 各 5 行；模型 prompt 故意带 `API_KEY=xxxx` → input_json 中 redact 为 `***`。
4. **T4 error：** mock 401 → UI 显示「重新配置 API key」按钮；mock 429 → 显示「稍后重试」+ retry 状态行。
5. **T5 types：** `bunx tsc -p sidecar/tsconfig.json --noEmit` 0 errors；grep `as never` 在 provider.ts / bridge.ts 中 0 命中。
6. **T6 usage：** 跑完一个 turn → `runs` 表对应行有 input/output_tokens、total_cost_usd > 0；`usage_ledger` 多一行。
7. **T7 allowed tools：** Settings 把默认改成 `[]` → 新建 thread 模型工具调用全失败；某 thread 单独设为 `["Bash"]` → 该 thread Bash 能用，Read 不能。

End-to-end smoke：

8. `bun run tauri:dev` 起完整应用 → 跑一个含 tool 的对话 → 重启 sidecar 后继续 → tool_audit / usage_ledger 都有数据 → Settings 看到"使用统计"。

---

## 实施顺序

依赖图：

```
T5 (SDK 类型迁移)         ← 没依赖；先做铺路，后面 task 代码都基于新类型
   ↓
T1 (session) ─→ T3 (audit, 依赖 T1 的 threadId 反查)
T2 (sandbox)        ← 独立
T4 (错误事件)        ← 依赖 T5
T6 (usage)          ← 依赖 T5
T7 (per-thread tools) ← 独立
```

并行机会：T2 / T7 在 T5 之后可与 T1/T3/T4/T6 并行。但 subagent-driven 模式下顺序执行更稳，避免 schema 迁移冲突。

推荐顺序：**T5 → T1 → T3 → T2 → T4 → T6 → T7**。

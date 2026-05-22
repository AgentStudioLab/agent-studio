# SDK 红利收口 Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Claude Agent SDK 已有能力替换 / 补强 sidecar 内自研代码，让 cowork 产品在 reliability / security / observability 上达到生产级，前端按 lib/hooks 三层架构（data / runtime / react）严格分层。

**Architecture:** sidecar/src/agui/provider-claude/ 通过 SDK 的 `sandbox` / `hooks` / `tagSession` / 完整消费 `SDKMessage` discriminated union 实现 7 个能力升级；前端在 `src/lib/agui/runtime/` 扩 reducer state、`src/lib/agui/react/` 加 useRunStatus、`src/lib/data/` 加 Tanstack Query 数据 hook；组件层只渲染。

**Tech Stack:**
- Sidecar: Bun + Hono + `@anthropic-ai/claude-agent-sdk@^0.3.144` + bun:sqlite (WAL on)
- Tests: `bun test`（sidecar 和前端共用 bun:test）
- Frontend: React 19 + TypeScript + Tanstack Query (`@tanstack/react-query`) + Tailwind v4 + shadcn

**Spec:** [docs/superpowers/specs/2026-05-22-sdk-leverage-production-hardening-design.md](../specs/2026-05-22-sdk-leverage-production-hardening-design.md)

---

## File Structure

### Sidecar 新增 / 修改

| 文件 | 责任 | 状态 |
|---|---|---|
| `sidecar/src/agui/provider-claude/bridge.ts` | SDK→AGUI 翻译，吃完整 SDKMessage union | 改 |
| `sidecar/src/agui/provider-claude/provider.ts` | SDK 入口；删 Map、加 sandbox、注入 hooks、注入 allowedTools | 改 |
| `sidecar/src/agui/provider-claude/sandbox.ts` | 字符串路径检查；comment 更新为 UX 层 | 改 |
| `sidecar/src/agui/provider-claude/redact.ts` | 工具入参 redact 敏感字段 | 新 |
| `sidecar/src/agui/provider-claude/redact.test.ts` | redact 单测 | 新 |
| `sidecar/src/agui/provider-claude/audit.ts` | PreToolUse / PostToolUse hook callbacks + SQLite insert | 新 |
| `sidecar/src/agui/provider-claude/audit.test.ts` | audit 单测 | 新 |
| `sidecar/src/agui/provider-claude/error-map.ts` | SDKAssistantMessageError / SDKResultError.subtype → 我们的 code | 新 |
| `sidecar/src/agui/provider-claude/error-map.test.ts` | error-map 单测 | 新 |
| `sidecar/src/agui/provider-claude/session-tag.ts` | tagSession / listSessions 工具 | 新 |
| `sidecar/src/agui/provider-claude/session-tag.test.ts` | 单测 | 新 |
| `sidecar/src/agui/provider-claude/bridge.test.ts` | 加 retry / error / usage 用例 | 改 |
| `sidecar/src/agui/core/provider-types.ts` | ProviderCallbacks 加 onRunUsage | 改 |
| `sidecar/src/agent/runWorker.ts` | onRunUsage 实现 | 改 |
| `sidecar/src/db.ts` | tool_audit / usage_ledger / runs 加列 / conversations 加列 | 改 |
| `sidecar/src/services/threads.ts` | getAllowedTools / setAllowedTools | 改 |
| `sidecar/src/services/audit.ts` | tool_audit append + query | 新 |
| `sidecar/src/services/usage.ts` | usage_ledger append + 聚合查询 | 新 |
| `sidecar/src/services/settings-tools.ts` | default allowedTools KV | 新 |
| `sidecar/src/routes/audit.ts` | `GET /audit` | 新 |
| `sidecar/src/routes/usage.ts` | `GET /usage` | 新 |
| `sidecar/src/routes/conversations.ts` | PATCH `/conversations/:id/allowed-tools` | 改 |
| `sidecar/src/routes/settings.ts` | GET/PUT default allowed tools | 改 |
| `sidecar/src/server.ts` | 删除 allowedTools 硬编码，注入 resolveAllowedTools | 改 |

### 前端新增 / 修改

| 文件 | 责任 | 状态 |
|---|---|---|
| `src/lib/agui/runtime/types.ts` | ChatState 加 errorCode / retry 字段 | 改 |
| `src/lib/agui/runtime/reducer.ts` | RUN_ERROR.code / CUSTOM.agent.retry 处理 | 改 |
| `src/lib/agui/runtime/runtime.test.ts` | 新 reducer 单测 | 改 |
| `src/lib/agui/react/useRunStatus.ts` | 派生 hook：errorCode/retry/isRetryable/isAuthError | 新 |
| `src/lib/data/usage.ts` | `getUsageSummary` fetch | 新 |
| `src/lib/data/usage-queries.ts` | `useUsageSummary` Tanstack Query hook | 新 |
| `src/lib/data/thread-tools.ts` | get/set per-thread allowed tools + 全局默认 | 新 |
| `src/lib/data/thread-tools-queries.ts` | `useThreadAllowedTools` / `useDefaultAllowedTools` hooks | 新 |
| `src/lib/data/types.ts` | UsageSummary / ThreadAllowedTools 类型 | 改 |
| `src/features/task/ApiKeyMissingBanner.tsx` | dumb banner | 新 |
| `src/features/task/RetryHint.tsx` | dumb hint | 新 |
| `src/features/task/RetryingPill.tsx` | dumb pill | 新 |
| `src/features/task/ChatStream.tsx` | 消费 useRunStatus | 改 |
| `src/features/settings/SettingsView.tsx` | 默认工具集 UI | 改 |
| `src/features/task/RightPanel.tsx` | per-thread 工具切换 UI | 改 |
| `src/i18n/locales/zh/task.ts` / `en/task.ts` | 错误 / retry 文案 | 改 |
| `src/i18n/locales/zh/settings.ts` / `en/settings.ts` | 默认工具集文案 | 改 |

---

## Tasks

### Task 1: T5 — SDK 类型迁移（基础）

把 bridge.ts 自抄的 `Sdk*Like` 接口替换为 SDK 导出的 discriminated union，去掉 `provider.ts` 的两个 `as never`。后续所有 task 依赖此基础。

**Files:**
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Test: `sidecar/src/agui/provider-claude/bridge.test.ts`（已存在，保持绿）

- [ ] **Step 1: 先确认现有测试基线**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: 全绿（不动测试，只是验证基线）。记录当前 pass 数量。

- [ ] **Step 2: 在 bridge.ts 顶部加 SDK 类型导入，删除本地 Sdk*Like 接口**

把 `sidecar/src/agui/provider-claude/bridge.ts` 第 12-64 行（import + 6 个 interface 定义）改成：

```ts
import { nanoid } from "nanoid";
import { EventType } from "@ag-ui/core";
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AGUIEvent } from "../core/types";
import type { ProviderCallbacks } from "../core/provider-types";
```

（删除所有 `Sdk*Like` 接口；不要保留过渡 alias。）

- [ ] **Step 3: 重写 generator 签名 + 内部消息变量类型**

把 `bridge.ts` 中 generator 签名：

```ts
export async function* claudeSdkToAgui(
  sdkStream: AsyncIterable<SDKMessage>,
  opts: BridgeOptions,
): AsyncIterable<AGUIEvent> {
```

把 `for await (const raw of sdkStream)` 里旧的 `const m = raw as { type?: string }` 等 cast 替换为：

```ts
for await (const m of sdkStream) {
  if (!m || !m.type) continue;
```

对每个 case，替换原 `Sdk*Like` 断言为相应 SDK 类型：
- `m.type === "system"` && `m.subtype === "init"` → `m as SDKSystemMessage`（窄化由 type guard 完成）
- `m.type === "stream_event"` → `m as SDKPartialAssistantMessage`
- `m.type === "assistant"` → `m as SDKAssistantMessage`
- `m.type === "user"` → `m as SDKUserMessage`
- `m.type === "result"` → `m as SDKResultMessage`

注：tool_use / tool_result 内的 content block shape 用 `SDKAssistantMessage["message"]["content"][number]` 推导，避免再造 `SdkContentBlock`。

- [ ] **Step 4: provider.ts 去掉 `as never`**

修改 `sidecar/src/agui/provider-claude/provider.ts`：

```ts
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
```

把 `provider.ts:111` `env: buildEnv() as never,` 改成 `env: buildEnv(),`
把 `provider.ts:127` `canUseTool: canUseTool as never,` 改成 `canUseTool,`

如果 TS 报错说类型不匹配，把 `canUseTool` 本地变量声明改为：

```ts
const canUseTool: CanUseTool = async (toolName, input, sdkOpts) => {
  // 既有 body 保持
};
```

- [ ] **Step 5: TS 编译通过 + 测试通过**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

Run: `cd sidecar && bun test src/agui/provider-claude/`
Expected: 全绿（pass 数等于 Step 1 记录的数量）。

Run: `grep -E '"as never"' sidecar/src/agui/provider-claude/provider.ts sidecar/src/agui/provider-claude/bridge.ts || echo "no matches"`
Expected: `no matches`

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/agui/provider-claude/bridge.ts sidecar/src/agui/provider-claude/provider.ts
git commit -m "refactor(sdk-types): drop hand-rolled SDK interfaces and as-never casts"
```

---

### Task 2: T1a — tagSession 工具 + 首轮调用

抽取 tagSession / getResumeSessionId helper 到 `session-tag.ts`，单测覆盖。Task 2-4 一起完成 session 持久化迁移。

**Files:**
- Create: `sidecar/src/agui/provider-claude/session-tag.ts`
- Create: `sidecar/src/agui/provider-claude/session-tag.test.ts`

- [ ] **Step 1: 写失败的 session-tag 单测**

Create `sidecar/src/agui/provider-claude/session-tag.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { getResumeSessionId, tagThreadSession } from "./session-tag";

describe("getResumeSessionId", () => {
  it("returns sessionId of session tagged with threadId", async () => {
    const fakeList = mock(async () => [
      { sessionId: "s1", tag: "other", lastModified: 1 },
      { sessionId: "s2", tag: "thread-A", lastModified: 2 },
    ]);
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBe("s2");
  });

  it("returns undefined when no session tagged", async () => {
    const fakeList = mock(async () => [
      { sessionId: "s1", tag: undefined, lastModified: 1 },
    ]);
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBeUndefined();
  });

  it("returns undefined when listSessions throws", async () => {
    const fakeList = mock(async () => { throw new Error("boom"); });
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBeUndefined();
  });
});

describe("tagThreadSession", () => {
  it("calls tag fn with sessionId, threadId, dir options", async () => {
    const calls: unknown[] = [];
    const fakeTag = mock(async (sid: string, tag: string, opts?: { dir: string }) => {
      calls.push({ sid, tag, opts });
    });
    await tagThreadSession("s1", "thread-A", "/tmp/proj", fakeTag as never);
    expect(calls).toEqual([{ sid: "s1", tag: "thread-A", opts: { dir: "/tmp/proj" } }]);
  });

  it("swallows error from tag fn and logs", async () => {
    const fakeTag = mock(async () => { throw new Error("perm"); });
    await expect(
      tagThreadSession("s1", "thread-A", "/tmp/proj", fakeTag as never),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — should fail (module missing)**

Run: `cd sidecar && bun test src/agui/provider-claude/session-tag.test.ts`
Expected: FAIL — `Cannot find module './session-tag'`

- [ ] **Step 3: 实现 session-tag.ts**

Create `sidecar/src/agui/provider-claude/session-tag.ts`:

```ts
// Thread ↔ Claude SDK session 的桥接。
// 借助 SDK 的 tagSession / listSessions：每个 thread 对应一个 SDK session，
// 通过 tag 反查 sessionId 实现 resume，避免在 sidecar 进程内维护映射 Map
// （进程重启会丢失）。

import {
  listSessions as sdkListSessions,
  tagSession as sdkTagSession,
} from "@anthropic-ai/claude-agent-sdk";

type ListSessionsFn = typeof sdkListSessions;
type TagSessionFn = typeof sdkTagSession;

/**
 * 在 `dir` 下找 tag === threadId 的 session，返回最新一条的 sessionId。
 * 没找到 / 调用抛错 → 返回 undefined（视为"无可恢复 session，下一轮新建"）。
 *
 * 第三参 `listFn` 仅为单测注入；生产代码省略即可。
 */
export async function getResumeSessionId(
  threadId: string,
  dir: string,
  listFn: ListSessionsFn = sdkListSessions,
): Promise<string | undefined> {
  try {
    const sessions = await listFn({ dir });
    // sessions 是按 lastModified desc 排序；find 取最新匹配项
    return sessions.find((s) => s.tag === threadId)?.sessionId;
  } catch {
    return undefined;
  }
}

/**
 * 把 threadId tag 到 sessionId 上。幂等：重复 tag 同值 SDK 会去重。
 * 失败不抛错——上层不阻断 turn，但下一轮 resume 会失败，模型会丢上下文。
 */
export async function tagThreadSession(
  sessionId: string,
  threadId: string,
  dir: string,
  tagFn: TagSessionFn = sdkTagSession,
): Promise<void> {
  try {
    await tagFn(sessionId, threadId, { dir });
  } catch (err) {
    console.error(`[session-tag] tagSession failed for ${sessionId}/${threadId}:`, err);
  }
}
```

- [ ] **Step 4: Run test — should pass**

Run: `cd sidecar && bun test src/agui/provider-claude/session-tag.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/session-tag.ts sidecar/src/agui/provider-claude/session-tag.test.ts
git commit -m "feat(session-tag): add tagSession/listSessions helpers for thread→session lookup"
```

---

### Task 3: T1b — provider 接入 tagSession，删除 in-memory Map

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`

- [ ] **Step 1: 修改 provider.ts 导入和顶部**

修改 `sidecar/src/agui/provider-claude/provider.ts`：

在顶部 import 区追加：

```ts
import { getResumeSessionId, tagThreadSession } from "./session-tag";
```

删掉 `const sessionByThread = new Map<string, string>();`（约第 46 行）。

- [ ] **Step 2: 改 runTurn — resume 从 SDK 取，onSessionId 落到 SDK tag**

把原来的：

```ts
const resumeSessionId = sessionByThread.get(ctx.threadId);
```

改成：

```ts
const resumeSessionId = await getResumeSessionId(ctx.threadId, ctx.cwd);
```

`runTurn` 函数签名加 `async`（原为同步返回 AsyncIterable）：

```ts
async function runTurn(
  ctx: RunContext | ResumeContext,
  prompt: string,
): Promise<AsyncIterable<AGUIEvent>> {
```

把 `bridge` 调用里的 `onSessionId` 改成：

```ts
onSessionId: (sid) => {
  void tagThreadSession(sid, ctx.threadId, ctx.cwd);
},
```

（注意：原本是 `sessionByThread.set(...)`，现在去掉 Map.set 这行。）

- [ ] **Step 3: 调整 AgentProvider 实现里 run/resume 适配 async**

把：

```ts
run(ctx: RunContext) { return runTurn(ctx, ctx.userMessage.content); },
resume(ctx: ResumeContext) { /* ... */ return runTurn(ctx, payload?.text ?? ""); },
```

改成：

```ts
run(ctx: RunContext) {
  return asyncIterableFromPromise(runTurn(ctx, ctx.userMessage.content));
},
resume(ctx: ResumeContext) {
  const payload = ctx.resumePayload as { text?: string } | null;
  return asyncIterableFromPromise(runTurn(ctx, payload?.text ?? ""));
},
```

在文件底部加 helper（一次性的小工具，放在 createClaudeProvider 之外）：

```ts
function asyncIterableFromPromise<T>(
  p: Promise<AsyncIterable<T>>,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let inner: AsyncIterator<T> | null = null;
      return {
        async next() {
          if (!inner) inner = (await p)[Symbol.asyncIterator]();
          return inner.next();
        },
      };
    },
  };
}
```

- [ ] **Step 4: TS 编译 + 单测**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

Run: `cd sidecar && bun test src/agui/provider-claude/`
Expected: bridge.test 全绿；session-tag.test 5 pass。

Verify Map 真的删了：

Run: `grep -n "sessionByThread" sidecar/src/agui/provider-claude/provider.ts || echo "removed"`
Expected: `removed`

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/provider.ts
git commit -m "feat(session): use SDK tagSession+listSessions instead of in-memory map"
```

---

### Task 4: T2 — SDK sandbox 启用（仅写限制）

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Modify: `sidecar/src/agui/provider-claude/sandbox.ts`（注释）

- [ ] **Step 1: 在 provider.ts 的 runTurn options 加 sandbox 配置**

在 `sdkQuery({ prompt, options: { ... } })` 的 options 对象内追加：

```ts
sandbox: {
  enabled: true,
  failIfUnavailable: true,
  autoAllowBashIfSandboxed: true,
  allowUnsandboxedCommands: false,
  excludedCommands: [],
  filesystem: {
    allowWrite: [ctx.cwd],
  },
  // network 不限——本 phase 决策"仅写限"
},
```

放在 `canUseTool,` 之后、`...(resumeSessionId ? ...)` 之前。

- [ ] **Step 2: 更新 sandbox.ts 文件头注释**

修改 `sidecar/src/agui/provider-claude/sandbox.ts` 第 1-14 行 header 注释为：

```ts
// Workspace path sandbox —— UX 层，**不是**安全边界。
//
// 安全边界由 SDK 的 OS-level sandbox（macOS Seatbelt / Linux bwrap）在
// provider.ts 注入；本文件做的只是字符串路径 fast-deny，目的：
//   - 让模型拿到具体的 deny 原因（OS deny 的消息对模型不够友好）
//   - 避免不必要的 HITL 卡片闪现
//
// 当 OS sandbox 关闭（如未来加 dev mode 开关），这一层就退化为唯一防线，
// 但生产构建中 SDK sandbox 永远 enabled: true。
//
// 范围决策（不变）：
//   - Bash 不在此处沙箱。命令包含 `cd /elsewhere` 之类无法静态检测；
//     OS sandbox + HITL 双保险已足够。
//   - Web 工具 / Task 不走本地路径，pass through。
```

- [ ] **Step 3: TS 编译 + 已有测试不破**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

Run: `cd sidecar && bun test src/agui/provider-claude/sandbox.test.ts`
Expected: 全绿（sandbox.ts 实现未改，注释更新不影响测试）。

- [ ] **Step 4: Provider 集成测试——sandbox config 传到 sdkQuery**

修改/新增 `sidecar/src/agui/provider-claude/provider.test.ts`（如果不存在则创建）：

```ts
import { describe, expect, it, mock } from "bun:test";

// Mock SDK before importing provider
const querySpy = mock(() => ({
  [Symbol.asyncIterator]: async function* () {
    yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s", usage: {}, total_cost_usd: 0, permission_denials: [] };
  },
}));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: querySpy,
  listSessions: async () => [],
  tagSession: async () => {},
}));

const { createClaudeProvider } = await import("./provider");

describe("provider sandbox config", () => {
  it("passes sandbox.filesystem.allowWrite=[cwd] to sdkQuery", async () => {
    const provider = createClaudeProvider({ apiKey: "k", allowedTools: ["Bash"] });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r1",
      threadId: "t1",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    // Drain to ensure the SDK call happened
    for await (const _ of stream) { /* ignore */ }

    expect(querySpy).toHaveBeenCalled();
    const lastCall = querySpy.mock.calls.at(-1)![0] as { options: { sandbox?: { enabled: boolean; filesystem?: { allowWrite?: string[] } } } };
    expect(lastCall.options.sandbox?.enabled).toBe(true);
    expect(lastCall.options.sandbox?.filesystem?.allowWrite).toEqual(["/tmp/proj"]);
  });
});
```

- [ ] **Step 5: Run test — should pass**

Run: `cd sidecar && bun test src/agui/provider-claude/provider.test.ts`
Expected: PASS — 1 test

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/agui/provider-claude/provider.ts sidecar/src/agui/provider-claude/sandbox.ts sidecar/src/agui/provider-claude/provider.test.ts
git commit -m "feat(sandbox): enable SDK OS-level sandbox with allowWrite=[cwd]"
```

---

### Task 5: T3a — tool_audit / usage_ledger / runs 列 schema 迁移

一次性加齐 schema，后续 task 3 / 6 / 7 都依赖它。

**Files:**
- Modify: `sidecar/src/db.ts`
- Create: `sidecar/src/db.test.ts`（若不存在）

- [ ] **Step 1: 写迁移测试**

Create `sidecar/src/db.test.ts`（若已存在则追加 describe）：

```ts
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
});
```

- [ ] **Step 2: Run test — should fail**

Run: `cd sidecar && bun test src/db.test.ts`
Expected: FAIL — `tool_audit` table doesn't exist 等。

- [ ] **Step 3: 修改 db.ts 加 schema**

修改 `sidecar/src/db.ts`：

把 SCHEMA 常量末尾追加：

```sql
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
```

把 `migrate` 函数体改为：

```ts
export function migrate(db: Database): void {
  db.exec(SCHEMA);
  ensureColumn(db, "conversations", "working_dir", "TEXT");
  ensureColumn(db, "conversations", "allowed_tools_json", "TEXT");
  ensureColumn(db, "runs", "input_tokens", "INTEGER");
  ensureColumn(db, "runs", "output_tokens", "INTEGER");
  ensureColumn(db, "runs", "cache_creation_tokens", "INTEGER");
  ensureColumn(db, "runs", "cache_read_tokens", "INTEGER");
  ensureColumn(db, "runs", "total_cost_usd", "REAL");
  ensureColumn(db, "runs", "permission_denials", "TEXT");
  ensureColumn(db, "runs", "model_used", "TEXT");
}
```

- [ ] **Step 4: Run test — should pass**

Run: `cd sidecar && bun test src/db.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/db.ts sidecar/src/db.test.ts
git commit -m "feat(db): add tool_audit/usage_ledger tables, settings KV, run usage columns"
```

---

### Task 6: T3b — redact 工具

**Files:**
- Create: `sidecar/src/agui/provider-claude/redact.ts`
- Create: `sidecar/src/agui/provider-claude/redact.test.ts`

- [ ] **Step 1: 写失败测试**

Create `sidecar/src/agui/provider-claude/redact.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("masks long alphanumeric values after = or :", () => {
    expect(redactSecrets("export API_KEY=sk-abcdefghijklmnop12345"))
      .toBe("export API_KEY=***");
    expect(redactSecrets("token: tk-zzzzzzzzzzzzzzzzzzzzzzzz"))
      .toBe("token: ***");
  });

  it("does not mask short values", () => {
    expect(redactSecrets("port=8080")).toBe("port=8080");
  });

  it("masks string fields whose key looks sensitive", () => {
    const out = redactSecrets({ apiKey: "anything", port: 8080 }) as Record<string, unknown>;
    expect(out.apiKey).toBe("***");
    expect(out.port).toBe(8080);
  });

  it("recurses into nested objects + arrays", () => {
    const input = {
      cmd: "curl -H 'Authorization: Bearer tok-xyzabcdefghijklmnopqrst' x",
      env: [{ password: "secret123456789012345" }],
    };
    const out = redactSecrets(input) as { cmd: string; env: Array<{ password: string }> };
    expect(out.cmd).toContain("Bearer ***");
    expect(out.env[0]!.password).toBe("***");
  });

  it("passes numbers / booleans / null through", () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test — fails (no module)**

Run: `cd sidecar && bun test src/agui/provider-claude/redact.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 redact.ts**

Create `sidecar/src/agui/provider-claude/redact.ts`:

```ts
// 工具入参 / 命令字符串中的敏感值打码。
//
// 用于 tool_audit 写入前清理 input_json，避免 API key / token / 密码
// 落到合规审计表里（审计表是 append-only 不可改，写进去就回不来）。
//
// 策略：
//   - 对象字段名匹配 SECRET_KEYS（api_key/token/password/secret/authorization）
//     → 整个 value 替换为 "***"
//   - 字符串值中匹配 `(=|:)<空白>?<20+ 字符的字母数字横线下划线>` → 该匹配段
//     替换为 "***"
//   - 数字 / 布尔 / null 原样返回

const SECRET_KEYS = /(api[_-]?key|token|password|secret|authorization)/i;
const SECRET_VALUE = /(?<=[=:]\s?)([A-Za-z0-9_\-]{20,})/g;

export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") return input.replace(SECRET_VALUE, "***");
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? "***" : redactSecrets(v),
      ]),
    );
  }
  return input;
}
```

- [ ] **Step 4: Run test — passes**

Run: `cd sidecar && bun test src/agui/provider-claude/redact.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/redact.ts sidecar/src/agui/provider-claude/redact.test.ts
git commit -m "feat(redact): mask secrets in tool input before audit log write"
```

---

### Task 7: T3c — audit service（DB 写入封装）

**Files:**
- Create: `sidecar/src/services/audit.ts`
- Create: `sidecar/src/services/audit.test.ts`

- [ ] **Step 1: 写失败测试**

Create `sidecar/src/services/audit.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { AuditService } from "./audit";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("AuditService", () => {
  it("appendPre stores redacted input", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPre({
      ts: 100,
      sessionId: "sess",
      threadId: "thread",
      runId: "run",
      toolName: "Bash",
      toolUseId: "u1",
      input: { command: "echo API_KEY=sk-abcdefghijklmnop12345" },
      cwd: "/tmp",
    });
    const row = db.prepare("SELECT * FROM tool_audit WHERE phase='pre'").get() as { tool_name: string; input_json: string };
    expect(row.tool_name).toBe("Bash");
    expect(row.input_json).toContain("***");
    expect(row.input_json).not.toContain("sk-abcdefghijklmnop12345");
  });

  it("appendPost stores duration_ms", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPost({
      ts: 100,
      sessionId: "sess",
      toolName: "Read",
      toolUseId: "u1",
      durationMs: 42,
      isError: false,
      cwd: "/tmp",
    });
    const row = db.prepare("SELECT * FROM tool_audit WHERE phase='post'").get() as { duration_ms: number };
    expect(row.duration_ms).toBe(42);
  });

  it("queryByThread returns rows filtered + sorted desc", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPre({ ts: 100, threadId: "A", toolName: "Bash", toolUseId: "u1", input: {}, cwd: "/" });
    svc.appendPre({ ts: 200, threadId: "B", toolName: "Read", toolUseId: "u2", input: {}, cwd: "/" });
    svc.appendPre({ ts: 300, threadId: "A", toolName: "Edit", toolUseId: "u3", input: {}, cwd: "/" });
    const rows = svc.queryByThread("A", 10);
    expect(rows.map((r) => r.toolName)).toEqual(["Edit", "Bash"]);
  });
});
```

- [ ] **Step 2: Run test — fails**

Run: `cd sidecar && bun test src/services/audit.test.ts`
Expected: FAIL — Cannot find module './audit'

- [ ] **Step 3: 实现 AuditService**

Create `sidecar/src/services/audit.ts`:

```ts
import type { Database } from "bun:sqlite";
import { redactSecrets } from "../agui/provider-claude/redact";

export interface AuditPreEntry {
  ts: number;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
  cwd?: string;
}

export interface AuditPostEntry {
  ts: number;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  toolName: string;
  toolUseId: string;
  durationMs?: number;
  isError: boolean;
  cwd?: string;
}

export interface AuditRow {
  id: number;
  ts: number;
  phase: "pre" | "post" | "denied";
  threadId: string | null;
  toolName: string;
  toolUseId: string | null;
  inputJson: string | null;
  durationMs: number | null;
  isError: boolean;
  cwd: string | null;
}

export class AuditService {
  private insertPre: ReturnType<Database["prepare"]>;
  private insertPost: ReturnType<Database["prepare"]>;
  private selectByThread: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.insertPre = db.prepare(`
      INSERT INTO tool_audit (ts, phase, session_id, thread_id, run_id, tool_name, tool_use_id, input_json, cwd)
      VALUES (?, 'pre', ?, ?, ?, ?, ?, ?, ?)
    `);
    this.insertPost = db.prepare(`
      INSERT INTO tool_audit (ts, phase, session_id, thread_id, run_id, tool_name, tool_use_id, duration_ms, is_error, cwd)
      VALUES (?, 'post', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.selectByThread = db.prepare(`
      SELECT id, ts, phase, thread_id AS threadId, tool_name AS toolName, tool_use_id AS toolUseId,
             input_json AS inputJson, duration_ms AS durationMs, is_error AS isError, cwd
      FROM tool_audit WHERE thread_id = ? ORDER BY ts DESC LIMIT ?
    `);
  }

  appendPre(e: AuditPreEntry): void {
    const redacted = JSON.stringify(redactSecrets(e.input));
    this.insertPre.run(
      e.ts,
      e.sessionId ?? null,
      e.threadId ?? null,
      e.runId ?? null,
      e.toolName,
      e.toolUseId,
      redacted,
      e.cwd ?? null,
    );
  }

  appendPost(e: AuditPostEntry): void {
    this.insertPost.run(
      e.ts,
      e.sessionId ?? null,
      e.threadId ?? null,
      e.runId ?? null,
      e.toolName,
      e.toolUseId,
      e.durationMs ?? null,
      e.isError ? 1 : 0,
      e.cwd ?? null,
    );
  }

  queryByThread(threadId: string, limit: number): AuditRow[] {
    return this.selectByThread.all(threadId, limit) as AuditRow[];
  }
}
```

- [ ] **Step 4: Run test — passes**

Run: `cd sidecar && bun test src/services/audit.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/audit.ts sidecar/src/services/audit.test.ts
git commit -m "feat(audit): AuditService with pre/post insertion + per-thread query"
```

---

### Task 8: T3d — audit hooks 接入 provider

**Files:**
- Create: `sidecar/src/agui/provider-claude/audit-hook.ts`
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 实现 audit-hook factory**

Create `sidecar/src/agui/provider-claude/audit-hook.ts`:

```ts
// PreToolUse / PostToolUse hook callbacks.
//
// 同步逻辑只做：拿到 input → 写 AuditService → 返回空 HookOutput。
// 不调 SDK、不 await IO 之外的任何东西，保证 hook 在 CLI 内同步路径 < 1ms。

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { AuditService } from "../../services/audit";

export interface AuditHookContext {
  threadId: string;
  runId: string;
}

export function createAuditHooks(
  audit: AuditService,
  ctx: AuditHookContext,
): { pre: HookCallback; post: HookCallback } {
  const pre: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    audit.appendPre({
      ts: Date.now(),
      sessionId: input.session_id,
      threadId: ctx.threadId,
      runId: ctx.runId,
      toolName: input.tool_name,
      toolUseId: input.tool_use_id,
      input: input.tool_input,
      cwd: input.cwd,
    });
    return {};
  };

  const post: HookCallback = async (input) => {
    if (input.hook_event_name !== "PostToolUse") return {};
    audit.appendPost({
      ts: Date.now(),
      sessionId: input.session_id,
      threadId: ctx.threadId,
      runId: ctx.runId,
      toolName: input.tool_name,
      toolUseId: input.tool_use_id,
      durationMs: input.duration_ms,
      isError: false,
      cwd: input.cwd,
    });
    return {};
  };

  return { pre, post };
}
```

- [ ] **Step 2: 在 provider.ts 注入 hooks**

修改 `sidecar/src/agui/provider-claude/provider.ts`：

`ClaudeProviderOptions` 加字段：

```ts
import type { AuditService } from "../../services/audit";

export interface ClaudeProviderOptions {
  // 既有字段保持
  apiKey: string;
  baseUrl?: string;
  model?: string;
  allowedTools?: string[];
  interruptBus?: InterruptBus;
  /** Optional audit sink. When omitted, no hooks installed. */
  audit?: AuditService;
}
```

在 runTurn 内部，sdkQuery options 加：

```ts
import { createAuditHooks } from "./audit-hook";

// inside runTurn, before sdkQuery:
const auditHooks = opts.audit
  ? createAuditHooks(opts.audit, { threadId: ctx.threadId, runId: ctx.runId })
  : null;

// inside options:
...(auditHooks ? {
  hooks: {
    PreToolUse:  [{ hooks: [auditHooks.pre], timeout: 2 }],
    PostToolUse: [{ hooks: [auditHooks.post], timeout: 2 }],
  },
} : {}),
```

- [ ] **Step 3: server.ts 注入 AuditService**

修改 `sidecar/src/server.ts`：

在 import 区追加：

```ts
import { AuditService } from "./services/audit";
```

在 `const interruptBus = createInterruptBus(...)` 之后追加：

```ts
const audit = new AuditService(db);
```

修改 `buildProvider()`：

```ts
function buildProvider() {
  const key = apiKey.get();
  if (!key) throw new Error("api_key_missing");
  return createClaudeProvider({
    apiKey: key,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL,
    allowedTools: ["Bash"],
    interruptBus,
    audit,            // ← 新增
  });
}
```

- [ ] **Step 4: 写 audit-hook 单测**

Create `sidecar/src/agui/provider-claude/audit-hook.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { AuditService } from "../../services/audit";
import { createAuditHooks } from "./audit-hook";

describe("createAuditHooks", () => {
  it("pre hook writes a row with redacted input", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { pre } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    await pre(
      {
        hook_event_name: "PreToolUse",
        session_id: "s1",
        tool_name: "Bash",
        tool_use_id: "u1",
        tool_input: { command: "echo TOKEN=abcdefghijklmnopqrstuvwxyz" },
        cwd: "/tmp",
        transcript_path: "",
      } as never,
      undefined,
      { signal: new AbortController().signal },
    );

    const row = db.prepare("SELECT * FROM tool_audit").get() as { input_json: string; tool_name: string; thread_id: string };
    expect(row.thread_id).toBe("t");
    expect(row.tool_name).toBe("Bash");
    expect(row.input_json).toContain("***");
  });

  it("post hook writes a row with duration_ms", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { post } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    await post(
      {
        hook_event_name: "PostToolUse",
        session_id: "s1",
        tool_name: "Read",
        tool_use_id: "u1",
        tool_input: { file_path: "/tmp/x" },
        tool_response: "ok",
        duration_ms: 42,
        cwd: "/tmp",
        transcript_path: "",
      } as never,
      undefined,
      { signal: new AbortController().signal },
    );

    const row = db.prepare("SELECT * FROM tool_audit").get() as { duration_ms: number; phase: string };
    expect(row.phase).toBe("post");
    expect(row.duration_ms).toBe(42);
  });

  it("returns no-op output for non-target events", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { pre } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    const out = await pre(
      { hook_event_name: "Notification" } as never,
      undefined,
      { signal: new AbortController().signal },
    );
    expect(out).toEqual({});
    expect(db.prepare("SELECT count(*) as c FROM tool_audit").get()).toEqual({ c: 0 } as never);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd sidecar && bun test src/agui/provider-claude/audit-hook.test.ts`
Expected: PASS — 3 tests

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/agui/provider-claude/audit-hook.ts sidecar/src/agui/provider-claude/audit-hook.test.ts sidecar/src/agui/provider-claude/provider.ts sidecar/src/server.ts
git commit -m "feat(audit): wire PreToolUse/PostToolUse hooks → tool_audit table"
```

---

### Task 9: T3e — `/audit` 路由

**Files:**
- Create: `sidecar/src/routes/audit.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 写路由测试**

Create `sidecar/src/routes/audit.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { AuditService } from "../services/audit";
import { buildAuditRoutes } from "./audit";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const audit = new AuditService(db);
  audit.appendPre({ ts: 100, threadId: "A", toolName: "Bash", toolUseId: "u1", input: {}, cwd: "/" });
  audit.appendPre({ ts: 200, threadId: "A", toolName: "Read", toolUseId: "u2", input: {}, cwd: "/" });
  audit.appendPre({ ts: 300, threadId: "B", toolName: "Edit", toolUseId: "u3", input: {}, cwd: "/" });
  const app = new Hono();
  app.route("/", buildAuditRoutes(audit));
  return app;
}

describe("GET /audit", () => {
  it("returns rows for a thread", async () => {
    const app = makeApp();
    const res = await app.request("/audit?thread_id=A&limit=10");
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Array<{ toolName: string }> };
    expect(body.rows.map((r) => r.toolName)).toEqual(["Read", "Bash"]);
  });

  it("400 when thread_id missing", async () => {
    const app = makeApp();
    const res = await app.request("/audit?limit=10");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/routes/audit.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现路由**

Create `sidecar/src/routes/audit.ts`:

```ts
import { Hono } from "hono";
import type { AuditService } from "../services/audit";

export function buildAuditRoutes(audit: AuditService): Hono {
  const r = new Hono();
  r.get("/audit", (c) => {
    const threadId = c.req.query("thread_id");
    if (!threadId) return c.json({ error: "thread_id required" }, 400);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1000);
    const rows = audit.queryByThread(threadId, limit);
    return c.json({ rows });
  });
  return r;
}
```

- [ ] **Step 4: 接入 server.ts**

修改 `sidecar/src/server.ts`：

import 追加：

```ts
import { buildAuditRoutes } from "./routes/audit";
```

在 `app.route("/", buildRunRoutes(...))` 之后追加：

```ts
app.route("/", buildAuditRoutes(audit));
```

- [ ] **Step 5: Run tests**

Run: `cd sidecar && bun test src/routes/audit.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/routes/audit.ts sidecar/src/routes/audit.test.ts sidecar/src/server.ts
git commit -m "feat(audit): add GET /audit route for per-thread audit log queries"
```

---

### Task 10: T4a — error-map（SDKAssistantMessageError + SDKResultError → code）

**Files:**
- Create: `sidecar/src/agui/provider-claude/error-map.ts`
- Create: `sidecar/src/agui/provider-claude/error-map.test.ts`

- [ ] **Step 1: 写失败测试**

Create `sidecar/src/agui/provider-claude/error-map.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { mapAssistantError, mapResultErrorSubtype } from "./error-map";

describe("mapAssistantError", () => {
  it("maps auth errors", () => {
    expect(mapAssistantError("authentication_failed")).toBe("AUTH_FAILED");
    expect(mapAssistantError("oauth_org_not_allowed")).toBe("AUTH_FAILED");
  });
  it("maps rate_limit", () => {
    expect(mapAssistantError("rate_limit")).toBe("RATE_LIMIT");
  });
  it("maps server_error", () => {
    expect(mapAssistantError("server_error")).toBe("UPSTREAM_5XX");
  });
  it("maps billing_error", () => {
    expect(mapAssistantError("billing_error")).toBe("BILLING_ERROR");
  });
  it("falls back to MODEL_ERROR for unknown enum", () => {
    expect(mapAssistantError("invalid_request")).toBe("MODEL_ERROR");
    expect(mapAssistantError("model_not_found")).toBe("MODEL_ERROR");
    expect(mapAssistantError("max_output_tokens")).toBe("MODEL_ERROR");
    expect(mapAssistantError("unknown")).toBe("MODEL_ERROR");
  });
});

describe("mapResultErrorSubtype", () => {
  it("maps known subtypes", () => {
    expect(mapResultErrorSubtype("error_max_turns")).toBe("MAX_TURNS");
    expect(mapResultErrorSubtype("error_max_budget_usd")).toBe("MAX_BUDGET");
    expect(mapResultErrorSubtype("error_during_execution")).toBe("EXECUTION_ERROR");
    expect(mapResultErrorSubtype("error_max_structured_output_retries")).toBe("EXECUTION_ERROR");
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/agui/provider-claude/error-map.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 error-map.ts**

Create `sidecar/src/agui/provider-claude/error-map.ts`:

```ts
// SDK 错误枚举 → 我们 RUN_ERROR.code 的映射。
//
// 单一映射点：前端 / 文案 / Banner 渲染全凭这套 code。
// SDK 加新 enum 时（authentication_failed 之外）这里要补 case；
// fallback 永远是 MODEL_ERROR（保证 UI 不崩）。

import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";

export type RunErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMIT"
  | "UPSTREAM_5XX"
  | "BILLING_ERROR"
  | "MODEL_ERROR"
  | "MAX_TURNS"
  | "MAX_BUDGET"
  | "EXECUTION_ERROR"
  | "WORKER_ERROR"
  | "CANCELLED";

export function mapAssistantError(e: SDKAssistantMessageError): RunErrorCode {
  switch (e) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return "AUTH_FAILED";
    case "rate_limit":
      return "RATE_LIMIT";
    case "server_error":
      return "UPSTREAM_5XX";
    case "billing_error":
      return "BILLING_ERROR";
    case "invalid_request":
    case "model_not_found":
    case "max_output_tokens":
    case "unknown":
    default:
      return "MODEL_ERROR";
  }
}

export function mapResultErrorSubtype(subtype: string): RunErrorCode {
  switch (subtype) {
    case "error_max_turns": return "MAX_TURNS";
    case "error_max_budget_usd": return "MAX_BUDGET";
    case "error_during_execution":
    case "error_max_structured_output_retries":
    default:
      return "EXECUTION_ERROR";
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `cd sidecar && bun test src/agui/provider-claude/error-map.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/error-map.ts sidecar/src/agui/provider-claude/error-map.test.ts
git commit -m "feat(errors): map SDK error enums to RunErrorCode taxonomy"
```

---

### Task 11: T4b — bridge 消费 retry / assistant.error / result.error

**Files:**
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`
- Modify: `sidecar/src/agui/provider-claude/bridge.test.ts`

- [ ] **Step 1: 写 bridge 测试 — retry 事件**

在 `sidecar/src/agui/provider-claude/bridge.test.ts` 文件末尾追加：

```ts
describe("bridge — retry + error events", () => {
  it("emits CUSTOM agent.retry on api_retry system message", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        max_retries: 5,
        retry_delay_ms: 1500,
        error_status: 503,
        error: "server_error",
      };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const retry = events.find((e) => e.type === "CUSTOM" && (e as { name?: string }).name === "agent.retry");
    expect(retry).toBeDefined();
    expect((retry as { value: { attempt: number } }).value.attempt).toBe(2);
    expect((retry as { value: { retryDelayMs: number } }).value.retryDelayMs).toBe(1500);
  });

  it("emits RUN_ERROR with AUTH_FAILED on assistant message error", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "assistant",
        message: { content: [] },
        error: "authentication_failed",
      };
      yield { type: "result", subtype: "error_during_execution", is_error: true, result: "" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const err = events.find((e) => e.type === "RUN_ERROR");
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe("AUTH_FAILED");
  });

  it("emits RUN_ERROR with MAX_TURNS on result error_max_turns", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield { type: "result", subtype: "error_max_turns", is_error: true, result: "" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const err = events.find((e) => e.type === "RUN_ERROR");
    expect((err as { code: string }).code).toBe("MAX_TURNS");
  });
});
```

- [ ] **Step 2: Run — fails (no handling)**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: FAIL — retry / AUTH_FAILED / MAX_TURNS 用例失败

- [ ] **Step 3: 修改 bridge.ts 加 cases**

修改 `sidecar/src/agui/provider-claude/bridge.ts`：

顶部 import 追加：

```ts
import type { SDKAPIRetryMessage } from "@anthropic-ai/claude-agent-sdk";
import { mapAssistantError, mapResultErrorSubtype } from "./error-map";
```

**在 `m.type === "system"` 的 case 内**，把：

```ts
if (m.type === "system") {
  const init = m as Partial<SdkSystemInitLike>;
  if (init.subtype === "init" && typeof init.session_id === "string") {
    onSessionId?.(init.session_id);
  }
  continue;
}
```

改成：

```ts
if (m.type === "system") {
  const sys = m as { subtype?: string; session_id?: string };
  if (sys.subtype === "init" && typeof sys.session_id === "string") {
    onSessionId?.(sys.session_id);
  } else if (sys.subtype === "api_retry") {
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
  }
  continue;
}
```

**在 `m.type === "assistant"` 的 case 开头**（处理之前），追加：

```ts
if (m.type === "assistant") {
  const am = m as SDKAssistantMessage;
  if (am.error) {
    yield {
      type: EventType.RUN_ERROR,
      code: mapAssistantError(am.error),
      message: am.error,
    } as AGUIEvent;
    return;
  }
  // 既有 assistant 处理逻辑保留
```

**在 `m.type === "result"` 的 `if (r.is_error)` 分支**，替换：

```ts
if (r.is_error) {
  yield {
    type: EventType.RUN_ERROR,
    message: r.result ?? "agent error",
  } as AGUIEvent;
}
```

为：

```ts
if (r.is_error) {
  const subtype = (r as { subtype?: string }).subtype ?? "";
  yield {
    type: EventType.RUN_ERROR,
    code: mapResultErrorSubtype(subtype),
    message: r.result ?? subtype ?? "agent error",
  } as AGUIEvent;
}
```

- [ ] **Step 4: Run — passes**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: PASS — 既有用例 + 3 新用例

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/bridge.ts sidecar/src/agui/provider-claude/bridge.test.ts
git commit -m "feat(errors): bridge SDK retry/assistant-error/result-error to RUN_ERROR codes"
```

---

### Task 12: T6a — onRunUsage callback 类型扩展

**Files:**
- Modify: `sidecar/src/agui/core/provider-types.ts`

- [ ] **Step 1: 加 onRunUsage 类型**

修改 `sidecar/src/agui/core/provider-types.ts` 的 `ProviderCallbacks` interface，末尾追加：

```ts
import type { SDKPermissionDenial } from "@anthropic-ai/claude-agent-sdk";

export interface ProviderCallbacks {
  // 既有 onMessageEnd / onToolCallEnd / onToolCallResult 保持
  // ...

  /**
   * 调用一次于每个 SDKResultMessage（成功 / 失败都触发）。
   * runWorker 收到后写 runs 表 + usage_ledger 一行。
   */
  onRunUsage?: (u: {
    runId: string;
    threadId: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCostUsd: number;
    permissionDenials: SDKPermissionDenial[];
    model?: string;
  }) => void | Promise<void>;
}
```

- [ ] **Step 2: TS 编译通过**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/agui/core/provider-types.ts
git commit -m "feat(callbacks): add onRunUsage to ProviderCallbacks"
```

---

### Task 13: T6b — bridge.ts 在 result 触发 onRunUsage

**Files:**
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`
- Modify: `sidecar/src/agui/provider-claude/bridge.test.ts`

- [ ] **Step 1: 写测试**

在 `bridge.test.ts` 文件末尾追加：

```ts
describe("bridge — usage callback", () => {
  it("invokes onRunUsage with totals from result.usage", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "done",
        session_id: "s1",
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 50,
        },
        total_cost_usd: 0.0123,
        permission_denials: [{ tool_name: "Bash", input: {} }],
      };
    })();

    const usageCalls: unknown[] = [];
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        callbacks: {
          onRunUsage: (u) => { usageCalls.push(u); },
        },
      }),
    );

    expect(usageCalls).toHaveLength(1);
    const call = usageCalls[0] as { inputTokens: number; outputTokens: number; cacheReadTokens: number; totalCostUsd: number };
    expect(call.inputTokens).toBe(100);
    expect(call.outputTokens).toBe(200);
    expect(call.cacheReadTokens).toBe(50);
    expect(call.totalCostUsd).toBe(0.0123);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: FAIL — usageCalls 是空

- [ ] **Step 3: 修改 bridge.ts result 分支**

在 `m.type === "result"` 处理块内，**在** `closeReasoningBlock` 调用之前，加：

```ts
if (m.type === "result") {
  const r = m as SDKResultMessage;
  // Usage 触发：成功 / 失败都执行（失败时 permission_denials 也能拿到）
  if (callbacks?.onRunUsage) {
    const usage = r.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | undefined;
    await callbacks.onRunUsage({
      runId: opts.runId,
      threadId: opts.threadId,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      totalCostUsd: r.total_cost_usd ?? 0,
      permissionDenials: r.permission_denials ?? [],
      model: (r as { modelUsage?: Record<string, unknown> }).modelUsage
        ? Object.keys((r as { modelUsage: Record<string, unknown> }).modelUsage)[0]
        : undefined,
    });
  }
  // 既有的 endR / TEXT_MESSAGE_END / RUN_FINISHED / RUN_ERROR 逻辑保留
```

注意：`opts` 包含 `runId` / `threadId` —— bridge.ts 当前 `BridgeOptions` 已有这两个字段。

- [ ] **Step 4: Run — passes**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/bridge.ts sidecar/src/agui/provider-claude/bridge.test.ts
git commit -m "feat(usage): bridge fires onRunUsage with SDK result usage+denials"
```

---

### Task 14: T6c — UsageService + runWorker 写入

**Files:**
- Create: `sidecar/src/services/usage.ts`
- Create: `sidecar/src/services/usage.test.ts`
- Modify: `sidecar/src/agent/runWorker.ts`

- [ ] **Step 1: 写 UsageService 测试**

Create `sidecar/src/services/usage.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { UsageService } from "./usage";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  // seed a run row
  db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 'x', 1, 1)`);
  db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
  return db;
}

describe("UsageService", () => {
  it("recordRun updates runs columns + inserts ledger row", () => {
    const db = makeDb();
    const svc = new UsageService(db);
    svc.recordRun({
      runId: "r1",
      threadId: "t1",
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 50,
      totalCostUsd: 0.0123,
      permissionDenials: [{ tool_name: "Bash" } as never],
      model: "claude-opus-4-7",
    });
    const run = db.prepare("SELECT * FROM runs WHERE id='r1'").get() as { input_tokens: number; output_tokens: number; total_cost_usd: number; model_used: string; permission_denials: string };
    expect(run.input_tokens).toBe(100);
    expect(run.output_tokens).toBe(200);
    expect(run.total_cost_usd).toBe(0.0123);
    expect(run.model_used).toBe("claude-opus-4-7");
    expect(JSON.parse(run.permission_denials)).toHaveLength(1);

    const ledger = db.prepare("SELECT * FROM usage_ledger WHERE run_id='r1'").get() as { input_tokens: number; cost_usd: number };
    expect(ledger.input_tokens).toBe(100);
    expect(ledger.cost_usd).toBe(0.0123);
  });

  it("summary aggregates by time range", () => {
    const db = makeDb();
    const svc = new UsageService(db);
    svc.recordRun({ runId: "r1", threadId: "t1", inputTokens: 10, outputTokens: 20, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.01, permissionDenials: [], model: "m" });
    // backdate ledger row to 100
    db.exec("UPDATE usage_ledger SET ts = 100 WHERE run_id='r1'");
    svc.recordRun({ runId: "r2", threadId: "t1", inputTokens: 5, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.005, permissionDenials: [], model: "m" });

    const sum = svc.summary({ from: 0, to: 150 });
    expect(sum.inputTokens).toBe(10);
    expect(sum.outputTokens).toBe(20);
    expect(sum.totalCostUsd).toBeCloseTo(0.01, 6);
  });
});
```

注意：测试里 `recordRun` 的 r2 不更新 runs 表 r2（不存在），但 ledger insert 不依赖 runs FK，所以 OK；上面用 INSERT OR IGNORE 处理 runs update。

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/services/usage.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 UsageService**

Create `sidecar/src/services/usage.ts`:

```ts
import type { Database } from "bun:sqlite";
import type { SDKPermissionDenial } from "@anthropic-ai/claude-agent-sdk";

export interface RunUsageRecord {
  runId: string;
  threadId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  permissionDenials: SDKPermissionDenial[];
  model?: string;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  runCount: number;
}

export class UsageService {
  private updateRun: ReturnType<Database["prepare"]>;
  private insertLedger: ReturnType<Database["prepare"]>;
  private aggregate: ReturnType<Database["prepare"]>;
  private aggregateByThread: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.updateRun = db.prepare(`
      UPDATE runs SET
        input_tokens = ?, output_tokens = ?,
        cache_creation_tokens = ?, cache_read_tokens = ?,
        total_cost_usd = ?, permission_denials = ?, model_used = ?
      WHERE id = ?
    `);
    this.insertLedger = db.prepare(`
      INSERT INTO usage_ledger (ts, run_id, thread_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.aggregate = db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0)  AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cache_creation_tokens), 0) AS cacheCreationTokens,
        COALESCE(SUM(cache_read_tokens), 0)     AS cacheReadTokens,
        COALESCE(SUM(cost_usd), 0)              AS totalCostUsd,
        COUNT(DISTINCT run_id)                  AS runCount
      FROM usage_ledger WHERE ts >= ? AND ts < ?
    `);
    this.aggregateByThread = db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0)  AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cache_creation_tokens), 0) AS cacheCreationTokens,
        COALESCE(SUM(cache_read_tokens), 0)     AS cacheReadTokens,
        COALESCE(SUM(cost_usd), 0)              AS totalCostUsd,
        COUNT(DISTINCT run_id)                  AS runCount
      FROM usage_ledger WHERE ts >= ? AND ts < ? AND thread_id = ?
    `);
  }

  recordRun(r: RunUsageRecord): void {
    this.updateRun.run(
      r.inputTokens, r.outputTokens,
      r.cacheCreationTokens, r.cacheReadTokens,
      r.totalCostUsd, JSON.stringify(r.permissionDenials), r.model ?? null,
      r.runId,
    );
    this.insertLedger.run(
      Date.now(), r.runId, r.threadId, r.model ?? null,
      r.inputTokens, r.outputTokens,
      r.cacheCreationTokens, r.cacheReadTokens, r.totalCostUsd,
    );
  }

  summary(range: { from: number; to: number; threadId?: string }): UsageSummary {
    const row = range.threadId
      ? (this.aggregateByThread.get(range.from, range.to, range.threadId) as UsageSummary)
      : (this.aggregate.get(range.from, range.to) as UsageSummary);
    return row;
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `cd sidecar && bun test src/services/usage.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: runWorker 接入**

修改 `sidecar/src/agent/runWorker.ts`：

文件顶部 import 区追加：

```ts
import type { UsageService } from "../services/usage";
```

`RunWorkerInput` 加字段：

```ts
export interface RunWorkerInput {
  // 既有字段...
  usage: UsageService;
}
```

runWorker 函数 callbacks 对象内追加：

```ts
const callbacks: ProviderCallbacks = {
  // 既有 onMessageEnd / onToolCallEnd / onToolCallResult 保持
  onRunUsage(u) {
    input.usage.recordRun({
      runId: u.runId,
      threadId: u.threadId,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheCreationTokens: u.cacheCreationTokens,
      cacheReadTokens: u.cacheReadTokens,
      totalCostUsd: u.totalCostUsd,
      permissionDenials: u.permissionDenials,
      model: u.model,
    });
  },
};
```

修改 `sidecar/src/server.ts`：

import 追加：

```ts
import { UsageService } from "./services/usage";
```

在 `const audit = new AuditService(db);` 之后追加：

```ts
const usage = new UsageService(db);
```

修改 `buildRunRoutes` 调用，把 `usage` 透传（如果 runs 路由通过工厂注入 runWorker 依赖）。打开 `sidecar/src/routes/runs.ts` 找到 runWorker 调用处，加 `usage` 参数。如果 buildRunRoutes 签名需要改，做对应改动。

具体改动（取决于 runs.ts 当前 shape）：定位到调用 `runWorker(...)` 的位置，把 `usage` 传入。

- [ ] **Step 6: 编译 + 测试**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

Run: `cd sidecar && bun test`
Expected: 所有既有测试 + 新测试全绿

- [ ] **Step 7: Commit**

```bash
git add sidecar/src/services/usage.ts sidecar/src/services/usage.test.ts sidecar/src/agent/runWorker.ts sidecar/src/server.ts sidecar/src/routes/runs.ts
git commit -m "feat(usage): UsageService + runWorker writes usage_ledger + runs columns"
```

---

### Task 15: T6d — `/usage` 路由

**Files:**
- Create: `sidecar/src/routes/usage.ts`
- Create: `sidecar/src/routes/usage.test.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 写测试**

Create `sidecar/src/routes/usage.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { UsageService } from "../services/usage";
import { buildUsageRoutes } from "./usage";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 'x', 1, 1)`);
  db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
  const usage = new UsageService(db);
  usage.recordRun({ runId: "r1", threadId: "t1", inputTokens: 100, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 50, totalCostUsd: 0.01, permissionDenials: [], model: "m" });
  const app = new Hono();
  app.route("/", buildUsageRoutes(usage));
  return { app, db };
}

describe("GET /usage", () => {
  it("returns aggregate within range", async () => {
    const { app } = makeApp();
    const res = await app.request("/usage?from=0&to=99999999999");
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: { inputTokens: number; totalCostUsd: number } };
    expect(body.summary.inputTokens).toBe(100);
    expect(body.summary.totalCostUsd).toBeCloseTo(0.01, 6);
  });

  it("400 when from/to missing or invalid", async () => {
    const { app } = makeApp();
    expect((await app.request("/usage")).status).toBe(400);
    expect((await app.request("/usage?from=abc&to=1")).status).toBe(400);
  });

  it("filters by thread_id when provided", async () => {
    const { app } = makeApp();
    const res = await app.request("/usage?from=0&to=99999999999&thread_id=does-not-exist");
    const body = await res.json() as { summary: { inputTokens: number } };
    expect(body.summary.inputTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/routes/usage.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现路由**

Create `sidecar/src/routes/usage.ts`:

```ts
import { Hono } from "hono";
import type { UsageService } from "../services/usage";

export function buildUsageRoutes(usage: UsageService): Hono {
  const r = new Hono();
  r.get("/usage", (c) => {
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const from = fromStr ? Number.parseInt(fromStr, 10) : NaN;
    const to = toStr ? Number.parseInt(toStr, 10) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return c.json({ error: "from/to must be integers (ms epoch)" }, 400);
    }
    const threadId = c.req.query("thread_id");
    const summary = usage.summary({ from, to, threadId });
    return c.json({ summary });
  });
  return r;
}
```

- [ ] **Step 4: server.ts 接入路由**

在 `sidecar/src/server.ts` import 区追加：

```ts
import { buildUsageRoutes } from "./routes/usage";
```

在 `app.route("/", buildAuditRoutes(audit));` 之后追加：

```ts
app.route("/", buildUsageRoutes(usage));
```

- [ ] **Step 5: Run — passes**

Run: `cd sidecar && bun test src/routes/usage.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/routes/usage.ts sidecar/src/routes/usage.test.ts sidecar/src/server.ts
git commit -m "feat(usage): add GET /usage summary route"
```

---

### Task 16: T6e — 前端 data 层 + Tanstack Query hook

**Files:**
- Create: `src/lib/data/usage.ts`
- Create: `src/lib/data/usage-queries.ts`
- Create: `src/lib/data/usage-queries.test.tsx`
- Modify: `src/lib/data/types.ts`

- [ ] **Step 1: 加类型**

修改 `src/lib/data/types.ts`，文件末尾追加：

```ts
export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  runCount: number;
}
```

- [ ] **Step 2: 实现 fetch 函数**

Create `src/lib/data/usage.ts`:

```ts
import { authedFetch } from "@/lib/sidecar-client";
import type { UsageSummary } from "./types";

export async function getUsageSummary(range: {
  from: number;
  to: number;
  threadId?: string;
}): Promise<UsageSummary> {
  const url = new URL("/usage", "http://placeholder");
  url.searchParams.set("from", String(range.from));
  url.searchParams.set("to", String(range.to));
  if (range.threadId) url.searchParams.set("thread_id", range.threadId);
  const res = await authedFetch(url.pathname + url.search);
  if (!res.ok) throw new Error(`getUsageSummary failed: ${res.status}`);
  const body = (await res.json()) as { summary: UsageSummary };
  return body.summary;
}
```

- [ ] **Step 3: 加 hook**

Create `src/lib/data/usage-queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getUsageSummary } from "./usage";
import type { UsageSummary } from "./types";

export const usageQueryKeys = {
  summary: (range: { from: number; to: number; threadId?: string }) =>
    ["usage", "summary", range.from, range.to, range.threadId ?? null] as const,
};

export function useUsageSummary(range: {
  from: number;
  to: number;
  threadId?: string;
}) {
  return useQuery<UsageSummary>({
    queryKey: usageQueryKeys.summary(range),
    queryFn: () => getUsageSummary(range),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: 写 hook 测试**

Create `src/lib/data/usage-queries.test.tsx`:

```tsx
import { describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUsageSummary } from "./usage-queries";

// Mock the fetch layer
mock.module("@/lib/sidecar-client", () => ({
  authedFetch: async (path: string) => {
    if (path.startsWith("/usage")) {
      return new Response(JSON.stringify({ summary: { inputTokens: 100, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.01, runCount: 1 } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  },
}));

describe("useUsageSummary", () => {
  it("fetches and returns summary", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useUsageSummary({ from: 0, to: Date.now() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.inputTokens).toBe(100);
    expect(result.current.data?.totalCostUsd).toBeCloseTo(0.01, 6);
  });
});
```

注：如果 `@testing-library/react` 未装：`bun add -d @testing-library/react @testing-library/jest-dom react-dom`。若已装则跳过。

- [ ] **Step 5: Run tests + TS**

Run: `bun test src/lib/data/usage-queries.test.tsx`
Expected: PASS — 1 test

Run: `bunx tsc -b`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/usage.ts src/lib/data/usage-queries.ts src/lib/data/usage-queries.test.tsx src/lib/data/types.ts
git commit -m "feat(usage): frontend useUsageSummary hook with Tanstack Query"
```

---

### Task 17: T4c — runtime reducer 处理 errorCode + retry

**Files:**
- Modify: `src/lib/agui/runtime/types.ts`
- Modify: `src/lib/agui/runtime/reducer.ts`
- Modify: `src/lib/agui/runtime/runtime.test.ts`

- [ ] **Step 1: 扩 ChatState 类型**

修改 `src/lib/agui/runtime/types.ts` `ChatState` interface 末尾追加：

```ts
export interface ChatState {
  // 既有字段保持
  // ...
  /** RUN_ERROR 携带的归一化错误码 */
  errorCode?: RunErrorCode;
  /** 最近一次 retry 状态 */
  retry?: RetryState;
}

export type RunErrorCode =
  | "AUTH_FAILED" | "RATE_LIMIT" | "UPSTREAM_5XX" | "BILLING_ERROR"
  | "MODEL_ERROR" | "MAX_TURNS" | "MAX_BUDGET" | "EXECUTION_ERROR"
  | "WORKER_ERROR" | "CANCELLED";

export interface RetryState {
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  errorStatus: number | null;
  error: string;
  ts: number;
}
```

`createInitialState` 不需要改（新字段都 optional）。

- [ ] **Step 2: 写 reducer 测试**

修改 `src/lib/agui/runtime/runtime.test.ts`，文件末尾追加（保留现有用例）：

```ts
import { applyEvent } from "./reducer";
import { createInitialState } from "./types";

describe("reducer — error code + retry", () => {
  it("RUN_ERROR with code sets errorCode", () => {
    const s = applyEvent(
      createInitialState(),
      { type: "RUN_ERROR", code: "AUTH_FAILED", message: "authentication_failed" },
      new Map(),
    );
    expect(s.errorCode).toBe("AUTH_FAILED");
    expect(s.error).toBe("authentication_failed");
  });

  it("CUSTOM agent.retry sets retry state", () => {
    const s = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.retry",
        value: { attempt: 2, maxRetries: 5, retryDelayMs: 1500, errorStatus: 503, error: "server_error" },
      },
      new Map(),
    );
    expect(s.retry?.attempt).toBe(2);
    expect(s.retry?.retryDelayMs).toBe(1500);
  });

  it("RUN_FINISHED clears retry", () => {
    let s = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.retry",
        value: { attempt: 1, maxRetries: 5, retryDelayMs: 1000, errorStatus: 503, error: "server_error" },
      },
      new Map(),
    );
    s = applyEvent(s, { type: "RUN_FINISHED", threadId: "t", runId: "r" }, new Map());
    expect(s.retry).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `bun test src/lib/agui/runtime/runtime.test.ts`
Expected: FAIL — errorCode / retry 不被处理

- [ ] **Step 4: 修改 reducer.ts**

修改 `src/lib/agui/runtime/reducer.ts` 的 switch：

把现有 `case "RUN_ERROR":` 替换为：

```ts
case "RUN_ERROR": {
  const code = (event as { code?: string }).code;
  const message = (event as { message?: string }).message;
  next = {
    ...next,
    liveMessages: sweepPendingToolCalls(next.liveMessages),
    error: message ?? next.error ?? null,
    errorCode: typeof code === "string" ? (code as never) : next.errorCode,
  };
  break;
}
```

在 switch 末尾（`default:` 之前）追加：

```ts
case "CUSTOM": {
  const name = (event as { name?: string }).name;
  if (name === "agent.retry") {
    const value = (event as { value?: Record<string, unknown> }).value ?? {};
    next = {
      ...next,
      retry: {
        attempt: Number(value.attempt ?? 0),
        maxRetries: Number(value.maxRetries ?? 0),
        retryDelayMs: Number(value.retryDelayMs ?? 0),
        errorStatus: (value.errorStatus as number | null) ?? null,
        error: String(value.error ?? ""),
        ts: Date.now(),
      },
    };
  }
  break;
}
```

把 `case "RUN_FINISHED":` 内（`handleRunFinished` 之后）加 `retry: undefined`：

找到 `handleRunFinished` 函数（搜 `function handleRunFinished`），在返回的 state 里加 `retry: undefined`。如该函数返回 spread，改为：

```ts
function handleRunFinished(state: ChatState, _event: AGUIEventLike): ChatState {
  return {
    ...state,
    isRunning: false,
    isThinking: false,
    activeRunId: null,
    retry: undefined,                       // ← 新增
  };
}
```

- [ ] **Step 5: Run — passes**

Run: `bun test src/lib/agui/runtime/runtime.test.ts`
Expected: PASS — 既有 + 3 新

- [ ] **Step 6: Commit**

```bash
git add src/lib/agui/runtime/types.ts src/lib/agui/runtime/reducer.ts src/lib/agui/runtime/runtime.test.ts
git commit -m "feat(runtime): reducer tracks errorCode + retry state"
```

---

### Task 18: T4d — useRunStatus hook

**Files:**
- Create: `src/lib/agui/react/useRunStatus.ts`
- Create: `src/lib/agui/react/useRunStatus.test.tsx`

- [ ] **Step 1: 写 hook 测试**

Create `src/lib/agui/react/useRunStatus.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useRunStatus } from "./useRunStatus";
import { createInitialState, type ChatState } from "../runtime/types";

// In-test fake runtime store (minimum useSyncExternalStore contract)
function makeFakeRuntime(initial: ChatState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    setState(next: ChatState) {
      state = next;
      for (const l of listeners) l();
    },
  };
}

describe("useRunStatus", () => {
  it("returns errorCode + isAuthError true for AUTH_FAILED", () => {
    const rt = makeFakeRuntime({ ...createInitialState(), errorCode: "AUTH_FAILED", error: "authentication_failed" });
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.errorCode).toBe("AUTH_FAILED");
    expect(result.current.isAuthError).toBe(true);
    expect(result.current.isRetryable).toBe(false);
  });

  it("returns isRetryable=true for RATE_LIMIT / UPSTREAM_5XX", () => {
    const rt = makeFakeRuntime({ ...createInitialState(), errorCode: "RATE_LIMIT" });
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.isRetryable).toBe(true);
    expect(result.current.isAuthError).toBe(false);
  });

  it("reactively updates when runtime emits retry", () => {
    const rt = makeFakeRuntime(createInitialState());
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.retry).toBeUndefined();
    act(() => {
      rt.setState({
        ...createInitialState(),
        retry: { attempt: 2, maxRetries: 5, retryDelayMs: 1000, errorStatus: 503, error: "server_error", ts: Date.now() },
      });
    });
    expect(result.current.retry?.attempt).toBe(2);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `bun test src/lib/agui/react/useRunStatus.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 hook**

Create `src/lib/agui/react/useRunStatus.ts`:

```ts
// useRunStatus — 订阅 ChatRuntime 的 errorCode + retry 字段，派生若干便利布尔。
//
// 用 useSyncExternalStore 的 selector 形式，仅在我们关心的子状态变化时
// 触发 re-render；避免每个 token delta 都过到 ChatStream 头部。

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ChatRuntime, ChatState, RunErrorCode, RetryState } from "../runtime";

export interface RunStatus {
  status: "idle" | "running" | "completed" | "error" | "cancelled" | "awaiting_approval";
  errorCode?: RunErrorCode;
  errorMessage?: string;
  retry?: RetryState;
  isRetryable: boolean;
  isAuthError: boolean;
}

interface RuntimeLike {
  getState(): ChatState;
  subscribe(cb: () => void): () => void;
}

export function useRunStatus(runtime: RuntimeLike): RunStatus {
  const subscribe = useCallback((cb: () => void) => runtime.subscribe(cb), [runtime]);
  const getSnapshot = useCallback(() => runtime.getState(), [runtime]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo<RunStatus>(() => {
    const code = state.errorCode;
    const isAuthError = code === "AUTH_FAILED";
    const isRetryable =
      code === "RATE_LIMIT" || code === "UPSTREAM_5XX" || code === "EXECUTION_ERROR";
    let status: RunStatus["status"] = "idle";
    if (state.isRunning) status = "running";
    else if (code) status = "error";
    else if (state.pendingInterrupts.length > 0) status = "awaiting_approval";

    return {
      status,
      errorCode: code,
      errorMessage: state.error ?? undefined,
      retry: state.retry,
      isRetryable,
      isAuthError,
    };
  }, [state]);
}
```

注：`ChatRuntime` 当前 export 自 `../runtime/index.ts` — 确认它暴露 `getState` / `subscribe`。看 `runtime.ts` 内部，应该已有；如果只有 `runtime.subscribe`，那么这里的 `RuntimeLike` 接口仍然成立。

- [ ] **Step 4: Run — passes**

Run: `bun test src/lib/agui/react/useRunStatus.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/agui/react/useRunStatus.ts src/lib/agui/react/useRunStatus.test.tsx
git commit -m "feat(react): useRunStatus hook derives error/retry status from runtime"
```

---

### Task 19: T4d-2 — Dumb 组件 + ChatStream 接入

**Files:**
- Create: `src/features/task/ApiKeyMissingBanner.tsx`
- Create: `src/features/task/RetryHint.tsx`
- Create: `src/features/task/RetryingPill.tsx`
- Modify: `src/features/task/ChatStream.tsx`
- Modify: `src/i18n/locales/zh/task.ts` + `src/i18n/locales/en/task.ts`

- [ ] **Step 1: 新建 3 个 dumb 组件**

Create `src/features/task/ApiKeyMissingBanner.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface Props {
  onConfigureClick: () => void;
}

export function ApiKeyMissingBanner({ onConfigureClick }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--danger-100)] bg-[var(--danger-bg)] px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-[var(--danger-100)]" />
      <span className="flex-1">{t("task.error.authFailed")}</span>
      <Button size="sm" variant="outline" onClick={onConfigureClick}>
        {t("task.error.configureKey")}
      </Button>
    </div>
  );
}
```

Create `src/features/task/RetryHint.tsx`:

```tsx
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  delayMs: number;
}

export function RetryHint({ delayMs }: Props) {
  const { t } = useTranslation();
  const sec = Math.max(1, Math.round(delayMs / 1000));
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--warning-100)] bg-[var(--warning-bg)] px-3 py-2 text-sm">
      <Clock className="h-4 w-4 text-[var(--warning-100)]" />
      <span>{t("task.error.rateLimit", { sec })}</span>
    </div>
  );
}
```

Create `src/features/task/RetryingPill.tsx`:

```tsx
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  attempt: number;
  maxRetries: number;
}

export function RetryingPill({ attempt, maxRetries }: Props) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-200)] px-3 py-1 text-xs text-[var(--text-200)]">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{t("task.retry.attempt", { attempt, max: maxRetries })}</span>
    </div>
  );
}
```

- [ ] **Step 2: 加 i18n 文案**

修改 `src/i18n/locales/zh/task.ts`，在 task 对象内追加：

```ts
error: {
  authFailed: "API key 失效或未配置",
  configureKey: "配置 API key",
  rateLimit: "已被限流，{{sec}} 秒后自动重试",
  generic: "agent 错误：{{msg}}",
  maxTurns: "达到最大轮次上限，请新开 thread",
  maxBudget: "达到费用上限",
},
retry: {
  attempt: "正在重试 {{attempt}}/{{max}}",
},
```

修改 `src/i18n/locales/en/task.ts` 加对应 keys：

```ts
error: {
  authFailed: "API key invalid or missing",
  configureKey: "Configure API key",
  rateLimit: "Rate limited — retrying in {{sec}}s",
  generic: "Agent error: {{msg}}",
  maxTurns: "Hit max turns — please start a new thread",
  maxBudget: "Hit cost cap",
},
retry: {
  attempt: "Retrying {{attempt}}/{{max}}",
},
```

- [ ] **Step 3: ChatStream 接入 useRunStatus**

修改 `src/features/task/ChatStream.tsx`：

在文件顶部加 import：

```tsx
import { useRunStatus } from "@/lib/agui/react/useRunStatus";
import { ApiKeyMissingBanner } from "./ApiKeyMissingBanner";
import { RetryHint } from "./RetryHint";
import { RetryingPill } from "./RetryingPill";
import { useNavigate } from "@/app/RouterView"; // 或 useAppShell setView
```

在 ChatStream 函数体内（消费 runtime 的位置附近），加：

```tsx
const status = useRunStatus(runtime);
const setView = useAppShellSetView();  // 取决于现有 AppShellContext API
```

在头部 / 消息列表上方渲染 banner / pill：

```tsx
{status.isAuthError && (
  <ApiKeyMissingBanner onConfigureClick={() => setView("settings")} />
)}
{status.errorCode === "RATE_LIMIT" && status.retry && (
  <RetryHint delayMs={status.retry.retryDelayMs} />
)}
{status.retry && status.status === "running" && (
  <div className="px-4 pt-2">
    <RetryingPill attempt={status.retry.attempt} maxRetries={status.retry.maxRetries} />
  </div>
)}
```

注意：具体放在哪由现有 ChatStream 布局决定（顶部 padding 区域）。如果文件结构无法直接接入 useRunStatus（比如 runtime 不是它的 prop），改为父组件传入 status，保持组件 dumb。

- [ ] **Step 4: 手动 smoke**

Run: `bun run tauri:dev`

操作：
1. 故意把 ANTHROPIC_API_KEY 设为错误值 → 触发 401 → 验证 ApiKeyMissingBanner 出现
2. 模型在 reasoning 中故意触发 rate_limit（如果当前 dev 环境难复现，跳过这步，让 spec reviewer 后续手测）

- [ ] **Step 5: Commit**

```bash
git add src/features/task/ApiKeyMissingBanner.tsx src/features/task/RetryHint.tsx src/features/task/RetryingPill.tsx src/features/task/ChatStream.tsx src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "feat(task): error/retry UI via useRunStatus + dumb banner/hint/pill components"
```

---

### Task 20: T7a — settings KV service + 默认 allowedTools

**Files:**
- Create: `sidecar/src/services/settings-tools.ts`
- Create: `sidecar/src/services/settings-tools.test.ts`

- [ ] **Step 1: 写测试**

Create `sidecar/src/services/settings-tools.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { SettingsToolsService, DEFAULT_ALLOWED_TOOLS } from "./settings-tools";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("SettingsToolsService", () => {
  it("returns DEFAULT_ALLOWED_TOOLS when KV unset", () => {
    const svc = new SettingsToolsService(makeDb());
    expect(svc.getDefault()).toEqual(DEFAULT_ALLOWED_TOOLS);
  });

  it("setDefault persists and getDefault reads back", () => {
    const svc = new SettingsToolsService(makeDb());
    svc.setDefault(["Bash", "Read"]);
    expect(svc.getDefault()).toEqual(["Bash", "Read"]);
  });

  it("setDefault with empty array means read-only mode", () => {
    const svc = new SettingsToolsService(makeDb());
    svc.setDefault([]);
    expect(svc.getDefault()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd sidecar && bun test src/services/settings-tools.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 service**

Create `sidecar/src/services/settings-tools.ts`:

```ts
import type { Database } from "bun:sqlite";

export const DEFAULT_ALLOWED_TOOLS: string[] = [
  "Bash", "Read", "Write", "Edit",
  "Glob", "Grep", "WebFetch", "WebSearch", "Task",
];

const KEY = "allowedTools";

export class SettingsToolsService {
  private get: ReturnType<Database["prepare"]>;
  private upsert: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.get = db.prepare("SELECT value FROM settings WHERE key = ?");
    this.upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  getDefault(): string[] {
    const row = this.get.get(KEY) as { value?: string } | undefined;
    if (!row?.value) return DEFAULT_ALLOWED_TOOLS;
    try {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed : DEFAULT_ALLOWED_TOOLS;
    } catch {
      return DEFAULT_ALLOWED_TOOLS;
    }
  }

  setDefault(tools: string[]): void {
    this.upsert.run(KEY, JSON.stringify(tools));
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `cd sidecar && bun test src/services/settings-tools.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/settings-tools.ts sidecar/src/services/settings-tools.test.ts
git commit -m "feat(settings): SettingsToolsService for default allowedTools KV"
```

---

### Task 21: T7b — ThreadService 加 allowedTools 字段 + 路由

**Files:**
- Modify: `sidecar/src/services/threads.ts`
- Modify: `sidecar/src/routes/conversations.ts`
- Create: `sidecar/src/routes/settings-tools.ts`
- Create: `sidecar/src/routes/settings-tools.test.ts`

- [ ] **Step 1: ThreadService 加方法**

修改 `sidecar/src/services/threads.ts`：

在类内加：

```ts
private selectAllowedTools = this.db.prepare(
  "SELECT allowed_tools_json AS j FROM conversations WHERE id = ?",
);
private updateAllowedTools = this.db.prepare(
  "UPDATE conversations SET allowed_tools_json = ? WHERE id = ?",
);

getAllowedTools(threadId: string): string[] | null {
  const row = this.selectAllowedTools.get(threadId) as { j?: string | null } | undefined;
  if (!row?.j) return null;
  try {
    const parsed = JSON.parse(row.j);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

setAllowedTools(threadId: string, tools: string[] | null): void {
  this.updateAllowedTools.run(tools === null ? null : JSON.stringify(tools), threadId);
}
```

- [ ] **Step 2: conversations 路由加 PATCH**

修改 `sidecar/src/routes/conversations.ts`：

在 buildConversationRoutes 内追加：

```ts
r.patch("/conversations/:id/allowed-tools", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as { tools: string[] | null };
  if (body.tools !== null && !Array.isArray(body.tools)) {
    return c.json({ error: "tools must be array or null" }, 400);
  }
  threads.setAllowedTools(id, body.tools);
  return c.json({ ok: true });
});

r.get("/conversations/:id/allowed-tools", (c) => {
  const id = c.req.param("id");
  const tools = threads.getAllowedTools(id);
  return c.json({ tools });
});
```

- [ ] **Step 3: settings-tools 路由 + test**

Create `sidecar/src/routes/settings-tools.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { SettingsToolsService, DEFAULT_ALLOWED_TOOLS } from "../services/settings-tools";
import { buildSettingsToolsRoutes } from "./settings-tools";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const svc = new SettingsToolsService(db);
  const app = new Hono();
  app.route("/", buildSettingsToolsRoutes(svc));
  return app;
}

describe("settings-tools routes", () => {
  it("GET returns default initially", async () => {
    const res = await makeApp().request("/settings/allowed-tools");
    expect(res.status).toBe(200);
    const body = await res.json() as { tools: string[] };
    expect(body.tools).toEqual(DEFAULT_ALLOWED_TOOLS);
  });

  it("PUT persists and GET reflects", async () => {
    const app = makeApp();
    const put = await app.request("/settings/allowed-tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tools: ["Bash"] }),
    });
    expect(put.status).toBe(200);
    const got = await app.request("/settings/allowed-tools");
    expect((await got.json() as { tools: string[] }).tools).toEqual(["Bash"]);
  });
});
```

Create `sidecar/src/routes/settings-tools.ts`:

```ts
import { Hono } from "hono";
import type { SettingsToolsService } from "../services/settings-tools";

export function buildSettingsToolsRoutes(svc: SettingsToolsService): Hono {
  const r = new Hono();
  r.get("/settings/allowed-tools", (c) => c.json({ tools: svc.getDefault() }));
  r.put("/settings/allowed-tools", async (c) => {
    const body = (await c.req.json()) as { tools?: unknown };
    if (!Array.isArray(body.tools) || !body.tools.every((t) => typeof t === "string")) {
      return c.json({ error: "tools must be string[]" }, 400);
    }
    svc.setDefault(body.tools);
    return c.json({ ok: true });
  });
  return r;
}
```

- [ ] **Step 4: server.ts 接入**

修改 `sidecar/src/server.ts`：

import 追加：

```ts
import { SettingsToolsService } from "./services/settings-tools";
import { buildSettingsToolsRoutes } from "./routes/settings-tools";
```

构造 + 路由：

```ts
const settingsTools = new SettingsToolsService(db);
// ...
app.route("/", buildSettingsToolsRoutes(settingsTools));
```

- [ ] **Step 5: Run — passes**

Run: `cd sidecar && bun test src/routes/settings-tools.test.ts`
Expected: PASS — 2 tests

Run: `cd sidecar && bun test`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/services/threads.ts sidecar/src/routes/conversations.ts sidecar/src/routes/settings-tools.ts sidecar/src/routes/settings-tools.test.ts sidecar/src/server.ts
git commit -m "feat(allowed-tools): backend services + routes for per-thread/global allowed tools"
```

---

### Task 22: T7c — server.ts 接入 resolveAllowedTools，删硬编码

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: provider 加 resolveAllowedTools option**

修改 `sidecar/src/agui/provider-claude/provider.ts`：

`ClaudeProviderOptions` 调整：

```ts
export interface ClaudeProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** @deprecated 用 resolveAllowedTools 替代；保留兼容。 */
  allowedTools?: string[];
  resolveAllowedTools?: (threadId: string) => string[];
  interruptBus?: InterruptBus;
  audit?: AuditService;
}
```

`runTurn` 内 options 处：

```ts
const allowedTools = opts.resolveAllowedTools
  ? opts.resolveAllowedTools(ctx.threadId)
  : opts.allowedTools ?? [];

// ...inside sdkQuery options:
allowedTools,
```

- [ ] **Step 2: server.ts 注入**

修改 `sidecar/src/server.ts` 的 `buildProvider()`：

```ts
function buildProvider() {
  const key = apiKey.get();
  if (!key) throw new Error("api_key_missing");
  const resolveAllowedTools = (threadId: string): string[] => {
    const override = threads.getAllowedTools(threadId);
    return override ?? settingsTools.getDefault();
  };
  return createClaudeProvider({
    apiKey: key,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL,
    resolveAllowedTools,
    interruptBus,
    audit,
  });
}
```

删掉原来的 `allowedTools: ["Bash"],` 行。

- [ ] **Step 3: TS 编译 + 集成测试**

Run: `cd sidecar && bunx tsc --noEmit`
Expected: 0 errors

Run: `cd sidecar && bun test`
Expected: 全绿

Verify hardcoded list 没了：

Run: `grep -n 'allowedTools.*\["Bash"\]' sidecar/src/server.ts || echo "no hardcoded"`
Expected: `no hardcoded`

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/agui/provider-claude/provider.ts sidecar/src/server.ts
git commit -m "feat(allowed-tools): provider uses resolveAllowedTools — per-thread override + global default"
```

---

### Task 23: T7d — 前端 data 层 + Tanstack Query hooks

**Files:**
- Create: `src/lib/data/thread-tools.ts`
- Create: `src/lib/data/thread-tools-queries.ts`
- Create: `src/lib/data/thread-tools-queries.test.tsx`

- [ ] **Step 1: 加类型**

修改 `src/lib/data/types.ts`，末尾追加：

```ts
export interface ThreadAllowedTools {
  /** Resolved: per-thread override OR global default. */
  tools: string[];
  /** "global" = no override; "custom" = thread has its own list. */
  overrideMode: "global" | "custom";
}
```

- [ ] **Step 2: 实现 fetch 函数**

Create `src/lib/data/thread-tools.ts`:

```ts
import { authedFetch } from "@/lib/sidecar-client";

export async function getDefaultAllowedTools(): Promise<string[]> {
  const res = await authedFetch("/settings/allowed-tools");
  if (!res.ok) throw new Error(`getDefaultAllowedTools failed: ${res.status}`);
  return ((await res.json()) as { tools: string[] }).tools;
}

export async function setDefaultAllowedTools(tools: string[]): Promise<void> {
  const res = await authedFetch("/settings/allowed-tools", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) throw new Error(`setDefaultAllowedTools failed: ${res.status}`);
}

export async function getThreadAllowedToolsOverride(threadId: string): Promise<string[] | null> {
  const res = await authedFetch(`/conversations/${threadId}/allowed-tools`);
  if (!res.ok) throw new Error(`getThreadAllowedTools failed: ${res.status}`);
  return ((await res.json()) as { tools: string[] | null }).tools;
}

export async function setThreadAllowedTools(threadId: string, tools: string[] | null): Promise<void> {
  const res = await authedFetch(`/conversations/${threadId}/allowed-tools`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) throw new Error(`setThreadAllowedTools failed: ${res.status}`);
}
```

- [ ] **Step 3: 实现 hooks**

Create `src/lib/data/thread-tools-queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDefaultAllowedTools,
  setDefaultAllowedTools,
  getThreadAllowedToolsOverride,
  setThreadAllowedTools,
} from "./thread-tools";
import type { ThreadAllowedTools } from "./types";

export const toolsQueryKeys = {
  defaults: ["tools", "default"] as const,
  threadOverride: (id: string) => ["tools", "thread", id] as const,
};

export function useDefaultAllowedTools() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: toolsQueryKeys.defaults, queryFn: getDefaultAllowedTools, staleTime: 30_000 });
  const m = useMutation({
    mutationFn: setDefaultAllowedTools,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: toolsQueryKeys.defaults }); },
  });
  return { tools: q.data ?? [], isLoading: q.isLoading, setTools: m.mutate };
}

export function useThreadAllowedTools(threadId: string | null) {
  const qc = useQueryClient();
  const overrideQ = useQuery({
    queryKey: threadId ? toolsQueryKeys.threadOverride(threadId) : ["tools", "thread", "__none__"],
    queryFn: () => getThreadAllowedToolsOverride(threadId!),
    enabled: !!threadId,
    staleTime: 30_000,
  });
  const defaultsQ = useQuery({ queryKey: toolsQueryKeys.defaults, queryFn: getDefaultAllowedTools, staleTime: 30_000 });
  const mutate = useMutation({
    mutationFn: (tools: string[] | null) => setThreadAllowedTools(threadId!, tools),
    onSuccess: () => {
      if (threadId) void qc.invalidateQueries({ queryKey: toolsQueryKeys.threadOverride(threadId) });
    },
  });

  const override = overrideQ.data ?? null;
  const resolved: ThreadAllowedTools = {
    tools: override ?? defaultsQ.data ?? [],
    overrideMode: override === null ? "global" : "custom",
  };
  return {
    ...resolved,
    isLoading: overrideQ.isLoading || defaultsQ.isLoading,
    setTools: mutate.mutate,
  };
}
```

- [ ] **Step 4: 写 hook 测试**

Create `src/lib/data/thread-tools-queries.test.tsx`:

```tsx
import { describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDefaultAllowedTools, useThreadAllowedTools } from "./thread-tools-queries";

mock.module("@/lib/sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    if (path === "/settings/allowed-tools" && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(JSON.stringify({ tools: ["Bash", "Read"] }), { status: 200 });
    }
    if (path.startsWith("/conversations/") && path.endsWith("/allowed-tools")) {
      return new Response(JSON.stringify({ tools: null }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },
}));

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("thread-tools-queries", () => {
  it("useDefaultAllowedTools returns global default", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDefaultAllowedTools(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.tools).toEqual(["Bash", "Read"]));
  });

  it("useThreadAllowedTools falls back to global default when no override", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useThreadAllowedTools("t-1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.tools).toEqual(["Bash", "Read"]));
    expect(result.current.overrideMode).toBe("global");
  });
});
```

- [ ] **Step 5: Run — passes**

Run: `bun test src/lib/data/thread-tools-queries.test.tsx`
Expected: PASS — 2 tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/thread-tools.ts src/lib/data/thread-tools-queries.ts src/lib/data/thread-tools-queries.test.tsx src/lib/data/types.ts
git commit -m "feat(allowed-tools): frontend data layer + Tanstack Query hooks for thread/global allowed tools"
```

---

### Task 24: T7e — Settings UI 接 useDefaultAllowedTools

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/i18n/locales/zh/settings.ts` + `en/settings.ts`

- [ ] **Step 1: 加 i18n**

修改 `src/i18n/locales/zh/settings.ts`，在 settings 对象内追加：

```ts
defaultTools: {
  title: "默认工具集",
  description: "新建对话默认允许 agent 使用的工具。HITL 仍会逐次审批。",
  toolName: {
    Bash: "Bash 命令",
    Read: "读文件",
    Write: "写文件",
    Edit: "编辑文件",
    Glob: "文件名匹配",
    Grep: "内容搜索",
    WebFetch: "网页抓取",
    WebSearch: "网页搜索",
    Task: "子任务（subagent）",
  },
},
```

英文版同理（`src/i18n/locales/en/settings.ts`）。

- [ ] **Step 2: 在 SettingsView 加 section**

修改 `src/features/settings/SettingsView.tsx`：

import 追加：

```tsx
import { useDefaultAllowedTools } from "@/lib/data/thread-tools-queries";
import { Checkbox } from "@/components/ui/checkbox";
```

在 SettingsView 函数体内（与已有 HITL allowlist 同级），加一个 section：

```tsx
const { tools: defaultTools, setTools: setDefaults } = useDefaultAllowedTools();

const ALL_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task"] as const;

function toggle(tool: string) {
  const next = defaultTools.includes(tool)
    ? defaultTools.filter((t) => t !== tool)
    : [...defaultTools, tool];
  setDefaults(next);
}

// In JSX, near the HITL allowlist section:
<section>
  <h3 className="text-sm font-medium mb-1">{t("settings.defaultTools.title")}</h3>
  <p className="text-xs text-[var(--text-200)] mb-3">{t("settings.defaultTools.description")}</p>
  <div className="grid grid-cols-2 gap-2">
    {ALL_TOOLS.map((tool) => (
      <label key={tool} className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={defaultTools.includes(tool)} onCheckedChange={() => toggle(tool)} />
        <span className="text-sm">{t(`settings.defaultTools.toolName.${tool}` as const)}</span>
      </label>
    ))}
  </div>
</section>
```

- [ ] **Step 3: 手动 smoke**

Run: `bun run tauri:dev`

操作：
1. 打开 Settings 页 → 看到"默认工具集" section 9 项 checkbox
2. 勾掉某项，刷新页面 → 状态保留
3. 新建一个 thread → 让 agent 用刚才勾掉的工具 → 该工具调用应被拒绝（SDK 返回 tool not allowed）

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsView.tsx src/i18n/locales/zh/settings.ts src/i18n/locales/en/settings.ts
git commit -m "feat(settings): default allowed tools UI with useDefaultAllowedTools"
```

---

### Task 25: T7f — RightPanel 加 per-thread allowedTools 切换

**Files:**
- Modify: `src/features/task/RightPanel.tsx`
- Modify: `src/i18n/locales/zh/task.ts` + `en/task.ts`

- [ ] **Step 1: 加 i18n**

修改 `src/i18n/locales/zh/task.ts`：

```ts
toolsPanel: {
  title: "工具集",
  followGlobal: "跟随全局默认",
  customize: "为此对话自定义",
  restore: "恢复全局默认",
},
```

英文版同理。

- [ ] **Step 2: 修改 RightPanel**

修改 `src/features/task/RightPanel.tsx`：

import 追加：

```tsx
import { useThreadAllowedTools } from "@/lib/data/thread-tools-queries";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
```

在 RightPanel 内（接收 threadId 的位置）：

```tsx
const { tools, overrideMode, setTools } = useThreadAllowedTools(threadId);

const ALL_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task"] as const;

function toggleOverrideMode() {
  if (overrideMode === "global") {
    setTools(tools);  // 复制当前 tools 作为自定义起点
  } else {
    setTools(null);  // 回到 global
  }
}

function toggleTool(tool: string) {
  if (overrideMode === "global") return;
  const next = tools.includes(tool) ? tools.filter((t) => t !== tool) : [...tools, tool];
  setTools(next);
}

// JSX section:
<section>
  <h4 className="text-sm font-medium mb-1">{t("task.toolsPanel.title")}</h4>
  <div className="text-xs text-[var(--text-200)] mb-2">
    {overrideMode === "global" ? t("task.toolsPanel.followGlobal") : t("task.toolsPanel.customize")}
  </div>
  <div className="space-y-1 mb-2">
    {ALL_TOOLS.map((tool) => (
      <label key={tool} className={`flex items-center gap-2 ${overrideMode === "global" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
        <Checkbox
          checked={tools.includes(tool)}
          disabled={overrideMode === "global"}
          onCheckedChange={() => toggleTool(tool)}
        />
        <span className="text-sm">{t(`settings.defaultTools.toolName.${tool}` as const)}</span>
      </label>
    ))}
  </div>
  <Button size="sm" variant="outline" onClick={toggleOverrideMode}>
    {overrideMode === "global" ? t("task.toolsPanel.customize") : t("task.toolsPanel.restore")}
  </Button>
</section>
```

- [ ] **Step 3: 手动 smoke**

Run: `bun run tauri:dev`

操作：
1. 打开任意 thread → RightPanel 看到"工具集" section，状态"跟随全局默认"
2. 点"为此对话自定义" → checkbox 变可点
3. 取消 Bash → 在 thread 让 agent 跑 `ls` → 应该被拒绝
4. 点"恢复全局默认" → 再让 agent 跑 `ls` → 恢复正常

- [ ] **Step 4: Commit**

```bash
git add src/features/task/RightPanel.tsx src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "feat(task): per-thread allowed tools UI via useThreadAllowedTools"
```

---

### Task 26: End-to-end smoke + cleanup

**Files:**
- None to write, only verification.

- [ ] **Step 1: 完整 lint + type-check**

Run: `cd sidecar && bunx tsc --noEmit && cd .. && bunx tsc -b`
Expected: 0 errors in both

- [ ] **Step 2: 跑所有测试**

Run: `cd sidecar && bun test && cd .. && bun test src/`
Expected: 全绿

- [ ] **Step 3: 启全栈手测**

Run: `bun run tauri:dev`

按 spec verification 跑：

1. **T1 session** 启 → 起 thread → 发 5 条 → kill sidecar → 重启 → 第 6 条引用第 1 条内容 → SDK 看到历史
2. **T2 sandbox** macOS 让 agent 尝试 Write `/tmp/outside-cwd.txt` → OS 拒绝
3. **T3 audit** 跑 5 个工具调用 → `sqlite3 sidecar/dev.db "SELECT count(*) FROM tool_audit"` → 应 ≥ 10
4. **T4 错误** （需 mock 上游 401 时手测，或跳到 spec reviewer 阶段）
5. **T5 类型** `grep -rn "as never" sidecar/src/agui/provider-claude/` → 0 命中
6. **T6 usage** 跑完 1 turn → `sqlite3 sidecar/dev.db "SELECT input_tokens, total_cost_usd FROM runs ORDER BY started_at DESC LIMIT 1"` → 非 NULL
7. **T7 工具** Settings 改默认 + RightPanel 改 per-thread → 验证生效

- [ ] **Step 4: 收尾**

如有 console.log 临时调试残留，删除。

如发现 i18n key 引用错（react-i18next 抛"missing key"警告），补全。

- [ ] **Step 5: Final commit**

```bash
git add -A
git status
# 若无新增，跳过 commit
# 若有，commit：
git commit -m "chore: end-to-end smoke fixes for SDK leverage hardening"
```

---

## Self-Review checklist

**Spec 覆盖：**

| Spec task | Plan tasks |
|---|---|
| T5 SDK types | Task 1 |
| T1 session tagSession | Task 2, 3 |
| T2 sandbox | Task 4 |
| T3 audit | Task 5 (schema), 6 (redact), 7 (service), 8 (hooks), 9 (route) |
| T4 errors | Task 10 (map), 11 (bridge), 17 (reducer), 18 (hook), 19 (UI) |
| T6 usage | Task 5 (schema), 12 (callback), 13 (bridge), 14 (service+worker), 15 (route), 16 (hook) |
| T7 allowed tools | Task 5 (schema), 20 (settings svc), 21 (thread svc+routes), 22 (provider wiring), 23 (hook), 24 (Settings UI), 25 (RightPanel UI) |
| End-to-end | Task 26 |

**Placeholder 扫描：** 无 TBD / TODO / "Similar to" / "Add appropriate ..."。每一步含可执行代码或可执行命令。

**类型一致性：**
- `RunErrorCode` 在 error-map.ts、runtime/types.ts、useRunStatus.ts 三处定义需保持一致 —— `RunErrorCode` 枚举值在三处文字内容一致。
- `ProviderCallbacks.onRunUsage` 参数 shape 在 provider-types.ts 定义、bridge.ts 调用、runWorker 消费、UsageService.recordRun 接收处类型对齐。
- `UsageSummary` 在 sidecar UsageService 返回类型与前端 `src/lib/data/types.ts` 一致。

---

## 执行建议

按 **subagent-driven-development** 顺序执行（默认即可）：每个 task fresh subagent 实现 + 两阶段 review。

依赖关系：T5（Task 1）必须最先；其余按 task 编号顺序即可。schema 迁移（Task 5）一次性加齐，避免后续 task 之间 migration 冲突。

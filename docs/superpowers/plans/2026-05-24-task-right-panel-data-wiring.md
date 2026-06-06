# Task Right Panel Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TaskView 右侧 Process / Files / Context 三个 Tab 从 mock-driven 切换为真实 agent 运行数据驱动。

**Architecture:** Process / Files 是事件流派生（在 `src/lib/agui/runtime` 上加 pure-function selectors + RUN_STARTED 时间戳，三个 Tab 通过 React hooks 消费 ChatRuntime state）；Context 是线程级 RPC 查询（sidecar 解析 SDK `system.init` 的 `mcp_servers` + `tools` 字段到内存 store，新增 `GET /threads/:id/context` 路由）。

**Tech Stack:** React 19 + TypeScript + Vite / Bun + Hono / `@anthropic-ai/claude-agent-sdk` / TanStack Query / bun:test。

**Spec:** `docs/superpowers/specs/2026-05-23-task-right-panel-data-wiring-design.md`

---

## 文件结构

**新增（前端）：**
- `src/lib/agui/runtime/derivations.ts` — pure-function selectors：`deriveTodos(state)` / `deriveTouchedFiles(state, workingDir)`
- `src/lib/agui/runtime/derivations.test.ts` — selectors 单元测试
- `src/lib/agui/react/useThreadPlan.ts` — 派生 hook，输出 `{ todos: TodoEntry[] }`
- `src/lib/agui/react/useThreadFiles.ts` — 派生 hook，输出 `{ files: TouchedFile[] }`，cwd 过滤
- `src/lib/agui/react/useThreadContext.ts` — `useQuery` wrapper for `GET /threads/:id/context`
- `src/lib/agui/react/useThreadRunMeta.ts` — 输出 `{ runStartedAt: number | null }`

**新增（sidecar）：**
- `sidecar/src/services/sessionMetadata.ts` — `SessionMetadataStore` 内存 map
- `sidecar/src/services/sessionMetadata.test.ts`
- `sidecar/src/routes/threadContext.ts` — `GET /threads/:threadId/context`
- `sidecar/src/routes/threadContext.test.ts`

**修改：**
- `src/lib/agui/runtime/types.ts` — `ChatState` 加 `runStartedAt: number | null`
- `src/lib/agui/runtime/reducer.ts` — 处理 `RUN_STARTED` 写 `runStartedAt`
- `src/features/task/ProcessTab.tsx` — props 改 `{ threadId }`，去 MockTask
- `src/features/task/FilesTab.tsx` — props 改 `{ threadId, workingDir, onOpenFile }`，删 "Add files" 按钮
- `src/features/task/ContextTab.tsx` — props 改 `{ threadId }`
- `src/features/task/TaskRightPanel.tsx` — props 改 `{ threadId, workingDir, onOpenFile }`
- `src/features/task/TaskView.tsx` — `<TaskRightPanel>` 传 `threadId` + `workingDir`
- `sidecar/src/agui/provider-claude/bridge.ts` — system.init 分支同时抓 `mcp_servers` + `tools`，新增 `onInitMetadata` 回调
- `sidecar/src/agui/provider-claude/provider.ts` — 把 callback 路由到 store
- `sidecar/src/server.ts` — 实例 store + 挂路由
- `src/i18n/locales/zh/task.ts` + `src/i18n/locales/en/task.ts` — 新增 keys

**清理：**
- `src/lib/mock/types.ts` — 移除不再使用的 `MockTask.plan` / `MockTask.elapsedSeconds` / `MockFile` / `MockSkill` / `MockMcpServer`

---

## Task 1: SessionMetadataStore

**Files:**
- Create: `sidecar/src/services/sessionMetadata.ts`
- Create: `sidecar/src/services/sessionMetadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// sidecar/src/services/sessionMetadata.test.ts
import { describe, expect, it } from "bun:test";
import { SessionMetadataStore } from "./sessionMetadata";

describe("SessionMetadataStore", () => {
  it("returns undefined for unknown threadId", () => {
    const store = new SessionMetadataStore();
    expect(store.get("nope")).toBeUndefined();
  });

  it("upsert + get round-trips", () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", {
      mcpServers: [{ name: "github", status: "connected" }],
      tools: ["Read", "Write"],
    });
    const got = store.get("thr_a");
    expect(got?.mcpServers).toEqual([{ name: "github", status: "connected" }]);
    expect(got?.tools).toEqual(["Read", "Write"]);
    expect(typeof got?.updatedAt).toBe("number");
  });

  it("upsert overwrites previous", () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", { mcpServers: [], tools: ["Read"] });
    store.upsert("thr_a", {
      mcpServers: [{ name: "slack", status: "connected" }],
      tools: ["Bash"],
    });
    expect(store.get("thr_a")?.tools).toEqual(["Bash"]);
    expect(store.get("thr_a")?.mcpServers).toEqual([
      { name: "slack", status: "connected" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/services/sessionMetadata.test.ts`
Expected: FAIL — `Cannot find module './sessionMetadata'`

- [ ] **Step 3: Implement the store**

```ts
// sidecar/src/services/sessionMetadata.ts

/**
 * 每个 thread 一份「最近一次 system.init 时 SDK 报告的能力快照」。
 * 内存态——sidecar 重启失效。下一个 Run 触发后 bridge 会 upsert 回来。
 *
 * 数据由 provider-claude/bridge.ts 在解析 SDKSystemMessage init 时
 * 通过 onInitMetadata 回调写入；GET /threads/:id/context 路由读出来。
 */

export interface SessionInitMeta {
  mcpServers: Array<{ name: string; status: string }>;
  tools: string[];
}

export interface SessionInitRecord extends SessionInitMeta {
  updatedAt: number;
}

export class SessionMetadataStore {
  private map = new Map<string, SessionInitRecord>();

  upsert(threadId: string, meta: SessionInitMeta): void {
    this.map.set(threadId, { ...meta, updatedAt: Date.now() });
  }

  get(threadId: string): SessionInitRecord | undefined {
    return this.map.get(threadId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/services/sessionMetadata.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/sessionMetadata.ts sidecar/src/services/sessionMetadata.test.ts
git commit -m "feat(sidecar): session metadata in-memory store"
```

---

## Task 2: Bridge — emit init metadata

**Files:**
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`
- Modify: `sidecar/src/agui/provider-claude/bridge.test.ts` (add a test case)

- [ ] **Step 1: Write the failing test**

Append to `sidecar/src/agui/provider-claude/bridge.test.ts`:

```ts
describe("claudeSdkToAgui — onInitMetadata", () => {
  it("invokes onInitMetadata when system.init carries mcp_servers + tools", async () => {
    const seenMeta: Array<{ mcpServers: unknown; tools: unknown }> = [];
    const stream = (async function* () {
      yield {
        type: "system",
        subtype: "init",
        session_id: "sess_1",
        mcp_servers: [
          { name: "github", status: "connected" },
          { name: "slack", status: "disconnected" },
        ],
        tools: ["Read", "Write", "mcp__github__list_issues"],
      } as never;
      yield { type: "result", subtype: "success", is_error: false } as never;
    })();

    const events: unknown[] = [];
    for await (const ev of claudeSdkToAgui(stream, {
      threadId: "t",
      runId: "r",
      onInitMetadata: (m) => seenMeta.push(m),
    })) {
      events.push(ev);
    }

    expect(seenMeta).toHaveLength(1);
    expect(seenMeta[0]!.mcpServers).toEqual([
      { name: "github", status: "connected" },
      { name: "slack", status: "disconnected" },
    ]);
    expect(seenMeta[0]!.tools).toEqual([
      "Read",
      "Write",
      "mcp__github__list_issues",
    ]);
  });

  it("does not invoke onInitMetadata when fields are missing", async () => {
    const seenMeta: unknown[] = [];
    const stream = (async function* () {
      yield { type: "system", session_id: "sess_1" } as never;
      yield { type: "result", subtype: "success", is_error: false } as never;
    })();
    for await (const _ev of claudeSdkToAgui(stream, {
      threadId: "t",
      runId: "r",
      onInitMetadata: (m) => seenMeta.push(m),
    })) {
      // drain
    }
    expect(seenMeta).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts -t "onInitMetadata"`
Expected: FAIL — `onInitMetadata` option not recognized (compile-time TS error) or test sees `seenMeta` length 0

- [ ] **Step 3: Extend BridgeOptions + system.init branch**

In `sidecar/src/agui/provider-claude/bridge.ts`:

Update the `BridgeOptions` interface:

```ts
export interface BridgeOptions {
  threadId: string;
  runId: string;
  callbacks?: ProviderCallbacks;
  onSessionId?: (sessionId: string) => void;
  /**
   * Fires once per turn when SDK's system.init carries mcp_servers + tools.
   * Used by sidecar to populate SessionMetadataStore so the GET /threads/:id/
   * context route can answer with what the SDK actually loaded for this run.
   */
  onInitMetadata?: (meta: {
    mcpServers: Array<{ name: string; status: string }>;
    tools: string[];
  }) => void;
}
```

Destructure the new field in the function header:

```ts
const { threadId, runId, callbacks, onSessionId, onInitMetadata } = opts;
```

Update the `system` message branch (around the existing `if (typeof sys.session_id === "string")` block) — keep the existing session_id capture, ADD next to it:

```ts
} else {
  const sys = m as SDKSystemMessage;
  if (typeof sys.session_id === "string") {
    pendingSessionId = sys.session_id;
  }
  // SDK init also carries the active capability surface for this turn:
  // mcp_servers + tools. Cast to a permissive shape — SDK.d.ts doesn't
  // expose these on SDKSystemMessage, but the wire format does.
  const sysExt = sys as unknown as {
    mcp_servers?: Array<{ name?: unknown; status?: unknown }>;
    tools?: unknown[];
  };
  const hasMcp = Array.isArray(sysExt.mcp_servers);
  const hasTools = Array.isArray(sysExt.tools);
  if (hasMcp || hasTools) {
    const mcpServers = (sysExt.mcp_servers ?? [])
      .filter((s) => typeof s?.name === "string")
      .map((s) => ({
        name: String(s.name),
        status: typeof s.status === "string" ? s.status : "unknown",
      }));
    const tools = (sysExt.tools ?? [])
      .filter((t): t is string => typeof t === "string");
    onInitMetadata?.({ mcpServers, tools });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts -t "onInitMetadata"`
Expected: PASS — 2 tests

- [ ] **Step 5: Re-run the whole bridge test file to check no regressions**

Run: `cd sidecar && bun test src/agui/provider-claude/bridge.test.ts`
Expected: PASS — all existing tests + 2 new ones

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/agui/provider-claude/bridge.ts sidecar/src/agui/provider-claude/bridge.test.ts
git commit -m "feat(sidecar): bridge emits init metadata (mcp_servers + tools)"
```

---

## Task 3: Provider wires onInitMetadata → store

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`

- [ ] **Step 1: Add `onInitMetadata` option to `ClaudeProviderOptions`**

In `sidecar/src/agui/provider-claude/provider.ts`, append to the `ClaudeProviderOptions` interface:

```ts
  /**
   * Called when the SDK reports session capabilities (mcp_servers + tools)
   * via system.init. Sidecar writes these into SessionMetadataStore so the
   * Context Tab can query them via GET /threads/:id/context. Resolved per
   * turn so a reconnected MCP becomes visible on the next Run.
   */
  onInitMetadata?: (
    threadId: string,
    meta: {
      mcpServers: Array<{ name: string; status: string }>;
      tools: string[];
    },
  ) => void;
```

- [ ] **Step 2: Wire it through to `claudeSdkToAgui`**

Locate the `return claudeSdkToAgui(sdkStream, { ... })` call near the bottom of `runTurn`. Add `onInitMetadata` to its options block:

```ts
return claudeSdkToAgui(sdkStream, {
  threadId: ctx.threadId,
  runId: ctx.runId,
  callbacks: ctx.callbacks,
  onSessionId: (sid) => {
    void tagThreadSession(ctx.threadId, ctx.cwd, sid);
  },
  onInitMetadata: opts.onInitMetadata
    ? (meta) => opts.onInitMetadata!(ctx.threadId, meta)
    : undefined,
});
```

(If the existing call shape differs — open `provider.ts` and locate the existing `onSessionId` call site near line 230; add the new callback right after it.)

- [ ] **Step 3: Manually verify compile**

Run: `cd sidecar && bun tsc --noEmit`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/agui/provider-claude/provider.ts
git commit -m "feat(sidecar): provider plumbs onInitMetadata callback"
```

---

## Task 4: GET /threads/:id/context route + server wiring

**Files:**
- Create: `sidecar/src/routes/threadContext.ts`
- Create: `sidecar/src/routes/threadContext.test.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: Write the failing test**

```ts
// sidecar/src/routes/threadContext.test.ts
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { SessionMetadataStore } from "../services/sessionMetadata";
import { buildThreadContextRoutes } from "./threadContext";

describe("GET /threads/:id/context", () => {
  it("returns empty payload when thread has no recorded metadata", async () => {
    const store = new SessionMetadataStore();
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/missing/context");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: unknown[]; mcpServers: unknown[] };
    expect(body.skills).toEqual([]);
    expect(body.mcpServers).toEqual([]);
  });

  it("maps mcp_servers from store: connected status → connected:true", async () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", {
      mcpServers: [
        { name: "github", status: "connected" },
        { name: "slack", status: "disconnected" },
        { name: "filesystem", status: "failed_to_connect" },
      ],
      tools: ["Read", "Write"],
    });
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/thr_a/context");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mcpServers: Array<{ name: string; connected: boolean; description: string }>;
    };
    expect(body.mcpServers).toEqual([
      { name: "github", description: "", connected: true },
      { name: "slack", description: "", connected: false },
      { name: "filesystem", description: "", connected: false },
    ]);
  });

  it("returns empty skills array (skill discovery is a follow-up)", async () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", { mcpServers: [], tools: ["Read"] });
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/thr_a/context");
    const body = (await res.json()) as { skills: unknown[] };
    expect(body.skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/routes/threadContext.test.ts`
Expected: FAIL — `Cannot find module './threadContext'`

- [ ] **Step 3: Implement the route**

```ts
// sidecar/src/routes/threadContext.ts
import { Hono } from "hono";
import type { SessionMetadataStore } from "../services/sessionMetadata";

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  color?: string;
}

interface McpEntry {
  name: string;
  description: string;
  connected: boolean;
}

/**
 * GET /threads/:threadId/context — what the SDK actually loaded for the
 * most recent Run of this thread. Empty arrays when the thread hasn't
 * started yet (or sidecar restarted since last Run — in-memory store).
 *
 * Skills are intentionally empty for now: SDK doesn't expose a stable
 * "skill" concept on system.init yet. The route shape is stable so the
 * frontend can be wired today; populate the array once we know how to
 * identify skill-exposed tools.
 */
export function buildThreadContextRoutes(store: SessionMetadataStore): Hono {
  const app = new Hono();

  app.get("/threads/:threadId/context", (c) => {
    const threadId = c.req.param("threadId");
    const meta = store.get(threadId);
    const mcpServers: McpEntry[] = (meta?.mcpServers ?? []).map((s) => ({
      name: s.name,
      description: "",
      connected: s.status === "connected",
    }));
    const skills: SkillEntry[] = [];
    return c.json({ skills, mcpServers });
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/routes/threadContext.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Wire into server.ts**

Locate the section in `sidecar/src/server.ts` near the import block (around line 1-25). Add:

```ts
import { SessionMetadataStore } from "./services/sessionMetadata";
import { buildThreadContextRoutes } from "./routes/threadContext";
```

Locate the section that instantiates `providerSettings`, `userProfileSettings`, etc. (around line 64-76). After `const settingsTools = ...`, add:

```ts
const sessionMetadata = new SessionMetadataStore();
```

Locate `buildProvider()` (around line 129-146). Inside the `createClaudeProvider({...})` call, add:

```ts
  onInitMetadata: (threadId, meta) => sessionMetadata.upsert(threadId, meta),
```

Locate the `app.route("/", buildModelsRoutes(providerSettings));` line (search for it in server.ts). Right after that line, add:

```ts
app.route("/", buildThreadContextRoutes(sessionMetadata));
```

- [ ] **Step 6: Sanity-check sidecar boots**

Run: `cd sidecar && bun tsc --noEmit`
Expected: no type errors

Run: `cd sidecar && bun test`
Expected: all existing + new tests pass

- [ ] **Step 7: Commit**

```bash
git add sidecar/src/routes/threadContext.ts sidecar/src/routes/threadContext.test.ts sidecar/src/server.ts
git commit -m "feat(sidecar): GET /threads/:id/context route + wire store into provider"
```

---

## Task 5: ChatState.runStartedAt + RUN_STARTED reducer

**Files:**
- Modify: `src/lib/agui/runtime/types.ts`
- Modify: `src/lib/agui/runtime/reducer.ts`
- Create: `src/lib/agui/runtime/reducer.test.ts` (file exists? if not create; check first)

- [ ] **Step 1: Check if reducer.test.ts exists**

Run: `ls /path/to/agent-studio/src/lib/agui/runtime/reducer.test.ts 2>&1 || echo "missing"`
Expected: either path printed or "missing"

If missing, the test will be added to a new file. If exists, append to it.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/agui/runtime/reducer.test.ts` (create file if missing):

```ts
import { describe, expect, it } from "bun:test";
import { applyEvent } from "./reducer";
import { createInitialState } from "./types";

describe("reducer — RUN_STARTED captures runStartedAt", () => {
  it("sets runStartedAt to a number on RUN_STARTED", () => {
    const before = Date.now() - 1;
    const buf = new Map<string, string>();
    const next = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    expect(next.runStartedAt).toBeGreaterThanOrEqual(before);
    expect(next.runStartedAt).toBeLessThanOrEqual(Date.now());
  });

  it("RUN_FINISHED clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    expect(started.runStartedAt).not.toBeNull();
    const finished = applyEvent(
      started,
      { type: "RUN_FINISHED", threadId: "t", runId: "r" },
      buf,
    );
    expect(finished.runStartedAt).toBeNull();
  });

  it("RUN_ERROR clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const errored = applyEvent(
      started,
      { type: "RUN_ERROR", message: "boom" },
      buf,
    );
    expect(errored.runStartedAt).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/lib/agui/runtime/reducer.test.ts`
Expected: FAIL — `runStartedAt` field missing on ChatState

- [ ] **Step 4: Add field to ChatState**

In `src/lib/agui/runtime/types.ts`, add to the `ChatState` interface (right after `lastCursor`):

```ts
  /** RUN_STARTED 写入的 epoch ms 时间戳；RUN_FINISHED / RUN_ERROR 清空。
   *  UI 用来计算每秒刷新的 elapsed 显示。 */
  runStartedAt: number | null;
```

Update `createInitialState()` to seed it:

```ts
export function createInitialState(): ChatState {
  return {
    historicalMessages: [],
    liveMessages: [],
    isRunning: false,
    isThinking: false,
    activeRunId: null,
    pendingInterrupts: [],
    error: null,
    lastCursor: null,
    runStartedAt: null,
  };
}
```

- [ ] **Step 5: Handle RUN_STARTED in reducer + clear on finish/error**

In `src/lib/agui/runtime/reducer.ts`, add a case to the switch statement (insert before the `default:` branch):

```ts
    case "RUN_STARTED":
      next = { ...next, runStartedAt: Date.now() };
      break;
```

In `handleRunFinished`, change the return to also clear `runStartedAt`:

```ts
function handleRunFinished(state: ChatState, ev: AGUIEventLike): ChatState {
  if (ev.outcome === "interrupt" && Array.isArray(ev.interrupts)) {
    return {
      ...state,
      pendingInterrupts: ev.interrupts as PendingInterrupt[],
      retry: undefined,
    };
  }
  return {
    ...state,
    liveMessages: sweepPendingToolCalls(state.liveMessages),
    retry: undefined,
    pendingInterrupts: [],
    runStartedAt: null,
  };
}
```

In the `RUN_ERROR` case block (within `applyEvent`), add `runStartedAt: null` to the returned next state:

```ts
      next = {
        ...next,
        liveMessages: live,
        error: isCancelled ? null : message ?? next.error ?? null,
        errorCode: typeof code === "string" ? (code as never) : next.errorCode,
        pendingInterrupts: [],
        runStartedAt: null,
      };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test src/lib/agui/runtime/reducer.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 7: Run all runtime tests to confirm no regressions**

Run: `bun test src/lib/agui/runtime/`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/agui/runtime/types.ts src/lib/agui/runtime/reducer.ts src/lib/agui/runtime/reducer.test.ts
git commit -m "feat(runtime): track runStartedAt on ChatState via RUN_STARTED event"
```

---

## Task 6: deriveTodos pure selector + types

**Files:**
- Create: `src/lib/agui/runtime/derivations.ts`
- Create: `src/lib/agui/runtime/derivations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agui/runtime/derivations.test.ts
import { describe, expect, it } from "bun:test";
import { deriveTodos } from "./derivations";
import type { ChatState, MessageView } from "./types";
import { createInitialState } from "./types";

function withMessages(messages: MessageView[]): ChatState {
  return { ...createInitialState(), liveMessages: messages };
}

function todoToolCallBlock(
  toolCallId: string,
  todos: Array<{ content: string; activeForm?: string; status: string }>,
): MessageView {
  return {
    id: `msg_${toolCallId}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: {
          id: toolCallId,
          toolName: "TodoWrite",
          args: { todos },
          result: null,
          status: "pending",
        },
      },
    ],
  };
}

describe("deriveTodos", () => {
  it("returns empty array when no TodoWrite calls present", () => {
    expect(deriveTodos(createInitialState())).toEqual([]);
  });

  it("ignores non-TodoWrite tool calls", () => {
    const state = withMessages([
      {
        id: "m1",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "t1",
              toolName: "Read",
              args: { file_path: "/x" },
              result: null,
              status: "pending",
            },
          },
        ],
      },
    ]);
    expect(deriveTodos(state)).toEqual([]);
  });

  it("returns the todos array from the most recent TodoWrite call", () => {
    const state = withMessages([
      todoToolCallBlock("tc1", [
        { content: "old", status: "completed" },
      ]),
      todoToolCallBlock("tc2", [
        { content: "newest A", activeForm: "Doing A", status: "in_progress" },
        { content: "newest B", status: "pending" },
      ]),
    ]);
    expect(deriveTodos(state)).toEqual([
      { content: "newest A", activeForm: "Doing A", status: "in_progress" },
      { content: "newest B", status: "pending" },
    ]);
  });

  it("walks both historicalMessages and liveMessages, latest wins", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        todoToolCallBlock("tc1", [{ content: "h", status: "completed" }]),
      ],
      liveMessages: [
        todoToolCallBlock("tc2", [{ content: "l", status: "pending" }]),
      ],
    };
    expect(deriveTodos(state)).toEqual([
      { content: "l", status: "pending" },
    ]);
  });

  it("filters out malformed todo entries gracefully", () => {
    const state = withMessages([
      todoToolCallBlock("tc", [
        { content: "valid", status: "pending" },
        // @ts-expect-error — intentionally malformed
        { status: "pending" }, // no content
        // @ts-expect-error — intentionally malformed
        { content: "bad-status", status: "weird" },
      ]),
    ]);
    expect(deriveTodos(state)).toEqual([
      { content: "valid", status: "pending" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/agui/runtime/derivations.test.ts`
Expected: FAIL — `Cannot find module './derivations'`

- [ ] **Step 3: Implement deriveTodos**

```ts
// src/lib/agui/runtime/derivations.ts

import type { ChatState, MessageView, ToolCallView } from "./types";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoEntry {
  content: string;
  activeForm?: string;
  status: TodoStatus;
}

const TODO_STATUSES: ReadonlySet<TodoStatus> = new Set([
  "pending",
  "in_progress",
  "completed",
]);

function isTodoEntry(v: unknown): v is TodoEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.content !== "string" || o.content.length === 0) return false;
  if (typeof o.status !== "string") return false;
  if (!TODO_STATUSES.has(o.status as TodoStatus)) return false;
  if (o.activeForm !== undefined && typeof o.activeForm !== "string") return false;
  return true;
}

function extractTodosFromArgs(args: unknown): TodoEntry[] | null {
  if (typeof args !== "object" || args === null) return null;
  const todos = (args as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return null;
  const valid = todos.filter(isTodoEntry);
  // Return [] (empty array, NOT null) when TodoWrite was called with an
  // empty list — still counts as "newest call" so older calls don't bleed.
  return valid.length === todos.length || valid.length > 0 ? valid : null;
}

function todoCallsInTurns(messages: MessageView[]): ToolCallView[] {
  const out: ToolCallView[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const block of m.blocks) {
      if (block.kind === "tool_call" && block.toolCall.toolName === "TodoWrite") {
        out.push(block.toolCall);
      }
    }
  }
  return out;
}

/**
 * Latest TodoWrite invocation's `todos` array. Walks historicalMessages
 * (DB-loaded) then liveMessages (streaming). The chronological assumption
 * is: messages are appended in order, so the LAST TodoWrite call across
 * both lists is the agent's current plan. Each TodoWrite is a full
 * replacement — agents call this whenever the plan changes.
 */
export function deriveTodos(state: ChatState): TodoEntry[] {
  const calls = [
    ...todoCallsInTurns(state.historicalMessages),
    ...todoCallsInTurns(state.liveMessages),
  ];
  for (let i = calls.length - 1; i >= 0; i--) {
    const todos = extractTodosFromArgs(calls[i]!.args);
    if (todos !== null) return todos;
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/agui/runtime/derivations.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/agui/runtime/derivations.ts src/lib/agui/runtime/derivations.test.ts
git commit -m "feat(runtime): deriveTodos pure selector over ChatState"
```

---

## Task 7: deriveTouchedFiles pure selector

**Files:**
- Modify: `src/lib/agui/runtime/derivations.ts`
- Modify: `src/lib/agui/runtime/derivations.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agui/runtime/derivations.test.ts`:

```ts
import { deriveTouchedFiles } from "./derivations";

function fileToolCall(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
): MessageView {
  return {
    id: `msg_${id}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: { id, toolName, args, result: null, status: "success" },
      },
    ],
  };
}

describe("deriveTouchedFiles", () => {
  const CWD = "/work/proj";

  it("returns empty when no file tool calls", () => {
    expect(deriveTouchedFiles(createInitialState(), CWD)).toEqual([]);
  });

  it("collects Read/Write/Edit/MultiEdit/NotebookEdit, ignores others", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
      fileToolCall("b", "Write", { file_path: "/work/proj/b.ts" }),
      fileToolCall("c", "Edit", { file_path: "/work/proj/c.ts" }),
      fileToolCall("d", "MultiEdit", { file_path: "/work/proj/d.ts" }),
      fileToolCall("e", "NotebookEdit", { notebook_path: "/work/proj/e.ipynb" }),
      fileToolCall("f", "Bash", { command: "ls" }),
      fileToolCall("g", "Glob", { pattern: "*" }),
    ]);
    const got = deriveTouchedFiles(state, CWD).map((f) => f.relativePath).sort();
    expect(got).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ipynb"]);
  });

  it("filters out paths outside cwd", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
      fileToolCall("b", "Read", { file_path: "/home/user/.zshrc" }),
      fileToolCall("c", "Read", { file_path: "/work/other-proj/x.ts" }),
    ]);
    const paths = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    expect(paths).toEqual(["a.ts"]);
  });

  it("dedupes by path; lastTool reflects most recent action", () => {
    const state = withMessages([
      fileToolCall("a1", "Read", { file_path: "/work/proj/x.ts" }),
      fileToolCall("a2", "Edit", { file_path: "/work/proj/x.ts" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    expect(files[0]!.firstTool).toBe("Read");
    expect(files[0]!.lastTool).toBe("Edit");
  });

  it("first-seen Write marks file new=true; first-seen Read marks new=false", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/new.ts" }),
      fileToolCall("b", "Read", { file_path: "/work/proj/old.ts" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    const newOne = files.find((f) => f.relativePath === "new.ts");
    const oldOne = files.find((f) => f.relativePath === "old.ts");
    expect(newOne?.firstTool).toBe("Write");
    expect(oldOne?.firstTool).toBe("Read");
  });

  it("sorts by lastTouched descending (most-recent-action first)", () => {
    const state = withMessages([
      fileToolCall("1", "Read", { file_path: "/work/proj/early.ts" }),
      fileToolCall("2", "Read", { file_path: "/work/proj/middle.ts" }),
      fileToolCall("3", "Edit", { file_path: "/work/proj/early.ts" }),
    ]);
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // After edit, early.ts becomes most recent again
    expect(order).toEqual(["early.ts", "middle.ts"]);
  });

  it("returns empty when workingDir is null", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
    ]);
    expect(deriveTouchedFiles(state, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/agui/runtime/derivations.test.ts`
Expected: FAIL — `deriveTouchedFiles` not exported

- [ ] **Step 3: Implement deriveTouchedFiles**

Append to `src/lib/agui/runtime/derivations.ts`:

```ts
export type FileTool =
  | "Read"
  | "Write"
  | "Edit"
  | "MultiEdit"
  | "NotebookEdit";

const FILE_TOOLS: ReadonlySet<string> = new Set<FileTool>([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

export interface TouchedFile {
  absolutePath: string;
  relativePath: string;
  firstTool: FileTool;
  lastTool: FileTool;
  firstSeenAt: number;
  lastTouched: number;
}

function extractFilePath(toolName: string, args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const o = args as Record<string, unknown>;
  if (toolName === "NotebookEdit") {
    return typeof o.notebook_path === "string" ? o.notebook_path : null;
  }
  return typeof o.file_path === "string" ? o.file_path : null;
}

function fileCallsInOrder(
  messages: MessageView[],
): Array<{ tool: FileTool; path: string; seq: number }> {
  const out: Array<{ tool: FileTool; path: string; seq: number }> = [];
  let seq = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const block of m.blocks) {
      seq++;
      if (block.kind !== "tool_call") continue;
      const toolName = block.toolCall.toolName;
      if (!FILE_TOOLS.has(toolName)) continue;
      const path = extractFilePath(toolName, block.toolCall.args);
      if (!path) continue;
      out.push({ tool: toolName as FileTool, path, seq });
    }
  }
  return out;
}

/**
 * Cross-Run aggregate of files this thread's agent has touched via
 * Read / Write / Edit / MultiEdit / NotebookEdit. Paths outside
 * `workingDir` are dropped (system files like ~/.zshrc shouldn't
 * pollute the project file list).
 *
 * `seq` is a synthetic per-state ordinal — block index across messages —
 * used in place of real timestamps which we don't carry through the
 * reducer. It only needs to be monotonic within one derivation pass.
 *
 * Returns files sorted by lastTouched descending (most-recent action first).
 */
export function deriveTouchedFiles(
  state: ChatState,
  workingDir: string | null,
): TouchedFile[] {
  if (!workingDir) return [];
  const cwdPrefix = workingDir.endsWith("/") ? workingDir : workingDir + "/";
  const calls = [
    ...fileCallsInOrder(state.historicalMessages),
    ...fileCallsInOrder(state.liveMessages),
  ];
  const map = new Map<string, TouchedFile>();
  for (const call of calls) {
    if (!call.path.startsWith(cwdPrefix)) continue;
    const relative = call.path.slice(cwdPrefix.length);
    const existing = map.get(call.path);
    if (existing) {
      map.set(call.path, {
        ...existing,
        lastTool: call.tool,
        lastTouched: call.seq,
      });
    } else {
      map.set(call.path, {
        absolutePath: call.path,
        relativePath: relative,
        firstTool: call.tool,
        lastTool: call.tool,
        firstSeenAt: call.seq,
        lastTouched: call.seq,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.lastTouched - a.lastTouched);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/agui/runtime/derivations.test.ts`
Expected: PASS — all `deriveTouchedFiles` tests + previous `deriveTodos` tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/agui/runtime/derivations.ts src/lib/agui/runtime/derivations.test.ts
git commit -m "feat(runtime): deriveTouchedFiles selector with cwd filter"
```

---

## Task 8: useThreadPlan + useThreadRunMeta hooks

**Files:**
- Create: `src/lib/agui/react/useThreadPlan.ts`
- Create: `src/lib/agui/react/useThreadRunMeta.ts`

- [ ] **Step 1: Implement useThreadPlan**

```ts
// src/lib/agui/react/useThreadPlan.ts
import { useMemo } from "react";
import { useChat } from "./useChat";
import { deriveTodos, type TodoEntry } from "../runtime/derivations";

/**
 * Subscribe to a thread's ChatRuntime and derive the latest TodoWrite plan.
 * Memoised: only recomputes when the underlying state reference changes
 * (which is fine — runtime returns new state objects on every event).
 *
 * Returns `{ todos: [] }` while the thread has no TodoWrite calls yet — UI
 * components render the "等待 agent 制定计划…" empty state.
 */
export function useThreadPlan(threadId: string | null | undefined): {
  todos: TodoEntry[];
} {
  const { state } = useChat({ threadId: threadId ?? "" });
  const todos = useMemo(() => deriveTodos(state), [state]);
  return { todos };
}
```

- [ ] **Step 2: Implement useThreadRunMeta**

```ts
// src/lib/agui/react/useThreadRunMeta.ts
import { useEffect, useState } from "react";
import { useChat } from "./useChat";

/**
 * Per-thread run timing. `runStartedAt` is set by RUN_STARTED, cleared by
 * RUN_FINISHED / RUN_ERROR. `elapsedSeconds` ticks every 1s while the run
 * is active so the UI status pill stays live without re-rendering the
 * entire ChatStream.
 *
 * Components reading this should expect `elapsedSeconds` to be 0 when the
 * thread is idle.
 */
export function useThreadRunMeta(threadId: string | null | undefined): {
  runStartedAt: number | null;
  elapsedSeconds: number;
  isRunning: boolean;
} {
  const { state, isRunning } = useChat({ threadId: threadId ?? "" });
  const runStartedAt = state.runStartedAt;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (runStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runStartedAt]);

  return { runStartedAt, elapsedSeconds, isRunning };
}
```

- [ ] **Step 3: Manually verify compile**

Run: `bun tsc -b --noEmit`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/agui/react/useThreadPlan.ts src/lib/agui/react/useThreadRunMeta.ts
git commit -m "feat(hooks): useThreadPlan + useThreadRunMeta from derivations"
```

---

## Task 9: useThreadFiles hook

**Files:**
- Create: `src/lib/agui/react/useThreadFiles.ts`

- [ ] **Step 1: Implement useThreadFiles**

```ts
// src/lib/agui/react/useThreadFiles.ts
import { useMemo } from "react";
import { useChat } from "./useChat";
import {
  deriveTouchedFiles,
  type TouchedFile,
} from "../runtime/derivations";

/**
 * Files the agent has touched in this thread (cross-Run), filtered to
 * paths inside `workingDir`. Returns empty when workingDir is null
 * (thread not yet bound to a project directory) — caller renders the
 * "agent 还没读写文件" empty state.
 */
export function useThreadFiles(
  threadId: string | null | undefined,
  workingDir: string | null | undefined,
): { files: TouchedFile[] } {
  const { state } = useChat({ threadId: threadId ?? "" });
  const files = useMemo(
    () => deriveTouchedFiles(state, workingDir ?? null),
    [state, workingDir],
  );
  return { files };
}
```

- [ ] **Step 2: Manually verify compile**

Run: `bun tsc -b --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/agui/react/useThreadFiles.ts
git commit -m "feat(hooks): useThreadFiles with cwd filter"
```

---

## Task 10: useThreadContext hook

**Files:**
- Create: `src/lib/agui/react/useThreadContext.ts`

- [ ] **Step 1: Implement useThreadContext**

```ts
// src/lib/agui/react/useThreadContext.ts
import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface ContextSkill {
  id: string;
  name: string;
  description: string;
  color?: string;
}

export interface ContextMcpServer {
  name: string;
  description: string;
  connected: boolean;
}

export interface ThreadContext {
  skills: ContextSkill[];
  mcpServers: ContextMcpServer[];
}

const EMPTY_CONTEXT: ThreadContext = { skills: [], mcpServers: [] };

/**
 * Fetch the SDK runtime capabilities (skills + mcp servers) for a thread.
 * Backed by GET /threads/:id/context on the sidecar; that route reads the
 * in-memory SessionMetadataStore populated by bridge.ts on system.init.
 *
 * Returns EMPTY_CONTEXT when threadId is missing or when the route
 * answers 200 with empty arrays (thread not started, sidecar restarted
 * since last Run, etc).
 */
export function useThreadContext(threadId: string | null | undefined): {
  context: ThreadContext;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery<ThreadContext>({
    enabled: Boolean(threadId),
    queryKey: ["thread-context", threadId],
    queryFn: async () => {
      const res = await fetchSidecar(`/threads/${threadId}/context`);
      if (!res.ok) throw new Error(`thread-context ${res.status}`);
      return (await res.json()) as ThreadContext;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    context: query.data ?? EMPTY_CONTEXT,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 2: Manually verify compile**

Run: `bun tsc -b --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/agui/react/useThreadContext.ts
git commit -m "feat(hooks): useThreadContext fetches /threads/:id/context"
```

---

## Task 11: ProcessTab refactor (threadId + useThreadPlan + useThreadRunMeta)

**Files:**
- Modify: `src/features/task/ProcessTab.tsx`
- Modify: `src/i18n/locales/zh/task.ts`
- Modify: `src/i18n/locales/en/task.ts`

- [ ] **Step 1: Add i18n keys**

Read existing `src/i18n/locales/zh/task.ts` and `src/i18n/locales/en/task.ts` first to see the structure. Then add:

In `src/i18n/locales/zh/task.ts` under `processTab`:

```ts
empty: {
  notStarted: "等待 agent 制定计划…",
},
```

In `src/i18n/locales/en/task.ts` under `processTab`:

```ts
empty: {
  notStarted: "Waiting for agent to share a plan…",
},
```

(If the existing `processTab.empty` already exists with different content, REPLACE it with the structured form above. Match the file's existing nesting style.)

- [ ] **Step 2: Rewrite ProcessTab**

Replace the full content of `src/features/task/ProcessTab.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadPlan } from "@/lib/agui/react/useThreadPlan";
import { useThreadRunMeta } from "@/lib/agui/react/useThreadRunMeta";
import type { TodoEntry, TodoStatus } from "@/lib/agui/runtime/derivations";

interface ProcessTabProps {
  threadId: string | null;
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function StepIndicator({ status }: { status: TodoStatus }) {
  if (status === "completed") {
    return (
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--success-100))" }}
      >
        <Check size={12} strokeWidth={2.5} style={{ color: "hsl(var(--oncolor-100))" }} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        className="relative w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--brand-100))" }}
      >
        <span
          className="absolute -inset-1 rounded-full pulse-dot"
          style={{ background: "hsl(var(--brand-100))", opacity: 0.2 }}
        />
        <span
          className="relative w-2 h-2 rounded-full"
          style={{ background: "hsl(var(--oncolor-100))" }}
        />
      </span>
    );
  }
  return (
    <span
      className="w-6 h-6 rounded-full shrink-0"
      style={{ border: "1.5px dashed hsl(var(--text-400) / 0.4)" }}
    />
  );
}

function ProcessStep({
  todo,
  isLast,
}: {
  todo: TodoEntry;
  isLast: boolean;
}) {
  const label =
    todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content;
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <StepIndicator status={todo.status} />
        {!isLast && (
          <div
            className="flex-1 w-px mt-1 mb-1 min-h-[18px]"
            style={{
              background:
                todo.status === "completed"
                  ? "hsl(var(--success-100) / 0.5)"
                  : "hsl(var(--border-300) / 0.2)",
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5 pb-4">
        <div
          className={cn(
            "text-[13px] leading-snug",
            todo.status === "in_progress" && "text-text-100 font-medium",
            todo.status === "completed" && "text-text-200",
            todo.status === "pending" && "text-text-400",
          )}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function ProcessTab({ threadId }: ProcessTabProps) {
  const { t } = useTranslation();
  const { todos } = useThreadPlan(threadId);
  const { elapsedSeconds, isRunning } = useThreadRunMeta(threadId);

  const doneCount = todos.filter((s) => s.status === "completed").length;
  const totalCount = todos.length;

  if (totalCount === 0) {
    // No TodoWrite yet — show empty state. If a run is active, still
    // render the elapsed banner so users see something is happening.
    return (
      <div>
        <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
          {t("task.processTab.empty.notStarted")}
        </div>
        {isRunning && (
          <div
            className="mt-3 mx-2 px-3 py-2 rounded-md text-[11.5px] text-text-400 leading-relaxed"
            style={{
              background: "hsl(var(--bg-200) / 0.4)",
              border: "1px solid hsl(var(--border-300) / 0.08)",
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-100 pulse-dot mr-2 align-middle" />
            {t("task.processTab.status.running")} ·{" "}
            {t("task.processTab.elapsed", { time: formatElapsed(elapsedSeconds) })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-3 pb-3">
        <span className="text-[11px] tracking-wider uppercase text-text-400">
          {t("task.processTab.plan")}
        </span>
        <span className="text-[11.5px] text-text-300 font-mono">
          {t("task.processTab.countOf", { done: doneCount, total: totalCount })}
        </span>
      </div>
      <div className="px-2">
        {todos.map((todo, i) => (
          <ProcessStep key={i} todo={todo} isLast={i === todos.length - 1} />
        ))}
      </div>
      {isRunning && (
        <div
          className="mt-3 mx-2 px-3 py-2 rounded-md text-[11.5px] text-text-400 leading-relaxed"
          style={{
            background: "hsl(var(--bg-200) / 0.4)",
            border: "1px solid hsl(var(--border-300) / 0.08)",
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-100 pulse-dot mr-2 align-middle" />
          {t("task.processTab.status.running")} ·{" "}
          {t("task.processTab.elapsed", { time: formatElapsed(elapsedSeconds) })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `bun tsc -b --noEmit`
Expected: no errors (TaskRightPanel may now have a type error since props changed — that's fixed in Task 14)

If `TaskRightPanel.tsx` references `ProcessTab` with `task` prop, that error is expected and will be fixed in Task 14.

- [ ] **Step 4: Commit**

```bash
git add src/features/task/ProcessTab.tsx src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "refactor(task): ProcessTab reads from useThreadPlan + useThreadRunMeta"
```

---

## Task 12: FilesTab refactor (drop Add button)

**Files:**
- Modify: `src/features/task/FilesTab.tsx`
- Modify: `src/i18n/locales/zh/task.ts`
- Modify: `src/i18n/locales/en/task.ts`

- [ ] **Step 1: Adjust i18n keys**

In `src/i18n/locales/zh/task.ts` under `filesTab`:
- Keep: `fileCount` (still used for count display)
- DELETE: `addFiles` (button gone)
- ADD or REPLACE: `empty: "agent 还没读写文件"`
- KEEP: `newBadge` (still used)

Mirror in `src/i18n/locales/en/task.ts`:
- DELETE: `addFiles`
- ADD or REPLACE: `empty: "Agent hasn't touched any files yet"`

- [ ] **Step 2: Rewrite FilesTab**

Replace full content of `src/features/task/FilesTab.tsx`:

```tsx
import { useCallback } from "react";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Presentation,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThreadFiles } from "@/lib/agui/react/useThreadFiles";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";

type LucideIcon = typeof FileIcon;

interface IconMeta {
  Icon: LucideIcon;
  color: string;
}

// Per-extension icon + color. The two literal HSL values (xlsx green,
// pptx terracotta) are categorical-palette identifiers from the prototype —
// see the design-tokens skill's exception clause.
function metaForPath(path: string): IconMeta {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) {
    return { Icon: FileSpreadsheet, color: "hsl(125 40% 50%)" };
  }
  if (lower.endsWith(".pptx") || lower.endsWith(".key")) {
    return { Icon: Presentation, color: "hsl(15 75% 55%)" };
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".svg")) {
    return { Icon: ImageIcon, color: "hsl(var(--text-400))" };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return { Icon: FileText, color: "hsl(var(--text-400))" };
  }
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".py") || lower.endsWith(".rs") || lower.endsWith(".go")) {
    return { Icon: FileText, color: "hsl(var(--accent-pro-100))" };
  }
  return { Icon: FileIcon, color: "hsl(var(--text-400))" };
}

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

interface FilesTabProps {
  threadId: string | null;
  workingDir: string | null;
  onOpenFile?: (file: TouchedFile) => void;
}

export function FilesTab({ threadId, workingDir, onOpenFile }: FilesTabProps) {
  const { t } = useTranslation();
  const { files } = useThreadFiles(threadId, workingDir);

  const handleSelect = useCallback(
    (file: TouchedFile) => {
      onOpenFile?.(file);
    },
    [onOpenFile],
  );

  if (files.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.filesTab.empty")}
      </div>
    );
  }

  const folderName = workingDir ? basename(workingDir) : "";

  return (
    <div>
      <div className="flex items-center gap-2 px-2 pt-3 pb-2">
        <Folder size={14} className="text-text-300" />
        <span className="text-[13.5px] font-medium text-text-100">
          {folderName}
        </span>
        <span className="ml-auto text-[11px] text-text-400 font-mono">
          {t("task.filesTab.fileCount", { count: files.length })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {files.map((file) => {
          const { Icon, color } = metaForPath(file.relativePath);
          const isNew = file.firstTool === "Write";
          return (
            <button
              key={file.absolutePath}
              type="button"
              onClick={() => handleSelect(file)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition text-left"
            >
              <Icon size={14} className="shrink-0" style={{ color }} />
              <span className="text-[13px] text-text-200 truncate flex-1">
                {file.relativePath}
              </span>
              {isNew && (
                <span
                  className="text-[10.5px] px-1.5 py-px rounded shrink-0"
                  style={{
                    background: "hsl(var(--brand-100) / 0.15)",
                    color: "hsl(var(--brand-100))",
                  }}
                >
                  {t("task.filesTab.newBadge")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `bun tsc -b --noEmit`
Expected: TaskRightPanel.tsx may still error (fixed in Task 14)

- [ ] **Step 4: Commit**

```bash
git add src/features/task/FilesTab.tsx src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "refactor(task): FilesTab reads from useThreadFiles, drop Add button"
```

---

## Task 13: ContextTab refactor

**Files:**
- Modify: `src/features/task/ContextTab.tsx`
- Modify: `src/i18n/locales/zh/task.ts`
- Modify: `src/i18n/locales/en/task.ts`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/locales/zh/task.ts` under `contextTab`, add (preserve existing `skills`, `mcpServers`, `skillsLoaded`, `mcpOnCount`, `connected`, `disconnected`, `off`):

```ts
empty: {
  notStarted: "等待 agent 启动…",
  noCapabilities: "未加载任何 skill 或 MCP server",
  goToCustomize: "前往自定义",
},
```

Mirror in `src/i18n/locales/en/task.ts`:

```ts
empty: {
  notStarted: "Waiting for agent to start…",
  noCapabilities: "No skills or MCP servers loaded",
  goToCustomize: "Open Customize",
},
```

- [ ] **Step 2: Rewrite ContextTab**

Replace full content of `src/features/task/ContextTab.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { useThreadContext } from "@/lib/agui/react/useThreadContext";

interface ContextTabProps {
  threadId: string | null;
}

function SectionHeading({ label, count }: { label: string; count: string }) {
  return (
    <div className="text-[11px] tracking-wider uppercase text-text-400 pt-3 pb-2 px-2 flex items-center justify-between">
      <span>{label}</span>
      <span className="text-text-400/70 font-mono normal-case tracking-normal">
        {count}
      </span>
    </div>
  );
}

export function ContextTab({ threadId }: ContextTabProps) {
  const { t } = useTranslation();
  const { context, isLoading } = useThreadContext(threadId);
  const { skills, mcpServers } = context;

  if (isLoading) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.contextTab.empty.notStarted")}
      </div>
    );
  }

  if (skills.length === 0 && mcpServers.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        <div>{t("task.contextTab.empty.noCapabilities")}</div>
        <Link
          to="/customize"
          className="mt-3 inline-block text-[12px] underline underline-offset-4"
          style={{ color: "hsl(var(--brand-100))" }}
        >
          {t("task.contextTab.empty.goToCustomize")}
        </Link>
      </div>
    );
  }

  const onCount = mcpServers.filter((m) => m.connected).length;

  return (
    <div>
      {skills.length > 0 && (
        <>
          <SectionHeading
            label={t("task.contextTab.skills")}
            count={t("task.contextTab.skillsLoaded", { count: skills.length })}
          />
          <div className="flex flex-col gap-1">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-bg-200/60 transition"
              >
                <InitialsAvatar
                  initials={skill.name.slice(0, 1).toUpperCase()}
                  size={20}
                  className="shrink-0 text-[10px] font-bold"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-200 font-mono leading-tight">
                    {skill.name}
                  </div>
                  {skill.description && (
                    <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                      {skill.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mcpServers.length > 0 && (
        <div className={skills.length > 0 ? "pt-2" : ""}>
          <SectionHeading
            label={t("task.contextTab.mcpServers")}
            count={t("task.contextTab.mcpOnCount", {
              on: onCount,
              total: mcpServers.length,
            })}
          />
          <div className="flex flex-col gap-1">
            {mcpServers.map((server) => (
              <div
                key={server.name}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-bg-200/60 transition"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: server.connected
                      ? "hsl(var(--success-100))"
                      : "hsl(var(--text-400))",
                    opacity: server.connected ? 1 : 0.4,
                  }}
                  role="status"
                  aria-label={
                    server.connected
                      ? t("task.contextTab.connected")
                      : t("task.contextTab.disconnected")
                  }
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[13px] font-mono leading-tight",
                      server.connected ? "text-text-200" : "text-text-400",
                    )}
                  >
                    {server.name}
                  </div>
                  {server.description && (
                    <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                      {server.description}
                    </div>
                  )}
                </div>
                {!server.connected && (
                  <span className="text-[10px] text-text-400 italic">
                    {t("task.contextTab.off")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `bun tsc -b --noEmit`
Expected: TaskRightPanel.tsx still mismatched (fixed in next task)

- [ ] **Step 4: Commit**

```bash
git add src/features/task/ContextTab.tsx src/i18n/locales/zh/task.ts src/i18n/locales/en/task.ts
git commit -m "refactor(task): ContextTab reads from useThreadContext with empty-state CTA"
```

---

## Task 14: TaskRightPanel + TaskView wire-up

**Files:**
- Modify: `src/features/task/TaskRightPanel.tsx`
- Modify: `src/features/task/TaskView.tsx`

- [ ] **Step 1: Rewrite TaskRightPanel**

Replace full content of `src/features/task/TaskRightPanel.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { Activity, Folder, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ProcessTab } from "@/features/task/ProcessTab";
import { FilesTab } from "@/features/task/FilesTab";
import { ContextTab } from "@/features/task/ContextTab";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";

type TabId = "process" | "files" | "context";

interface TaskRightPanelProps {
  threadId: string | null;
  workingDir: string | null;
  onOpenFile?: (file: TouchedFile) => void;
}

interface TabButtonProps {
  id: TabId;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: (id: TabId) => void;
}

function TabButton({ id, label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      title={label}
      className={cn(
        "flex items-center justify-center gap-1.5 px-2 py-1.5 rounded transition",
        active
          ? "bg-bg-000 text-text-100 shadow-sm flex-[1.6]"
          : "text-text-300 hover:text-text-100 flex-1",
      )}
    >
      {icon}
      {active && <span className="text-[12px] font-medium">{label}</span>}
    </button>
  );
}

export function TaskRightPanel({
  threadId,
  workingDir,
  onOpenFile,
}: TaskRightPanelProps) {
  const [tab, setTab] = useState<TabId>("process");
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2">
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-md"
          style={{
            background: "hsl(var(--bg-200))",
            border: "1px solid hsl(var(--border-300) / 0.12)",
          }}
        >
          <TabButton
            id="process"
            label={t("task.tabs.process")}
            icon={<Activity size={14} />}
            active={tab === "process"}
            onClick={setTab}
          />
          <TabButton
            id="files"
            label={t("task.tabs.files")}
            icon={<Folder size={14} />}
            active={tab === "files"}
            onClick={setTab}
          />
          <TabButton
            id="context"
            label={t("task.tabs.context")}
            icon={<Layers size={14} />}
            active={tab === "context"}
            onClick={setTab}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {tab === "process" && <ProcessTab threadId={threadId} />}
        {tab === "files" && (
          <FilesTab
            threadId={threadId}
            workingDir={workingDir}
            onOpenFile={onOpenFile}
          />
        )}
        {tab === "context" && <ContextTab threadId={threadId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update TaskView to pass new props**

`openPreview` from `useAppShell()` has signature `(file: MockFile) => void` where MockFile is:
```ts
{ name: string; path: string; type: "markdown" | "spreadsheet" | "presentation" | "code" | "image" | "generic"; isNew?: boolean; content?: string }
```

So TaskView needs to convert `TouchedFile` → `MockFile` inline. Add this helper at the top of `src/features/task/TaskView.tsx` (after imports, before the `TaskView` function):

```tsx
import type { TouchedFile } from "@/lib/agui/runtime/derivations";
import type { MockFile } from "@/lib/mock/types";

function touchedFileToPreview(f: TouchedFile): MockFile {
  const lower = f.relativePath.toLowerCase();
  let type: MockFile["type"] = "generic";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) type = "markdown";
  else if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) type = "spreadsheet";
  else if (lower.endsWith(".pptx") || lower.endsWith(".key")) type = "presentation";
  else if (/\.(png|jpe?g|gif|svg|webp)$/.test(lower)) type = "image";
  else if (/\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp)$/.test(lower)) type = "code";
  return {
    name: f.relativePath.split("/").pop() ?? f.relativePath,
    path: f.absolutePath,
    type,
    isNew: f.firstTool === "Write",
  };
}
```

Then locate the `<TaskRightPanel onOpenFile={openPreview} />` usage and replace with:

```tsx
<TaskRightPanel
  threadId={activeTaskId}
  workingDir={cwd}
  onOpenFile={(file) => openPreview(touchedFileToPreview(file))}
/>
```

(`cwd` and `activeTaskId` are already locally defined in TaskView around lines 24-63.)

- [ ] **Step 3: Verify compile**

Run: `bun tsc -b --noEmit`
Expected: no type errors

- [ ] **Step 4: Manual smoke test (in dev)**

Run: `bun run tauri:dev`
Then in the app:
1. Start a fresh thread, ask agent "列出 src/lib 下所有 .ts 文件" → agent uses Read/Glob
2. Watch right panel — Process Tab shows empty state, then if agent uses TodoWrite the timeline populates
3. Switch to Files Tab — should list .ts files agent read
4. Switch to Context Tab — should show "等待 agent 启动…" briefly then either "未加载…" or a list

(Manual checks only — no automated test for the UI render at this step.)

- [ ] **Step 5: Commit**

```bash
git add src/features/task/TaskRightPanel.tsx src/features/task/TaskView.tsx
git commit -m "refactor(task): wire right panel tabs to threadId + workingDir"
```

---

## Task 15: Mock cleanup + e2e verification

**Files:**
- Modify: `src/lib/mock/types.ts` (if mock types unused after refactor)
- Modify: `src/lib/mock/*.ts` (fixtures referencing removed fields)

- [ ] **Step 1: Identify which mock types remain in use**

Note: `MockFile` will STILL be used after this refactor — `AppShellContext.openPreview(file: MockFile)` and `PreviewPane` consume it as the preview viewer's data model. TaskView converts `TouchedFile → MockFile` via the `touchedFileToPreview` helper from Task 14. So **do not remove MockFile**.

Run for each candidate:

```bash
grep -rn "MockTask\b\|PlanStep\b\|StepStatus\b\|MockSkill\b\|MockMcpServer\b" /path/to/agent-studio/src --include="*.ts" --include="*.tsx"
```

Expected: outputs may show:
- Definitions in `src/lib/mock/types.ts`
- Fixture files in `src/lib/mock/*.ts`
- Storybook files (`*.stories.tsx`) — KEEP if used, Storybook is allowed to reference mocks

- [ ] **Step 2: Remove dead fields/types only if grep proves zero consumers**

For each of `MockTask.plan` / `MockTask.elapsedSeconds` / `PlanStep` / `StepStatus` / `MockSkill` / `MockMcpServer`:

1. Run the grep above
2. If only the definition file `src/lib/mock/types.ts` and fixture `src/lib/mock/*.ts` reference it (no `.tsx` consumer), it's safe to remove
3. If `.stories.tsx` or `.tsx` outside `src/lib/mock/` references it, KEEP it — Storybook still wants it
4. When removing, also remove the corresponding values from any fixture in `src/lib/mock/` that produces them

Conservative default: if grep returns ANY hit outside `src/lib/mock/`, skip removal for this iteration. The plan's goal isn't dead-code-removal completeness; just don't leave the new code referencing them.

- [ ] **Step 3: Verify typecheck + tests**

Run: `bun tsc -b --noEmit`
Run: `bun test`
Run: `cd sidecar && bun test`
Expected: all pass

- [ ] **Step 4: Run dev server end-to-end**

Run: `bun run tauri:dev`

Verify each item from the spec's Verification section:

1. New thread, ask "列出 ~/Workspace 下的所有项目" → Process Tab shows todos appearing as agent calls TodoWrite
2. agent reads/writes files → Files Tab populates, ~/.zshrc doesn't appear
3. agent Write a new file → that entry shows "new" badge
4. Click a Files Tab item → PreviewPane opens on the right
5. Switch threads, come back → Process/Files content restored
6. Restart sidecar (Ctrl+C in dev terminal, restart) → run again → Context Tab populates after Run starts
7. Fresh new thread, no Run started → all three tabs show their "未启动" empty states
8. Short task where agent skips TodoWrite → Process shows "等待…" + elapsed banner if running

(Cross off each checkbox manually as verified; document any deviations as follow-up issues.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mock/
git commit -m "chore(mock): drop right-panel mock types no longer in use"
```

---

## 完成后回顾

整个 plan 实现完毕后：
- 三个 Tab 都是真实数据驱动
- Process / Files 跨 sidecar 重启天然恢复（reducer 重跑）
- Context 在每次 Run 开始时自动刷新
- 没有新增数据库字段
- "Add files to working tree" 按钮已删除（input 框的 @-mention 留作后续小 spec）

按 spec 风险记录里说的：
- **Skill 识别**当前返回空数组（route 占位代码 `const skills: SkillEntry[] = []`），后续基于 SDK 实际输出补充实现
- **sessionMetadata 是内存态** — 重启后通过下一个 Run 自然填充

下一个独立 spec 候选：**TaskMessageInput @-mention 文件**。

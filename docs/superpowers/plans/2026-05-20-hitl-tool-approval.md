# HITL Tool Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a per-tool approval card when the Claude SDK is about to invoke a real tool, blocking execution until the user approves or denies via the chat UI.

**Architecture:** Server hooks claude-agent-sdk's `canUseTool` callback into an in-memory deferred bus keyed by `runId:toolUseID`. When the bus is called it appends a synthetic `RUN_FINISHED { outcome: "interrupt", interrupts: [...] }` event to the run-event store (existing reducer + snapshot hydration already understand this shape) and flips run status to `awaiting_approval`. The callback then awaits a Promise that the new `POST /runs/:runId/resume` route resolves with `{ behavior: "allow" } | { behavior: "deny", message }`. Resuming a run = the SDK's pending `canUseTool` Promise resolves, the SDK proceeds, and the eventual real `RUN_FINISHED` flows through the existing pipeline.

**Tech Stack:** claude-agent-sdk v0.3.x `canUseTool` / `PermissionResult`, Hono, bun:sqlite store, AG-UI event protocol, existing frontend runtime (already exposes `pendingInterrupts`, `resumeRun`).

---

## Scope & Boundaries

**In scope (v1):**
- One tool whitelist (`Bash`) so HITL has an interrupt to fire on at all
- In-memory deferred bus — process restart kills pending approvals (orphan reconcile already flips them to `error`)
- One interrupt at a time per run; user approves/denies before any further tool call fires
- Frontend renders existing `<Confirmation>` ai-element inline in `ChatStream`
- `allow` / `deny`; no inline edit, no "always allow"

**Out of scope (v2+):**
- Parallel interrupts batch resume (frontend already warns about this)
- Persisting deferreds across restart
- Permission rule persistence (`updatedPermissions` on the SDK side)
- "Always allow" for a tool/pattern
- Edit-tool-args before approval
- Multiple tool whitelists / per-conversation config

## File Structure

**NEW**
- `sidecar/src/agui/provider-claude/interrupt-bus.ts` — runId-scoped deferred map; `requestApproval` (called from `canUseTool`) + `resolve` (called from /resume route) + `cancelAll` (called on run abort/error). Writes the synthetic interrupt event + status flip to the store.
- `sidecar/src/agui/provider-claude/interrupt-bus.test.ts` — unit tests for the bus state machine.

**MODIFY**
- `sidecar/src/agui/provider-claude/provider.ts` — accept `interruptBus` in options; wire `canUseTool` into `sdkQuery`; thread `runId` into the callback.
- `sidecar/src/agui/provider-claude/index.ts` — re-export `createInterruptBus`.
- `sidecar/src/server.ts` — instantiate bus once at boot; pass to provider; pass to runs route; set `allowedTools: ["Bash"]`.
- `sidecar/src/routes/runs.ts` — add `POST /runs/:runId/resume`; on success, the existing `runWorker` keeps streaming events from the SDK so the same SSE listener picks them up (frontend already re-attaches with `attachToRun`).
- `sidecar/src/agent/runWorker.ts` — call `interruptBus.cancelAll(runId)` on terminal so a cancel mid-approval doesn't strand the SDK.
- `src/features/task/TaskView.tsx` — destructure `pendingInterrupts` + `resumeRun` from `useChat` and pass to `ChatStream`.
- `src/features/task/ChatStream.tsx` — when `pendingInterrupts.length > 0` render `<Confirmation>` block at the end of the message list before the input.

**NO CHANGE NEEDED**
- `src/lib/agui/react/useChat.ts` — already exposes `pendingInterrupts`, `resumeRun`, `isAwaitingApproval`.
- `src/lib/agui/runtime/runtime.ts`, `reducer.ts`, `protocol.ts` — already handle `outcome:"interrupt"` synthetic `RUN_FINISHED` and pending-interrupt clearing on `resume`.
- `sidecar/src/agui/store-sqlite/createBunSqliteRunStore.ts` — `hydrateSnapshot` already reads `outcome:"interrupt"` + `interrupts:[]` when status is `awaiting_approval`.
- `sidecar/src/agui/core/runLoop.ts` / `streamConsumer.ts` — the "interrupted outcome at end of stream" path stays dead for claude-agent-sdk (interrupts fire mid-stream from `canUseTool`, not via `provider.getPendingInterrupts`).

## Wire-Format Contracts

**Synthetic interrupt event** (appended by bus mid-stream, treated as terminal by SSE client → SSE closes → re-attached by `resume()`):

```ts
{
  type: "RUN_FINISHED",
  threadId: string,
  runId: string,
  outcome: "interrupt",
  interrupts: [{
    id: string,             // toolUseID from SDK
    reason: "tool_approval",
    payload: {
      toolName: string,
      input: Record<string, unknown>,
      title?: string,       // SDK-provided ("Claude wants to read foo.txt")
      description?: string, // SDK-provided
    }
  }]
}
```

**Resume request body** (already shaped by frontend `buildResumeRequest`):

```ts
POST /runs/:runId/resume
{
  resumes: [{
    interruptId: string,
    payload: {
      decisions: [
        | { type: "allow" }
        | { type: "deny", message?: string }
      ]
    }
  }]
}
```

Server walks `resumes`, looks each `interruptId` up in the bus, resolves with:
- `{ type: "allow" }` → `{ behavior: "allow" }`
- `{ type: "deny", message }` → `{ behavior: "deny", message: message ?? "User declined" }`

v1 forwards only `resumes[0]` (matching the existing frontend `console.warn`).

---

## Task 1: InterruptBus core (TDD)

**Files:**
- Create: `sidecar/src/agui/provider-claude/interrupt-bus.ts`
- Create: `sidecar/src/agui/provider-claude/interrupt-bus.test.ts`

- [ ] **Step 1: Write the failing test file**

Replace `sidecar/src/agui/provider-claude/interrupt-bus.test.ts` with:

```ts
import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createInterruptBus } from "./interrupt-bus";
import type { RunEventStore } from "../core/store-types";
import type { AGUIEvent } from "../core/types";

function makeStubStore() {
  const appended: { runId: string; event: AGUIEvent }[] = [];
  const finished: { runId: string; status: string }[] = [];
  const store = {
    async createRun() {},
    async appendEvent(runId: string, event: AGUIEvent) {
      appended.push({ runId, event });
      return { cursor: String(appended.length), event };
    },
    async finishRun(runId: string, status: string) {
      finished.push({ runId, status });
    },
    async getRun() { return null; },
    streamFrom() { return (async function*() {})(); },
    async listThreadStatuses() { return []; },
    reconcileOrphans() { return 0; },
  } as unknown as RunEventStore;
  return { store, appended, finished };
}

describe("interrupt-bus", () => {
  it("requestApproval writes interrupt event + flips status + returns pending Promise", async () => {
    const { store, appended, finished } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_1",
      toolName: "Bash",
      input: { command: "ls" },
    });

    expect(appended).toHaveLength(1);
    const ev = appended[0]!.event as Record<string, unknown>;
    expect(ev.type).toBe(EventType.RUN_FINISHED);
    expect(ev.runId).toBe("run_1");
    expect(ev.outcome).toBe("interrupt");
    expect((ev.interrupts as Array<{ id: string; reason: string }>)[0]?.id).toBe("tu_1");
    expect((ev.interrupts as Array<{ reason: string }>)[0]?.reason).toBe("tool_approval");

    expect(finished).toEqual([{ runId: "run_1", status: "awaiting_approval" }]);

    // Promise not yet resolved
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("resolve(allow) settles the matching deferred", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_a",
      toolName: "Bash",
      input: {},
    });

    const ok = bus.resolve("run_1", "tu_a", { behavior: "allow" });
    expect(ok).toBe(true);

    const result = await pending;
    expect(result).toEqual({ behavior: "allow" });
  });

  it("resolve(deny) settles with deny + message", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_b",
      toolName: "Bash",
      input: {},
    });

    bus.resolve("run_1", "tu_b", { behavior: "deny", message: "nope" });

    const result = await pending;
    expect(result).toEqual({ behavior: "deny", message: "nope" });
  });

  it("resolve returns false for unknown interruptId", () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });
    expect(bus.resolve("run_x", "tu_missing", { behavior: "allow" })).toBe(false);
  });

  it("cancelAll(runId) rejects all pending deferreds for that run as deny", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const p1 = bus.requestApproval({
      runId: "run_1", threadId: "t", toolUseID: "tu_1",
      toolName: "Bash", input: {},
    });
    const p2 = bus.requestApproval({
      runId: "run_1", threadId: "t", toolUseID: "tu_2",
      toolName: "Bash", input: {},
    });

    bus.cancelAll("run_1");

    const r1 = await p1;
    const r2 = await p2;
    expect(r1.behavior).toBe("deny");
    expect(r2.behavior).toBe("deny");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio/sidecar && bun test src/agui/provider-claude/interrupt-bus.test.ts`
Expected: FAIL with `Cannot find module './interrupt-bus'` or similar.

- [ ] **Step 3: Write minimal implementation**

Create `sidecar/src/agui/provider-claude/interrupt-bus.ts`:

```ts
import { EventType } from "@ag-ui/core";
import type { RunEventStore } from "../core/store-types";
import type { AGUIEvent } from "../core/types";

export type PermissionResult =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string };

export interface ApprovalRequest {
  runId: string;
  threadId: string;
  toolUseID: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
}

export interface InterruptBus {
  /**
   * Called from canUseTool: writes a synthetic RUN_FINISHED(outcome:"interrupt")
   * to the store, flips status to "awaiting_approval", returns a Promise
   * that resolves when /resume calls bus.resolve() (or with deny if cancelled).
   */
  requestApproval(req: ApprovalRequest): Promise<PermissionResult>;
  /**
   * Called from POST /runs/:runId/resume. Returns true if the deferred was
   * found and resolved; false if no matching pending interrupt.
   */
  resolve(runId: string, interruptId: string, result: PermissionResult): boolean;
  /**
   * Called from runWorker on terminal status: rejects every pending deferred
   * for the run as `deny` so the SDK side unblocks and tears down cleanly.
   */
  cancelAll(runId: string): void;
}

export interface CreateInterruptBusOptions {
  store: RunEventStore;
}

export function createInterruptBus(opts: CreateInterruptBusOptions): InterruptBus {
  const { store } = opts;
  // key: `${runId}:${interruptId}` — single map keeps lookup O(1)
  // for both resolve() and cancelAll() (the latter scans keys prefixed
  // with the runId).
  const deferreds = new Map<string, (r: PermissionResult) => void>();

  return {
    async requestApproval(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      const pending = new Promise<PermissionResult>((resolve) => {
        deferreds.set(key, resolve);
      });

      const event = {
        type: EventType.RUN_FINISHED,
        threadId: req.threadId,
        runId: req.runId,
        outcome: "interrupt",
        interrupts: [
          {
            id: req.toolUseID,
            reason: "tool_approval",
            payload: {
              toolName: req.toolName,
              input: req.input,
              ...(req.title ? { title: req.title } : {}),
              ...(req.description ? { description: req.description } : {}),
            },
          },
        ],
      } as unknown as AGUIEvent;

      await store.appendEvent(req.runId, event);
      await store.finishRun(req.runId, "awaiting_approval");

      return pending;
    },

    resolve(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = deferreds.get(key);
      if (!fn) return false;
      deferreds.delete(key);
      fn(result);
      return true;
    },

    cancelAll(runId) {
      const prefix = `${runId}:`;
      for (const [key, fn] of deferreds) {
        if (!key.startsWith(prefix)) continue;
        deferreds.delete(key);
        fn({ behavior: "deny", message: "run cancelled" });
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio/sidecar && bun test src/agui/provider-claude/interrupt-bus.test.ts`
Expected: PASS — `5 pass`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/interrupt-bus.ts sidecar/src/agui/provider-claude/interrupt-bus.test.ts
git commit -m "feat(sidecar): InterruptBus — deferred map + synthetic interrupt event"
```

---

## Task 2: Re-export bus + accept it in createClaudeProvider

**Files:**
- Modify: `sidecar/src/agui/provider-claude/index.ts`
- Modify: `sidecar/src/agui/provider-claude/provider.ts:22-34`

- [ ] **Step 1: Re-export from package barrel**

Replace `sidecar/src/agui/provider-claude/index.ts` with:

```ts
export { createClaudeProvider, type ClaudeProviderOptions } from "./provider";
export {
  createInterruptBus,
  type InterruptBus,
  type ApprovalRequest,
  type PermissionResult,
} from "./interrupt-bus";
```

- [ ] **Step 2: Extend ClaudeProviderOptions**

Edit `sidecar/src/agui/provider-claude/provider.ts` — change the `ClaudeProviderOptions` interface (lines 22-34) from:

```ts
export interface ClaudeProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  allowedTools?: string[];
}
```

to:

```ts
import type { InterruptBus } from "./interrupt-bus";

export interface ClaudeProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Tools the SDK is allowed to invoke. Each call hits `canUseTool` first. */
  allowedTools?: string[];
  /**
   * HITL bus. When provided, the provider wires `canUseTool` to
   * `bus.requestApproval` so each tool invocation requires explicit user
   * approval through the existing /runs/:id/resume route.
   */
  interruptBus?: InterruptBus;
}
```

- [ ] **Step 3: Wire canUseTool into sdkQuery**

In `sidecar/src/agui/provider-claude/provider.ts`, replace the `runTurn` function (current lines 48-93) so the `sdkQuery({ options })` carries `canUseTool` whenever `opts.interruptBus` is present. Full replacement:

```ts
  function runTurn(
    ctx: RunContext | ResumeContext,
    prompt: string,
  ): AsyncIterable<AGUIEvent> {
    const ac = new AbortController();
    if (ctx.abortSignal.aborted) {
      ac.abort(ctx.abortSignal.reason);
    } else {
      ctx.abortSignal.addEventListener(
        "abort",
        () => ac.abort(ctx.abortSignal.reason),
        { once: true },
      );
    }

    const resumeSessionId = sessionByThread.get(ctx.threadId);

    const bus = opts.interruptBus;
    const canUseTool = bus
      ? async (
          toolName: string,
          input: Record<string, unknown>,
          sdkOpts: {
            toolUseID: string;
            title?: string;
            description?: string;
          },
        ) => bus.requestApproval({
          runId: ctx.runId,
          threadId: ctx.threadId,
          toolUseID: sdkOpts.toolUseID,
          toolName,
          input,
          title: sdkOpts.title,
          description: sdkOpts.description,
        })
      : undefined;

    const sdkStream = sdkQuery({
      prompt,
      options: {
        abortController: ac,
        env: buildEnv() as never,
        allowedTools: opts.allowedTools ?? [],
        includePartialMessages: true,
        ...(canUseTool ? { canUseTool: canUseTool as never } : {}),
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      },
    });

    return claudeSdkToAgui(sdkStream, {
      threadId: ctx.threadId,
      runId: ctx.runId,
      callbacks: ctx.callbacks,
      onSessionId: (sid) => {
        sessionByThread.set(ctx.threadId, sid);
      },
    });
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/agui/provider-claude/index.ts sidecar/src/agui/provider-claude/provider.ts
git commit -m "feat(sidecar): wire canUseTool → InterruptBus in claude provider"
```

---

## Task 3: Add POST /runs/:runId/resume route

**Files:**
- Modify: `sidecar/src/routes/runs.ts`

- [ ] **Step 1: Extend MountRunsDeps**

Edit `sidecar/src/routes/runs.ts`. Replace the existing `MountRunsDeps` interface (lines 8-13) with:

```ts
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";

export interface MountRunsDeps {
  threads: ThreadService;
  messages: MessageService;
  provider: AgentProvider;
  store: RunEventStore;
  interruptBus: InterruptBus;
}
```

- [ ] **Step 2: Add the /resume route**

Inside `buildRunRoutes`, add this block right BEFORE the `return app;` at the end of the function (currently line 116):

```ts
  app.post("/runs/:runId/resume", async (c) => {
    const runId = c.req.param("runId");
    const body = (await c.req.json().catch(() => null)) as
      | {
          resumes?: Array<{
            interruptId?: string;
            payload?: {
              decisions?: Array<
                | { type?: "allow" }
                | { type?: "deny"; message?: string }
              >;
            };
          }>;
        }
      | null;

    const first = body?.resumes?.[0];
    if (!first?.interruptId || !first.payload) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const decision = first.payload.decisions?.[0];
    if (!decision) return c.json({ error: "missing_decision" }, 400);

    const result =
      decision.type === "deny"
        ? {
            behavior: "deny" as const,
            message: decision.message ?? "User declined",
          }
        : { behavior: "allow" as const };

    const ok = deps.interruptBus.resolve(runId, first.interruptId, result);
    if (!ok) return c.json({ error: "interrupt_not_pending" }, 409);

    return c.json({ ok: true });
  });
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/routes/runs.ts
git commit -m "feat(sidecar): POST /runs/:id/resume route resolves InterruptBus deferreds"
```

---

## Task 4: cancelAll on terminal in runWorker

**Files:**
- Modify: `sidecar/src/agent/runWorker.ts`

- [ ] **Step 1: Accept interruptBus dep**

In `sidecar/src/agent/runWorker.ts`, edit the `RunWorkerInput` interface (lines 11-20) — add `interruptBus`:

```ts
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";

export interface RunWorkerInput {
  runId: string;
  threadId: string;
  userMessage: { role: "user"; content: string };
  store: RunEventStore;
  messages: MessageService;
  threads: ThreadService;
  provider: AgentProvider;
  interruptBus: InterruptBus;
  abortSignal: AbortSignal;
}
```

- [ ] **Step 2: Drain deferreds in onTerminal**

In the same file, edit the `executeRunLoop({ ..., onTerminal: async (status) => { ... } })` block (currently lines 77-85). Replace with:

```ts
      onTerminal: async (status) => {
        // Reject any still-pending HITL approvals for this run so the SDK
        // unblocks (canUseTool resolves as deny → SDK aborts the tool +
        // emits its own terminal). Safe to call when no deferreds exist.
        input.interruptBus.cancelAll(runId);
        messages.cancelPendingToolCallsForThread(threadId);
        if (status === "cancelled") {
          messages.appendSystemNote(threadId, "已被用户中止");
          await provider.notifyCancelled?.(threadId);
        }
        threads.touch(threadId);
      },
```

Also in the `catch (err)` block (currently lines 87-102), add a `cancelAll` BEFORE the `appendEvent` for symmetry — replace the catch body with:

```ts
  } catch (err) {
    input.interruptBus.cancelAll(runId);
    const msg = err instanceof Error ? err.message : String(err);
    await store.appendEvent(runId, {
      type: EventType.RUN_ERROR,
      message: msg,
      code: abortSignal.aborted ? "CANCELLED" : "WORKER_ERROR",
    } as never);
    await store.finishRun(runId, abortSignal.aborted ? "cancelled" : "error", msg);
    if (abortSignal.aborted) {
      try {
        messages.appendSystemNote(threadId, "已被用户中止");
      } catch {
        /* best-effort */
      }
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: errors about `runWorker` callers missing `interruptBus`. Continue — Task 5 fixes the call site.

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/agent/runWorker.ts
git commit -m "feat(sidecar): runWorker drains pending HITL deferreds on terminal"
```

---

## Task 5: Boot wiring + allowedTools=["Bash"]

**Files:**
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: Construct the bus once at boot**

Edit `sidecar/src/server.ts`. Right after `const store = createBunSqliteRunStore(db);` (current line 52), insert:

```ts
import {
  createClaudeProvider,
  createInterruptBus,
} from "./agui/provider-claude";

// (existing imports: keep)

const interruptBus = createInterruptBus({ store });
```

(Adjust the existing `import { createClaudeProvider } from "./agui/provider-claude";` line at the top of the file to the multi-line form above; remove the single-import line.)

- [ ] **Step 2: Pass interruptBus to provider + set allowedTools**

In the same file, edit `buildProvider()` (currently lines 83-92). Replace the body with:

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
  });
}
```

- [ ] **Step 3: Pass interruptBus to runs route**

In the same file, edit the `app.route("/", buildRunRoutes({ ... }))` block (current lines 114-122). Replace with:

```ts
app.route(
  "/",
  buildRunRoutes({
    threads,
    messages,
    provider: providerProxy,
    store,
    interruptBus,
  }),
);
```

- [ ] **Step 4: Pass interruptBus into runWorker call**

The `POST /runs` handler in `sidecar/src/routes/runs.ts` (lines 33-67) spawns `runWorker` — that call now needs `interruptBus`. Edit that handler:

```ts
    void runWorker({
      runId: body.runId,
      threadId: body.threadId,
      userMessage: { role: "user", content: body.message.content },
      store: deps.store,
      messages: deps.messages,
      threads: deps.threads,
      provider: deps.provider,
      interruptBus: deps.interruptBus,
      abortSignal: abort.signal,
    }).finally(() => aborters.delete(body.runId!));
```

- [ ] **Step 5: Typecheck + smoke test**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: exit 0.

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bun run build:sidecar -- --host-only`
Expected: `[build-sidecar] done (1 target)` — sidecar bundle compiles.

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/server.ts sidecar/src/routes/runs.ts
git commit -m "feat(sidecar): boot wiring for InterruptBus + allowedTools=[Bash]"
```

---

## Task 6: Frontend — pass pendingInterrupts + resumeRun into ChatStream

**Files:**
- Modify: `src/features/task/TaskView.tsx:32-42`

- [ ] **Step 1: Destructure the HITL surface from useChat**

Edit `src/features/task/TaskView.tsx`. Replace the `useChat({...})` destructure block (currently lines 32-42) with:

```tsx
  const {
    viewMessages,
    isRunning,
    isThinking,
    error,
    send,
    cancel,
    attachToRun,
    setHistoricalMessages,
    pendingInterrupts,
    resumeRun,
  } = useChat({ threadId: activeTaskId ?? "" });
```

- [ ] **Step 2: Forward to ChatStream**

In the same file, edit the `<ChatStream … />` JSX (currently lines 101-108). Replace with:

```tsx
            <ChatStream
              threadId={activeTaskId}
              messages={viewMessages}
              isThinking={isThinking}
              isRunning={isRunning}
              error={error}
              loading={messagesQuery.isLoading}
              pendingInterrupts={pendingInterrupts}
              onResume={resumeRun}
            />
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: errors about `ChatStream` not accepting `pendingInterrupts` / `onResume`. Continue — Task 7 fixes ChatStream's prop signature.

- [ ] **Step 4: Commit**

```bash
git add src/features/task/TaskView.tsx
git commit -m "feat(task): forward pendingInterrupts/resumeRun to ChatStream"
```

---

## Task 7: Render Confirmation card in ChatStream

**Files:**
- Modify: `src/features/task/ChatStream.tsx`

- [ ] **Step 1: Extend imports + props**

At the top of `src/features/task/ChatStream.tsx`, add to the existing imports:

```tsx
import type { PendingInterrupt } from "@/lib/agui/runtime";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
```

Then change the `ChatStreamProps` interface (after the new imports — currently appears after the Streamdown import). Replace the entire interface with:

```tsx
interface ChatStreamProps {
  threadId: string;
  messages: MessageView[];
  isThinking: boolean;
  isRunning: boolean;
  error: string | null;
  loading?: boolean;
  pendingInterrupts: PendingInterrupt[];
  onResume: (payload: {
    decisions: Array<
      | { type: "allow" }
      | { type: "deny"; message?: string }
    >;
  }) => Promise<void>;
}
```

- [ ] **Step 2: Accept the new props in the component**

Replace the `ChatStream` function signature (currently `export function ChatStream({ threadId, messages, ... }: ChatStreamProps)`) with:

```tsx
export function ChatStream({
  threadId,
  messages,
  isThinking,
  isRunning,
  error,
  loading = false,
  pendingInterrupts,
  onResume,
}: ChatStreamProps) {
```

- [ ] **Step 3: Render Confirmation under the message list when an interrupt is pending**

Inside the same `ChatStream` function, in the JSX `<ConversationContent className="gap-0 p-0">` block, after the `{messages.map(...)}` block AND the existing `{isRunning && isThinking && (…)}` block AND the `{error && (…)}` block, insert the following block (right before the closing `</div>` that wraps that column):

```tsx
          {pendingInterrupts.map((it) => {
            const payload = it.payload as {
              toolName?: string;
              input?: Record<string, unknown>;
              title?: string;
              description?: string;
            };
            const toolName = payload.toolName ?? "tool";
            const title = payload.title ?? `Claude wants to run ${toolName}`;
            const inputPreview = (() => {
              try {
                return JSON.stringify(payload.input ?? {}, null, 2);
              } catch {
                return String(payload.input);
              }
            })();
            return (
              <Confirmation
                key={it.id}
                approval={{ id: it.id }}
                state="approval-requested"
              >
                <ConfirmationTitle>{title}</ConfirmationTitle>
                {payload.description && (
                  <p className="text-[12.5px]" style={{ color: "hsl(var(--text-300))" }}>
                    {payload.description}
                  </p>
                )}
                <pre
                  className="overflow-x-auto rounded-md px-3 py-2 text-[12px] leading-[1.5]"
                  style={{
                    background: "hsl(var(--bg-100))",
                    color: "hsl(var(--text-200))",
                  }}
                >
                  {inputPreview}
                </pre>
                <ConfirmationRequest>
                  <ConfirmationActions>
                    <ConfirmationAction
                      variant="outline"
                      onClick={() =>
                        void onResume({
                          decisions: [{ type: "deny", message: "User declined" }],
                        })
                      }
                    >
                      拒绝
                    </ConfirmationAction>
                    <ConfirmationAction
                      onClick={() =>
                        void onResume({ decisions: [{ type: "allow" }] })
                      }
                    >
                      允许
                    </ConfirmationAction>
                  </ConfirmationActions>
                </ConfirmationRequest>
              </Confirmation>
            );
          })}
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bunx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/task/ChatStream.tsx
git commit -m "feat(task): render <Confirmation> card for pending tool approvals"
```

---

## Task 8: End-to-end smoke

**Files:** (no source changes, manual verification)

- [ ] **Step 1: Wipe local dev DB so the new schema runs cleanly**

Run: `rm -f "$HOME/Library/Application Support/com.ugreen.agent-studio/agent-studio.db"*`
Expected: prints nothing (success).

- [ ] **Step 2: Launch full stack**

Run: `cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio && bun run tauri:dev`
Expected: Tauri window opens, sidecar boots, no error log entries.

- [ ] **Step 3: Trigger a tool**

In the app, start a new conversation and send: `用 bash 列出当前目录`
Expected:
- Reasoning block appears
- A `Bash` tool step appears with `args` visible
- **Confirmation card "Claude wants to run Bash" renders below the message with `允许` / `拒绝` buttons**
- Sidebar dot turns to the `awaiting_approval` state (matching the existing pulse logic)
- The chat input is NOT showing "streaming" (the run is paused, not actively producing tokens)

- [ ] **Step 4: Click 允许**

Expected:
- Confirmation card disappears
- Tool runs; tool result block appears in the same ProcessGroup
- Assistant continues with a text summary
- Final `RUN_FINISHED` arrives; bottom toolbar (MessageActions) appears
- Sidebar dot returns to idle

- [ ] **Step 5: Trigger again, click 拒绝**

Send another `用 bash …` message.
Expected:
- Confirmation card appears
- Click `拒绝`
- Tool step's status flips to `error` (sweepPendingToolCalls path) OR the SDK responds with an apology message (depends on SDK behavior for deny — both are acceptable for v1)
- Run terminates cleanly (status: completed), no orphaned pulse

- [ ] **Step 6: Trigger, then click the global stop button (cancel mid-approval)**

Send a `用 bash …` message; before clicking either approval button, click the stop / cancel button.
Expected:
- `DELETE /runs/:runId` fires → aborter aborts → runWorker catches → `cancelAll` rejects deferred as deny → SDK unblocks → emits RUN_ERROR or terminates → store sets status `cancelled`
- Frontend shows "已被用户中止" notice
- No hung processes (verify by closing the app and re-opening — DB orphan-reconcile should report 0 orphans)

- [ ] **Step 7: Commit a short note marking the milestone**

```bash
git commit --allow-empty -m "chore(milestone): HITL tool approval end-to-end (v1)"
```

---

## Self-Review (filled in inline)

**1. Spec coverage:** Every item under "In scope (v1)" maps to a task — Task 5 (Bash whitelist), Tasks 1-4 (in-memory bus + status flip), Task 7 (Confirmation card), no batch/edit (out of scope).

**2. Placeholders:** None — every step has the complete file path + complete code block.

**3. Type consistency:**
- `PermissionResult` shape: `{ behavior: "allow" } | { behavior: "deny", message: string }` — same in interrupt-bus.ts (Task 1), provider.ts (Task 2, returned by canUseTool), runs.ts (Task 3, what /resume calls bus.resolve with).
- `ApprovalRequest.toolUseID` matches SDK's `CanUseTool` context field name (verified against `sdk.d.ts:194`).
- `PendingInterrupt` (frontend) ↔ `AGUIInterrupt` (server) — both have `{ id, reason, payload }`. Reason value `"tool_approval"` matches both files.
- `onResume` payload shape `{ decisions: Array<{ type: "allow" } | { type: "deny", message? }> }` matches what `buildResumeRequest` (`src/lib/agui/runtime/protocol.ts:46-50`) sniffs for `needsSweep`.

## Out-of-Plan Notes

- The frontend `runtime.resume()` re-attaches SSE on `/runs/:runId/events?after=cursor`. Because the SSE client treats `RUN_FINISHED` as terminal (`sse.ts:37`), the synthetic interrupt event in Task 1 will close the original stream. The new attach picks up the post-resume SDK events naturally — no protocol change needed.
- `awaiting_approval` is NOT in the store's `TERMINAL` set (`createBunSqliteRunStore.ts:147-151`), so `streamFrom` keeps the bus listener alive while the deferred is pending. The client's reconnection backoff (`sse.ts:139-141`) handles the "no events to send" case.
- `runs.status = 'awaiting_approval'` causes `finishRun` to set `ended_at = now`. That timestamp is later overwritten when the SDK eventually completes (next `finishRun(completed)`). Cosmetic; no callers care about precise `ended_at` ordering.

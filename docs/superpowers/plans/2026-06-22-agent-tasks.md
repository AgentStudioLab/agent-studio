# Agent Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Claude Agent SDK 原生 `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` 实现只读 agent tasks 列表，并移除旧 `TodoWrite` 派生逻辑。

**Architecture:** Sidecar 在 Claude bridge 边界把 SDK Task 工具归一化为稳定的 `CUSTOM agent.tasks` snapshot，前端 runtime 保存并派生 `AgentTask[]`，Task 页输入框上方用 trigger + popover 只读展示。旧 `TodoWrite` 逻辑不保留兼容分支，Process tab 的 plan 阶段改由 Task 工具驱动。

**Tech Stack:** Bun test runner、TypeScript、React 19、Tailwind v4、shadcn/Radix Popover、lucide-react、Claude Agent SDK。

---

## 文件结构

- Create: `sidecar/src/agui/provider-claude/task-normalizer.ts`  
  纯函数 task snapshot normalizer。接收 Task 工具 input/result，维护 `AgentTask[]`，不依赖 SDK stream 或 IO。
- Create: `sidecar/src/agui/provider-claude/task-normalizer.test.ts`  
  normalizer 单元测试，覆盖 create/update/delete/list/get/malformed。
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`  
  在 SDK message bridge 中调用 task normalizer，snapshot 变化时 emit `CUSTOM agent.tasks`。
- Modify: `sidecar/src/agui/provider-claude/bridge.test.ts`  
  synthetic SDK stream 测试 `CUSTOM agent.tasks` 输出。
- Modify: `sidecar/src/agui/provider-claude/provider.ts`  
  默认允许 Task 工具；`canUseTool` 对 Task 工具 bypass sandbox/HITL；append prompt 加 Task guidance。
- Modify: `sidecar/src/services/settings-tools.ts` and `sidecar/src/routes/settings-tools.test.ts`  
  默认工具集加入 `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList`。
- Modify: `src/lib/agui/runtime/types.ts`  
  新增 `AgentTask` 类型、`ChatState.tasks`、`ChatState.hasTaskSnapshot`。
- Modify: `src/lib/agui/runtime/reducer.ts` and `src/lib/agui/runtime/reducer.test.ts`  
  消费 `CUSTOM agent.tasks` snapshot。
- Modify: `src/lib/agui/runtime/derivations.ts` and `src/lib/agui/runtime/derivations.test.ts`  
  替换 `deriveTodos()` 为 `deriveAgentTasks()`；Process plan phase 改识别 Task 工具。
- Move/Modify: `src/lib/agui/react/useThreadPlan.ts` → `src/lib/agui/react/useThreadTasks.ts`  
  hook 命名迁移，返回 `{ tasks }`。
- Create: `src/features/task/TaskTodosTrigger.tsx` and `src/features/task/TaskTodosTrigger.test.tsx`  
  输入框上方只读 trigger + popover UI。
- Modify: `src/features/task/TaskView.tsx`  
  在 `QueuedMessagesPanel` 和 `TaskMessageInput` 中间挂载 `TaskTodosTrigger`。
- Modify: `src/i18n/locales/en/task.json` and `src/i18n/locales/zh/task.json`  
  新增 tasks trigger/popover 文案。

---

### Task 1: Sidecar Task Normalizer

**Files:**
- Create: `sidecar/src/agui/provider-claude/task-normalizer.ts`
- Create: `sidecar/src/agui/provider-claude/task-normalizer.test.ts`

- [ ] **Step 1: 写 failing tests**

Create `sidecar/src/agui/provider-claude/task-normalizer.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  createTaskSnapshot,
  handleTaskToolCall,
  handleTaskToolResult,
} from "./task-normalizer";

describe("task normalizer", () => {
  it("creates a task from TaskCreate input and result", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: {
        subject: "实现 tasks UI",
        description: "在输入框上方展示任务列表",
        activeForm: "实现 tasks UI",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "实现 tasks UI" } },
    });
    expect(snapshot.tasks).toEqual([
      {
        id: "task_1",
        subject: "实现 tasks UI",
        description: "在输入框上方展示任务列表",
        activeForm: "实现 tasks UI",
        status: "pending",
        updatedAt: 1000,
      },
    ]);
  });

  it("updates status and activeForm from TaskUpdate when result succeeds", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "写测试", description: "覆盖 reducer" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "写测试" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_update",
      toolName: "TaskUpdate",
      input: {
        taskId: "task_1",
        status: "in_progress",
        activeForm: "正在写测试",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_update",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_1", updatedFields: ["status", "activeForm"] },
    });
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      status: "in_progress",
      activeForm: "正在写测试",
      updatedAt: 1000,
    });
  });

  it("deletes a task on TaskUpdate status deleted", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "旧任务", description: "会删除" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "旧任务" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_delete",
      toolName: "TaskUpdate",
      input: { taskId: "task_1", status: "deleted" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_delete",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_1", updatedFields: ["status"] },
    });
    expect(snapshot.tasks).toEqual([]);
  });

  it("resyncs from TaskList result", () => {
    const snapshot = handleTaskToolResult(createTaskSnapshot(2000), {
      toolCallId: "tc_list",
      toolName: "TaskList",
      result: {
        tasks: [
          { id: "a", subject: "A", status: "pending", blockedBy: [] },
          { id: "b", subject: "B", status: "completed", owner: "agent", blockedBy: [] },
        ],
      },
    });
    expect(snapshot.tasks).toEqual([
      {
        id: "a",
        subject: "A",
        description: "",
        status: "pending",
        updatedAt: 2000,
      },
      {
        id: "b",
        subject: "B",
        description: "",
        status: "completed",
        updatedAt: 2000,
      },
    ]);
  });

  it("ignores malformed payloads without throwing", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_bad",
      toolName: "TaskCreate",
      input: { description: "missing subject" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_bad",
      toolName: "TaskCreate",
      result: { task: { subject: "missing id" } },
    });
    expect(snapshot.tasks).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/task-normalizer.test.ts
```

Expected: FAIL because `./task-normalizer` does not exist.

- [ ] **Step 3: 实现 normalizer**

Create `sidecar/src/agui/provider-claude/task-normalizer.ts`:

```ts
export type AgentTaskStatus = "pending" | "in_progress" | "completed";

export interface AgentTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTaskStatus;
  updatedAt: number;
}

export interface TaskSnapshot {
  tasks: AgentTask[];
  pendingCreates: Record<string, {
    subject: string;
    description: string;
    activeForm?: string;
  }>;
  pendingUpdates: Record<string, {
    taskId: string;
    subject?: string;
    description?: string;
    activeForm?: string;
    status?: AgentTaskStatus | "deleted";
  }>;
  now: number;
}

export function createTaskSnapshot(now = Date.now()): TaskSnapshot {
  return {
    tasks: [],
    pendingCreates: {},
    pendingUpdates: {},
    now,
  };
}

export function taskSnapshotValue(snapshot: TaskSnapshot): AgentTask[] {
  return snapshot.tasks.map((task) => ({ ...task }));
}

export function isTaskToolName(name: string): boolean {
  return name === "TaskCreate" ||
    name === "TaskGet" ||
    name === "TaskUpdate" ||
    name === "TaskList";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function normalizeStatus(v: unknown): AgentTaskStatus | "deleted" | undefined {
  if (v === "pending" || v === "in_progress" || v === "completed" || v === "deleted") {
    return v;
  }
  if (v === "running") return "in_progress";
  return undefined;
}

function upsertTask(tasks: AgentTask[], next: AgentTask): AgentTask[] {
  const index = tasks.findIndex((task) => task.id === next.id);
  if (index === -1) return [...tasks, next];
  const out = [...tasks];
  out[index] = { ...out[index]!, ...next };
  return out;
}

function applyTaskPatch(
  tasks: AgentTask[],
  taskId: string,
  patch: {
    subject?: string;
    description?: string;
    activeForm?: string;
    status?: AgentTaskStatus | "deleted";
  },
  updatedAt: number,
): AgentTask[] {
  if (patch.status === "deleted") {
    return tasks.filter((task) => task.id !== taskId);
  }
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    if (!patch.subject && !patch.description) return tasks;
    return [
      ...tasks,
      {
        id: taskId,
        subject: patch.subject ?? taskId,
        description: patch.description ?? "",
        activeForm: patch.activeForm,
        status: patch.status ?? "pending",
        updatedAt,
      },
    ];
  }
  const out = [...tasks];
  const current = out[index]!;
  out[index] = {
    ...current,
    ...(patch.subject ? { subject: patch.subject } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.activeForm !== undefined ? { activeForm: patch.activeForm } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    updatedAt,
  };
  return out;
}

export function handleTaskToolCall(
  snapshot: TaskSnapshot,
  call: { toolCallId: string; toolName: string; input: unknown },
): TaskSnapshot {
  if (!isRecord(call.input)) return snapshot;
  if (call.toolName === "TaskCreate") {
    const subject = asString(call.input.subject);
    const description = asString(call.input.description) ?? "";
    if (!subject) return snapshot;
    return {
      ...snapshot,
      pendingCreates: {
        ...snapshot.pendingCreates,
        [call.toolCallId]: {
          subject,
          description,
          ...(asString(call.input.activeForm) ? { activeForm: asString(call.input.activeForm) } : {}),
        },
      },
    };
  }
  if (call.toolName === "TaskUpdate") {
    const taskId = asString(call.input.taskId);
    if (!taskId) return snapshot;
    const patch = {
      taskId,
      ...(asString(call.input.subject) ? { subject: asString(call.input.subject) } : {}),
      ...(typeof call.input.description === "string" ? { description: call.input.description } : {}),
      ...(typeof call.input.activeForm === "string" ? { activeForm: call.input.activeForm } : {}),
      ...(normalizeStatus(call.input.status) ? { status: normalizeStatus(call.input.status) } : {}),
    };
    return {
      ...snapshot,
      pendingUpdates: {
        ...snapshot.pendingUpdates,
        [call.toolCallId]: patch,
      },
    };
  }
  return snapshot;
}

export function handleTaskToolResult(
  snapshot: TaskSnapshot,
  result: { toolCallId: string; toolName: string; result: unknown },
): TaskSnapshot {
  if (result.toolName === "TaskCreate") {
    const pending = snapshot.pendingCreates[result.toolCallId];
    if (!pending || !isRecord(result.result) || !isRecord(result.result.task)) {
      return snapshot;
    }
    const id = asString(result.result.task.id);
    if (!id) return snapshot;
    const subject = asString(result.result.task.subject) ?? pending.subject;
    const { [result.toolCallId]: _removed, ...pendingCreates } = snapshot.pendingCreates;
    return {
      ...snapshot,
      pendingCreates,
      tasks: upsertTask(snapshot.tasks, {
        id,
        subject,
        description: pending.description,
        activeForm: pending.activeForm,
        status: "pending",
        updatedAt: snapshot.now,
      }),
    };
  }

  if (result.toolName === "TaskUpdate") {
    const patch = snapshot.pendingUpdates[result.toolCallId];
    if (!patch) return snapshot;
    if (isRecord(result.result) && result.result.success === false) return snapshot;
    const { [result.toolCallId]: _removed, ...pendingUpdates } = snapshot.pendingUpdates;
    const { taskId, ...rest } = patch;
    return {
      ...snapshot,
      pendingUpdates,
      tasks: applyTaskPatch(snapshot.tasks, taskId, rest, snapshot.now),
    };
  }

  if (result.toolName === "TaskList") {
    if (!isRecord(result.result) || !Array.isArray(result.result.tasks)) return snapshot;
    const tasks: AgentTask[] = [];
    for (const raw of result.result.tasks) {
      if (!isRecord(raw)) continue;
      const id = asString(raw.id);
      const subject = asString(raw.subject);
      const status = normalizeStatus(raw.status);
      if (!id || !subject || !status || status === "deleted") continue;
      tasks.push({
        id,
        subject,
        description: typeof raw.description === "string" ? raw.description : "",
        status,
        updatedAt: snapshot.now,
      });
    }
    return { ...snapshot, tasks };
  }

  if (result.toolName === "TaskGet") {
    if (!isRecord(result.result) || !isRecord(result.result.task)) return snapshot;
    const raw = result.result.task;
    const id = asString(raw.id);
    const subject = asString(raw.subject);
    const status = normalizeStatus(raw.status);
    if (!id || !subject || !status || status === "deleted") return snapshot;
    return {
      ...snapshot,
      tasks: upsertTask(snapshot.tasks, {
        id,
        subject,
        description: typeof raw.description === "string" ? raw.description : "",
        status,
        updatedAt: snapshot.now,
      }),
    };
  }

  return snapshot;
}
```

- [ ] **Step 4: 运行 normalizer 测试确认通过**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/task-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add sidecar/src/agui/provider-claude/task-normalizer.ts sidecar/src/agui/provider-claude/task-normalizer.test.ts
git commit -m "feat(sidecar): add task normalizer"
```

---

### Task 2: Bridge Emits Agent Task Snapshots

**Files:**
- Modify: `sidecar/src/agui/provider-claude/bridge.ts`
- Modify: `sidecar/src/agui/provider-claude/bridge.test.ts`

- [ ] **Step 1: 写 bridge failing test**

Append to `sidecar/src/agui/provider-claude/bridge.test.ts`:

```ts
describe("bridge — agent task snapshots", () => {
  it("emits CUSTOM agent.tasks after TaskCreate result", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "task_create_1",
              name: "TaskCreate",
              input: {
                subject: "实现任务面板",
                description: "输入框上方展示 tasks",
                activeForm: "实现任务面板",
              },
            },
          ],
        },
      };
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "task_create_1",
              content: JSON.stringify({
                task: { id: "task_1", subject: "实现任务面板" },
              }),
            },
          ],
        },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "" };
    })();

    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
      }),
    );

    const taskEvent = events.find(
      (event) => event.type === "CUSTOM" && event.name === "agent.tasks",
    );
    expect(taskEvent?.value).toEqual({
      tasks: [
        {
          id: "task_1",
          subject: "实现任务面板",
          description: "输入框上方展示 tasks",
          activeForm: "实现任务面板",
          status: "pending",
          updatedAt: expect.any(Number),
        },
      ],
    });
  });
});
```

- [ ] **Step 2: 运行 bridge 测试确认失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/bridge.test.ts --grep "agent task snapshots"
```

Expected: FAIL because bridge does not emit `agent.tasks`.

- [ ] **Step 3: 修改 bridge 引入 normalizer**

Modify imports in `sidecar/src/agui/provider-claude/bridge.ts`:

```ts
import {
  createTaskSnapshot,
  handleTaskToolCall,
  handleTaskToolResult,
  isTaskToolName,
  taskSnapshotValue,
} from "./task-normalizer";
```

Inside `claudeSdkToAgui`, after `const toolById = new Map<string, ToolState>();`, add:

```ts
  let taskSnapshot = createTaskSnapshot();
  let lastTaskSnapshotJson = JSON.stringify(taskSnapshotValue(taskSnapshot));

  function taskSnapshotEvent(): AGUIEvent | null {
    const value = taskSnapshotValue(taskSnapshot);
    const json = JSON.stringify(value);
    if (json === lastTaskSnapshotJson) return null;
    lastTaskSnapshotJson = json;
    return {
      type: EventType.CUSTOM,
      name: "agent.tasks",
      value: { tasks: value },
    } as AGUIEvent;
  }
```

In the assistant `toolUseBlocks` loop, immediately after `await callbacks?.onToolCallEnd?.(...)`, add:

```ts
          if (isTaskToolName(block.name)) {
            taskSnapshot = handleTaskToolCall(taskSnapshot, {
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });
          }
```

In the `tool_result` handler, after `await callbacks?.onToolCallResult?.(...)`, add:

```ts
            const toolState = toolById.get(block.tool_use_id);
            if (toolState && isTaskToolName(toolState.toolName)) {
              let parsedResult: unknown = block.content ?? null;
              if (typeof block.content === "string") {
                try {
                  parsedResult = JSON.parse(block.content);
                } catch {
                  parsedResult = block.content;
                }
              }
              taskSnapshot = handleTaskToolResult(taskSnapshot, {
                toolCallId: block.tool_use_id,
                toolName: toolState.toolName,
                result: parsedResult,
              });
              const ev = taskSnapshotEvent();
              if (ev) yield ev;
            }
```

- [ ] **Step 4: 运行 bridge 测试确认通过**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/bridge.test.ts --grep "agent task snapshots"
```

Expected: PASS.

- [ ] **Step 5: 运行完整 bridge 测试防回归**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add sidecar/src/agui/provider-claude/bridge.ts sidecar/src/agui/provider-claude/bridge.test.ts
git commit -m "feat(sidecar): emit agent task snapshots"
```

---

### Task 3: Provider Enables SDK Task Tools

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Modify: `sidecar/src/services/settings-tools.ts`
- Modify: `sidecar/src/routes/settings-tools.test.ts`
- Modify: `sidecar/src/agui/provider-claude/provider.test.ts`

- [ ] **Step 1: 写 provider/settings failing tests**

In `sidecar/src/routes/settings-tools.test.ts`, add or update default tools expectation:

```ts
it("default tools include SDK task tracking tools", () => {
  expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskCreate");
  expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskGet");
  expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskUpdate");
  expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskList");
});
```

In `sidecar/src/agui/provider-claude/provider.test.ts`, add a focused test near other provider option tests:

```ts
it("allows SDK task tools without HITL approval", async () => {
  const approvals: string[] = [];
  const provider = createClaudeProvider({
    apiKey: "test",
    interruptBus: {
      seedRules: () => {},
      getRules: () => [],
      requestApproval: async ({ toolName }) => {
        approvals.push(toolName);
        return { behavior: "allow", updatedInput: {} };
      },
      requestAskUser: async () => ({ answers: {} }),
    } as never,
  });
  expect(provider.name).toBe("claude-agent-sdk");
  expect(DEFAULT_TASK_TOOLS).toEqual(["TaskCreate", "TaskGet", "TaskUpdate", "TaskList"]);
  expect(approvals).toEqual([]);
});
```

Note: if `provider.test.ts` cannot access `DEFAULT_TASK_TOOLS` yet, the test should import it after Step 3 exports it.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/routes/settings-tools.test.ts src/agui/provider-claude/provider.test.ts
```

Expected: FAIL because Task tools/default export are missing.

- [ ] **Step 3: 实现默认工具常量和 prompt guidance**

In `sidecar/src/agui/provider-claude/provider.ts`, add near constants:

```ts
export const DEFAULT_TASK_TOOLS = [
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
] as const;

const TASK_TOOL_PROMPT_GUIDANCE = [
  "Task tracking guidance:",
  "- For non-trivial multi-step work, create and maintain a short task list with TaskCreate and TaskUpdate.",
  "- Create tasks early, keep them concrete, and update status whenever progress changes.",
  "- Keep at most one task in_progress at a time.",
  "- Mark completed work as completed before the final response.",
  "- Use TaskList or TaskGet only when you need to inspect or resync current task state.",
].join("\n");
```

Update `allowedTools` array:

```ts
      ...DEFAULT_TASK_TOOLS,
```

Update `canUseTool` before `checkWorkspaceSandbox(...)`:

```ts
      if ((DEFAULT_TASK_TOOLS as readonly string[]).includes(toolName)) {
        return { behavior: "allow" as const, updatedInput: input };
      }
```

Update `combinedAppend` composition to include task guidance:

```ts
      [appendPrompt, ctxRun.appendContext, ASK_USER_PROMPT_GUIDANCE, TASK_TOOL_PROMPT_GUIDANCE, localeDirective]
```

In `sidecar/src/services/settings-tools.ts`, update default tools:

```ts
export const DEFAULT_ALLOWED_TOOLS: string[] = [
  "Bash", "Read", "Write", "Edit",
  "Glob", "Grep", "WebFetch", "WebSearch", "Task",
  "TaskCreate", "TaskGet", "TaskUpdate", "TaskList",
];
```

- [ ] **Step 4: 运行 sidecar 测试**

Run:

```bash
cd sidecar && bun test src/routes/settings-tools.test.ts src/agui/provider-claude/provider.test.ts
```

Expected: PASS. If the provider test from Step 1 is too synthetic for existing provider harness, replace it with a test that imports `DEFAULT_TASK_TOOLS` and asserts the exported constant plus settings default; keep canUseTool behavior covered by an extracted helper only if provider already has such a pattern.

- [ ] **Step 5: 提交**

```bash
git add sidecar/src/agui/provider-claude/provider.ts sidecar/src/services/settings-tools.ts sidecar/src/routes/settings-tools.test.ts sidecar/src/agui/provider-claude/provider.test.ts
git commit -m "feat(sidecar): enable sdk task tools"
```

---

### Task 4: Runtime Task State

**Files:**
- Modify: `src/lib/agui/runtime/types.ts`
- Modify: `src/lib/agui/runtime/reducer.ts`
- Modify: `src/lib/agui/runtime/reducer.test.ts`

- [ ] **Step 1: 写 reducer failing tests**

Append to `src/lib/agui/runtime/reducer.test.ts`:

```ts
describe("reducer — CUSTOM agent.tasks updates task snapshot", () => {
  it("stores valid tasks and marks snapshot as present", () => {
    const buf = new Map<string, string>();
    const next = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.tasks",
        value: {
          tasks: [
            {
              id: "task_1",
              subject: "实现任务面板",
              description: "输入框上方展示 tasks",
              activeForm: "实现任务面板",
              status: "in_progress",
              updatedAt: 1000,
            },
          ],
        },
      },
      buf,
    );
    expect(next.hasTaskSnapshot).toBe(true);
    expect(next.tasks).toEqual([
      {
        id: "task_1",
        subject: "实现任务面板",
        description: "输入框上方展示 tasks",
        activeForm: "实现任务面板",
        status: "in_progress",
        updatedAt: 1000,
      },
    ]);
  });

  it("ignores malformed tasks but still records explicit empty snapshot", () => {
    const buf = new Map<string, string>();
    const next = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.tasks",
        value: {
          tasks: [
            { id: "missing-status", subject: "bad", description: "", updatedAt: 1 },
            { id: "ok", subject: "OK", description: "", status: "completed", updatedAt: 2 },
          ],
        },
      },
      buf,
    );
    expect(next.hasTaskSnapshot).toBe(true);
    expect(next.tasks).toEqual([
      { id: "ok", subject: "OK", description: "", status: "completed", updatedAt: 2 },
    ]);
  });

  it("ignores malformed agent.tasks payload", () => {
    const buf = new Map<string, string>();
    const before = createInitialState();
    const next = applyEvent(
      before,
      { type: "CUSTOM", name: "agent.tasks", value: { tasks: "bad" } },
      buf,
    );
    expect(next.tasks).toEqual([]);
    expect(next.hasTaskSnapshot).toBe(false);
  });
});
```

- [ ] **Step 2: 运行 reducer 测试确认失败**

Run:

```bash
bun test src/lib/agui/runtime/reducer.test.ts --grep "agent.tasks"
```

Expected: FAIL because `tasks` / `hasTaskSnapshot` do not exist.

- [ ] **Step 3: 新增类型和 reducer 处理**

In `src/lib/agui/runtime/types.ts`, add before `ToolCallView`:

```ts
export type AgentTaskStatus = "pending" | "in_progress" | "completed";

export interface AgentTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTaskStatus;
  updatedAt: number;
}
```

In `ChatState`, add:

```ts
  /** Agent 通过 SDK Task 工具维护的当前任务快照。 */
  tasks: AgentTask[];
  /** 区分“明确空列表”和“还没有 replay 出任务快照”。 */
  hasTaskSnapshot: boolean;
```

In `createInitialState()`, add:

```ts
    tasks: [],
    hasTaskSnapshot: false,
```

In `src/lib/agui/runtime/reducer.ts`, import `AgentTask` and add helpers above `applyEvent`:

```ts
function isAgentTaskStatus(v: unknown): v is AgentTask["status"] {
  return v === "pending" || v === "in_progress" || v === "completed";
}

function parseAgentTasks(value: unknown): AgentTask[] | null {
  if (!value || typeof value !== "object") return null;
  const tasks = (value as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return null;
  return tasks.filter((task): task is AgentTask => {
    if (!task || typeof task !== "object") return false;
    const raw = task as Record<string, unknown>;
    return typeof raw.id === "string" &&
      typeof raw.subject === "string" &&
      typeof raw.description === "string" &&
      isAgentTaskStatus(raw.status) &&
      typeof raw.updatedAt === "number" &&
      (raw.activeForm === undefined || typeof raw.activeForm === "string");
  });
}
```

In `CUSTOM` case, add before `file.side_effects` branch:

```ts
      } else if (name === "agent.tasks") {
        const tasks = parseAgentTasks((event as { value?: unknown }).value);
        if (tasks) {
          next = {
            ...next,
            tasks,
            hasTaskSnapshot: true,
          };
        }
```

- [ ] **Step 4: 运行 reducer 测试确认通过**

Run:

```bash
bun test src/lib/agui/runtime/reducer.test.ts --grep "agent.tasks"
```

Expected: PASS.

- [ ] **Step 5: 运行完整 runtime reducer 测试**

Run:

```bash
bun test src/lib/agui/runtime/reducer.test.ts
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add src/lib/agui/runtime/types.ts src/lib/agui/runtime/reducer.ts src/lib/agui/runtime/reducer.test.ts
git commit -m "feat(runtime): store agent task snapshots"
```

---

### Task 5: Derivations Replace TodoWrite With Agent Tasks

**Files:**
- Modify: `src/lib/agui/runtime/derivations.ts`
- Modify: `src/lib/agui/runtime/derivations.test.ts`
- Move/Modify: `src/lib/agui/react/useThreadPlan.ts` → `src/lib/agui/react/useThreadTasks.ts`

- [ ] **Step 1: 写 derivation failing tests**

In `src/lib/agui/runtime/derivations.test.ts`, replace `deriveTodos` import with `deriveAgentTasks`, and replace the `deriveTodos` describe block with:

```ts
function taskToolCallBlock(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown = null,
): MessageView {
  return {
    id: `msg_${toolCallId}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: {
          id: toolCallId,
          toolName,
          args,
          result,
          status: result ? "success" : "pending",
        },
      },
    ],
  };
}

describe("deriveAgentTasks", () => {
  it("returns state.tasks when a snapshot has been replayed", () => {
    const state: ChatState = {
      ...createInitialState(),
      hasTaskSnapshot: true,
      tasks: [
        {
          id: "task_1",
          subject: "from snapshot",
          description: "",
          status: "completed",
          updatedAt: 1000,
        },
      ],
    };
    expect(deriveAgentTasks(state)).toEqual(state.tasks);
  });

  it("derives tasks from TaskCreate and TaskUpdate tool history when no snapshot exists", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          {
            subject: "写 normalizer",
            description: "覆盖 create/update",
            activeForm: "写 normalizer",
          },
          JSON.stringify({ task: { id: "task_1", subject: "写 normalizer" } }),
        ),
        taskToolCallBlock(
          "tc_update",
          "TaskUpdate",
          { taskId: "task_1", status: "completed" },
          JSON.stringify({ success: true, taskId: "task_1", updatedFields: ["status"] }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)).toEqual([
      {
        id: "task_1",
        subject: "写 normalizer",
        description: "覆盖 create/update",
        activeForm: "写 normalizer",
        status: "completed",
        updatedAt: expect.any(Number),
      },
    ]);
  });
});
```

Replace “TodoWrite lands in plan phase” with:

```ts
it("Task tools land in plan phase", () => {
  const state: ChatState = {
    ...createInitialState(),
    isRunning: true,
    liveMessages: [
      toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
      toolCallMsg("b", "TaskCreate", { subject: "Plan", description: "Plan work" }),
    ],
  };
  const phases = deriveProgressPhases(state);
  expect(phases.find((p) => p.id === "context")!.status).toBe("completed");
  expect(phases.find((p) => p.id === "plan")!.status).toBe("active");
  expect(phases.find((p) => p.id === "plan")!.count).toBe(1);
});
```

- [ ] **Step 2: 运行 derivation 测试确认失败**

Run:

```bash
bun test src/lib/agui/runtime/derivations.test.ts
```

Expected: FAIL because `deriveAgentTasks` is missing and `TodoWrite` behavior still exists.

- [ ] **Step 3: 实现 derivations 迁移**

In `src/lib/agui/runtime/derivations.ts`:

1. Remove `TodoStatus`, `TodoEntry`, `extractTodosFromArgs`, `todoCallsInTurns`, and `deriveTodos`.
2. Import/use `AgentTask`.
3. Add:

```ts
import type { AgentTask, ChatState, MessageView, ToolCallView } from "./types";

const TASK_TOOL_NAMES = new Set(["TaskCreate", "TaskGet", "TaskUpdate", "TaskList"]);

function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

export function deriveAgentTasks(state: ChatState): AgentTask[] {
  if (state.hasTaskSnapshot) return state.tasks;

  const tasks = new Map<string, AgentTask>();
  const pendingCreates = new Map<string, {
    subject: string;
    description: string;
    activeForm?: string;
  }>();
  const messages = [...state.historicalMessages, ...state.liveMessages];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.blocks) {
      if (block.kind !== "tool_call") continue;
      const tc = block.toolCall;
      if (tc.toolName === "TaskCreate" && typeof tc.args === "object" && tc.args) {
        const args = tc.args as Record<string, unknown>;
        if (typeof args.subject === "string" && args.subject.trim()) {
          pendingCreates.set(tc.id, {
            subject: args.subject,
            description: typeof args.description === "string" ? args.description : "",
            ...(typeof args.activeForm === "string" ? { activeForm: args.activeForm } : {}),
          });
        }
        const parsed = parseToolResult(tc.result);
        if (parsed && typeof parsed === "object") {
          const rawTask = (parsed as { task?: unknown }).task;
          if (rawTask && typeof rawTask === "object") {
            const id = (rawTask as { id?: unknown }).id;
            const pending = pendingCreates.get(tc.id);
            if (typeof id === "string" && pending) {
              tasks.set(id, {
                id,
                subject:
                  typeof (rawTask as { subject?: unknown }).subject === "string"
                    ? String((rawTask as { subject?: unknown }).subject)
                    : pending.subject,
                description: pending.description,
                activeForm: pending.activeForm,
                status: "pending",
                updatedAt: Date.now(),
              });
            }
          }
        }
      }

      if (tc.toolName === "TaskUpdate" && typeof tc.args === "object" && tc.args) {
        const args = tc.args as Record<string, unknown>;
        const taskId = typeof args.taskId === "string" ? args.taskId : null;
        if (!taskId) continue;
        if (args.status === "deleted") {
          tasks.delete(taskId);
          continue;
        }
        const current = tasks.get(taskId);
        if (!current) continue;
        tasks.set(taskId, {
          ...current,
          ...(typeof args.subject === "string" ? { subject: args.subject } : {}),
          ...(typeof args.description === "string" ? { description: args.description } : {}),
          ...(typeof args.activeForm === "string" ? { activeForm: args.activeForm } : {}),
          ...(args.status === "pending" || args.status === "in_progress" || args.status === "completed"
            ? { status: args.status }
            : {}),
          updatedAt: Date.now(),
        });
      }
    }
  }

  return [...tasks.values()];
}
```

Update `labelForTool`:

```ts
    case "TaskCreate":
      return "Task created";
    case "TaskUpdate":
      return "Task updated";
    case "TaskGet":
      return "Task inspected";
    case "TaskList":
      return "Task list";
```

Update `phaseForTool`:

```ts
  if (TASK_TOOL_NAMES.has(name)) return "plan";
```

Remove `if (name === "TodoWrite") return "plan";`.

Move file:

```bash
mv src/lib/agui/react/useThreadPlan.ts src/lib/agui/react/useThreadTasks.ts
```

Update contents:

```ts
import { useMemo } from "react";
import { deriveAgentTasks } from "../runtime/derivations";
import type { AgentTask, ChatState } from "../runtime/types";

/**
 * Derive the current SDK Task tool snapshot for a TaskView ChatState.
 */
export function useThreadTasks(state: ChatState | null): {
  tasks: AgentTask[];
} {
  const tasks = useMemo(
    () => (state ? deriveAgentTasks(state) : []),
    [state],
  );
  return { tasks };
}
```

- [ ] **Step 4: 运行 derivation 测试确认通过**

Run:

```bash
bun test src/lib/agui/runtime/derivations.test.ts
```

Expected: PASS.

- [ ] **Step 5: 搜索确认没有旧 TodoWrite 派生引用**

Run:

```bash
rtk rg -n "deriveTodos|TodoEntry|useThreadPlan|TodoWrite lands|Plan update" src/lib src/features
```

Expected: no matches. `TodoWrite` may still appear only in SDK docs or design docs, not runtime implementation.

- [ ] **Step 6: 提交**

```bash
git add src/lib/agui/runtime/derivations.ts src/lib/agui/runtime/derivations.test.ts src/lib/agui/react/useThreadTasks.ts
git rm -f src/lib/agui/react/useThreadPlan.ts
git commit -m "refactor(runtime): derive agent tasks from sdk task tools"
```

---

### Task 6: Task Todos Trigger UI

**Files:**
- Create: `src/features/task/TaskTodosTrigger.tsx`
- Create: `src/features/task/TaskTodosTrigger.test.tsx`
- Modify: `src/i18n/locales/en/task.json`
- Modify: `src/i18n/locales/zh/task.json`

- [ ] **Step 1: 写 UI failing tests**

Create `src/features/task/TaskTodosTrigger.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { TaskTodosTrigger } from "./TaskTodosTrigger";
import type { AgentTask } from "@/lib/agui/runtime/types";

function makeI18n() {
  const i18n = i18next.createInstance();
  void i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          task: {
            todos: {
              trigger: "Tasks {{completed}}/{{total}}",
              title: "Tasks",
              empty: "No active tasks",
              activePrefix: "Now",
              status: {
                pending: "Pending",
                in_progress: "In progress",
                completed: "Completed",
              },
            },
          },
        },
      },
    },
  });
  return i18n;
}

function renderTrigger(tasks: AgentTask[]) {
  return render(
    <I18nextProvider i18n={makeI18n()}>
      <TaskTodosTrigger tasks={tasks} />
    </I18nextProvider>,
  );
}

describe("TaskTodosTrigger", () => {
  it("renders nothing without tasks", () => {
    const { container } = renderTrigger([]);
    expect(container.textContent).toBe("");
  });

  it("shows completed count and active task", () => {
    renderTrigger([
      { id: "a", subject: "A", description: "", status: "completed", updatedAt: 1 },
      { id: "b", subject: "B", description: "", activeForm: "Working on B", status: "in_progress", updatedAt: 2 },
      { id: "c", subject: "C", description: "", status: "pending", updatedAt: 3 },
    ]);
    expect(screen.getByRole("button", { name: /tasks 1\/3/i })).toBeTruthy();
    expect(screen.getByText("Working on B")).toBeTruthy();
  });

  it("opens a readonly popover list", () => {
    renderTrigger([
      { id: "a", subject: "A", description: "Done desc", status: "completed", updatedAt: 1 },
      { id: "b", subject: "B", description: "Todo desc", status: "pending", updatedAt: 2 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /tasks 1\/2/i }));
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete|clear|edit/i })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行 UI 测试确认失败**

Run:

```bash
bun test src/features/task/TaskTodosTrigger.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: 实现组件**

Create `src/features/task/TaskTodosTrigger.tsx`:

```tsx
import { CheckCircle2, Circle, ListChecks, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentTask } from "@/lib/agui/runtime/types";

interface TaskTodosTriggerProps {
  tasks: AgentTask[];
}

function statusIcon(task: AgentTask) {
  if (task.status === "completed") {
    return <CheckCircle2 className="size-4 text-success-100" />;
  }
  if (task.status === "in_progress") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }
  return <Circle className="size-4 text-muted-foreground" />;
}

export function TaskTodosTrigger({ tasks }: TaskTodosTriggerProps) {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  const completed = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.find((task) => task.status === "in_progress");
  const activeText = active?.activeForm || active?.subject || null;

  return (
    <div className="mb-2 flex justify-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("task.todos.trigger", { completed, total: tasks.length })}
            className="flex min-h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-left text-[12.5px] text-foreground transition hover:bg-muted"
          >
            <ListChecks className="size-4 shrink-0 text-primary" />
            <span className="shrink-0 font-medium">
              {t("task.todos.trigger", { completed, total: tasks.length })}
            </span>
            {activeText && (
              <span className="min-w-0 truncate text-muted-foreground">
                {t("task.todos.activePrefix")} · {activeText}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(720px,calc(100vw-32px))] p-3">
          <PopoverHeader>
            <PopoverTitle>{t("task.todos.title")}</PopoverTitle>
          </PopoverHeader>
          <div className="max-h-[320px] overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex gap-2 rounded-md px-2 py-2",
                    task.status === "in_progress" ? "bg-primary/10" : "bg-transparent",
                  )}
                >
                  <span className="mt-0.5 shrink-0">{statusIcon(task)}</span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-[13px] font-medium",
                        task.status === "completed" && "text-muted-foreground line-through",
                      )}
                    >
                      {task.subject}
                    </div>
                    {task.description && (
                      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                        {task.description}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {t(`task.todos.status.${task.status}`)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 4: 增加 i18n 文案**

In `src/i18n/locales/en/task.json`, add under top-level `task` object:

```json
"todos": {
  "trigger": "Tasks {{completed}}/{{total}}",
  "title": "Tasks",
  "empty": "No active tasks",
  "activePrefix": "Now",
  "status": {
    "pending": "Pending",
    "in_progress": "In progress",
    "completed": "Completed"
  }
}
```

In `src/i18n/locales/zh/task.json`, add:

```json
"todos": {
  "trigger": "任务 {{completed}}/{{total}}",
  "title": "任务",
  "empty": "暂无任务",
  "activePrefix": "当前",
  "status": {
    "pending": "待处理",
    "in_progress": "进行中",
    "completed": "已完成"
  }
}
```

- [ ] **Step 5: 运行 UI 测试**

Run:

```bash
bun test src/features/task/TaskTodosTrigger.test.tsx
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add src/features/task/TaskTodosTrigger.tsx src/features/task/TaskTodosTrigger.test.tsx src/i18n/locales/en/task.json src/i18n/locales/zh/task.json
git commit -m "feat(task): add agent tasks popover"
```

---

### Task 7: Wire Trigger Into TaskView

**Files:**
- Modify: `src/features/task/TaskView.tsx`
- Modify: `src/features/task/TaskView.model-selection.test.tsx` or create focused `TaskView.agent-tasks.test.tsx`
- Modify: `src/lib/agui/react/useThreadTasks.ts`

- [ ] **Step 1: 写 TaskView failing test**

Create `src/features/task/TaskView.agent-tasks.test.tsx` with a focused mock if current TaskView test harness is too broad:

```tsx
import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ChatState } from "@/lib/agui/runtime/types";
import { createInitialState } from "@/lib/agui/runtime/types";

const state: ChatState = {
  ...createInitialState(),
  hasTaskSnapshot: true,
  tasks: [
    {
      id: "task_1",
      subject: "展示任务列表",
      description: "",
      status: "in_progress",
      activeForm: "展示任务列表",
      updatedAt: 1,
    },
  ],
};

mock.module("@/lib/agui/react/useChat", () => ({
  useChat: () => ({
    viewMessages: [],
    state,
    runtime: {},
    isRunning: false,
    isThinking: false,
    error: null,
    send: mock(),
    cancel: mock(),
    regenerateFrom: mock(),
    resume: mock(),
  }),
}));

mock.module("@/features/task/TaskMessageInput", () => ({
  TaskMessageInput: () => <div data-testid="message-input" />,
}));

mock.module("@/features/task/QueuedMessagesPanel", () => ({
  QueuedMessagesPanel: () => <div data-testid="queue-panel" />,
}));

mock.module("@/app/AppShell", () => ({
  AppShell: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
}));

// Reuse existing TaskView test mocks for router/query/auth if this file needs them.

describe("TaskView agent tasks", () => {
  it("renders task trigger above the message input", async () => {
    const { TaskView } = await import("./TaskView");
    render(<TaskView />);
    expect(screen.getByRole("button", { name: /tasks 0\/1|任务 0\/1/i })).toBeTruthy();
    const button = screen.getByRole("button", { name: /tasks 0\/1|任务 0\/1/i });
    const input = screen.getByTestId("message-input");
    expect(button.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

If this mock file requires substantial existing TaskView providers, instead add the same assertion to the existing `TaskView.model-selection.test.tsx` harness where `TaskView` already renders.

- [ ] **Step 2: 运行 TaskView test 确认失败**

Run:

```bash
bun test src/features/task/TaskView.agent-tasks.test.tsx
```

Expected: FAIL until TaskView renders trigger.

- [ ] **Step 3: 挂载 hook 和 trigger**

In `src/features/task/TaskView.tsx`, add imports:

```ts
import { TaskTodosTrigger } from "@/features/task/TaskTodosTrigger";
import { useThreadTasks } from "@/lib/agui/react/useThreadTasks";
```

Inside `TaskView`, after `state` is available:

```ts
  const { tasks } = useThreadTasks(state);
```

In render, between `QueuedMessagesPanel` and `TaskMessageInput`:

```tsx
              <TaskTodosTrigger tasks={tasks} />
```

- [ ] **Step 4: 运行 TaskView/UI 测试**

Run:

```bash
bun test src/features/task/TaskTodosTrigger.test.tsx src/features/task/TaskView.agent-tasks.test.tsx
```

Expected: PASS. If the new TaskView test is too brittle, delete it and add an equivalent assertion to the established TaskView test harness before committing.

- [ ] **Step 5: 提交**

```bash
git add src/features/task/TaskView.tsx src/features/task/TaskView.agent-tasks.test.tsx src/lib/agui/react/useThreadTasks.ts
git commit -m "feat(task): show agent tasks above composer"
```

---

### Task 8: Cleanup, Typecheck, Full Verification

**Files:**
- Modify only files surfaced by verification failures.

- [ ] **Step 1: 全仓搜索旧命名**

Run:

```bash
rtk rg -n "deriveTodos|TodoEntry|useThreadPlan|TodoWrite lands|Plan update|todo plan" src sidecar
```

Expected: no matches in runtime implementation/tests. Matches in docs/specs are acceptable.

- [ ] **Step 2: 运行 sidecar focused tests**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/task-normalizer.test.ts src/agui/provider-claude/bridge.test.ts src/agui/provider-claude/provider.test.ts src/routes/settings-tools.test.ts
```

Expected: PASS.

- [ ] **Step 3: 运行 frontend focused tests**

Run:

```bash
bun test src/lib/agui/runtime/derivations.test.ts src/lib/agui/runtime/reducer.test.ts src/features/task/TaskTodosTrigger.test.tsx
```

Expected: PASS.

- [ ] **Step 4: TypeScript 检查**

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS.

Run:

```bash
cd sidecar && bunx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: 构建验证**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 6: 最终提交修复**

If verification required changes:

```bash
git add <changed-files>
git commit -m "fix: finish agent tasks integration"
```

If no files changed, skip commit.

---

## Self-Review

- Spec coverage: plan covers SDK Task tools, no `TodoWrite` compatibility, sidecar bridge/normalizer, runtime state, historical derivation fallback, input-above UI, i18n, tests, and verification.
- Placeholder scan: no `TBD` / `TODO` / “implement later” steps are used; each task contains concrete commands and expected outcomes.
- Type consistency: shared model name is `AgentTask`; snapshot event is `CUSTOM agent.tasks`; runtime flag is `hasTaskSnapshot`; hook name is `useThreadTasks`.

# 会话模型更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Task 页在会话创建后仍可更新当前会话模型，运行中切换只影响下一次 run，并通过 TanStack Query 乐观更新保持即时反馈。

**Architecture:** 复用现有 `conversations.model` 字段作为 per-thread 默认模型，在 sidecar conversation PATCH 中补齐更新能力。前端把 provider/model 选择从全局默认写入中拆出来：Task 页写当前 conversation，New Task 页保持全局默认行为并把首轮选择 seed 到 conversation。Task 页通过一个 feature-local resolver 把裸 `conversation.model` 映射为 `{ providerId, modelId }`，发送、队列 flush、regenerate 共用该结果。

**Tech Stack:** Bun test runner, Hono sidecar routes, bun:sqlite, React 19, TypeScript, TanStack Query, Testing Library, i18next, Agent Studio feature-folder structure.

---

## 文件结构与职责

- `sidecar/src/services/threads.ts`：新增 `updateModel(id, model)`，只负责持久化 conversation model。
- `sidecar/src/routes/conversations.ts`：`POST /conversations` 接收可选 `model`，`PATCH /conversations/:id` 支持 `model: string | null` 并做轻量校验。
- `sidecar/src/routes/conversations.test.ts`：新增 conversation route 专属测试，覆盖 model create/patch/validation。
- `src/lib/data/types.ts`：保持 `Conversation.model?: string | null` 语义注释准确。
- `src/lib/data/conversations.ts`：`CreateConversationArgs` 新增 `model?: string | null`；新增 `updateConversationModel()`。
- `src/lib/data/queries.ts`：新增 `useUpdateConversationModelMutation()`，实现 TanStack Query 乐观更新。
- `src/lib/data/conversation-model-queries.test.tsx`：新增数据层 mutation 测试，覆盖 PATCH body、乐观更新、失败回滚、成功覆盖。
- `src/features/task/threadModelSelection.ts`：新增纯函数 helper，把 `conversation.model` + provider settings + local state 解析为 Task 页当前 provider/model selection。
- `src/features/task/threadModelSelection.test.ts`：覆盖唯一匹配、全局默认同名优先、列表 fallback、找不到 fallback、local selection 优先。
- `src/features/task/ProviderModelPicker.tsx`：新增 `persistDefault?: boolean`，默认不写全局；只在调用方显式要求时调用 `setDefaultProviderSelection`。
- `src/features/task/ProviderModelPicker.test.tsx`：更新现有测试，明确默认不写全局，`persistDefault` 才写全局。
- `src/features/new-task/NewTaskView.tsx`：创建 conversation 时把已选模型 seed 到 `model`；模型选择器传 `persistDefault`，保持现有全局默认更新行为。
- `src/features/new-task/NewTaskView.test.tsx`：更新 mock/test，覆盖创建会话时提交 `model`。
- `src/features/task/TaskMessageInput.tsx`：移除 `modelLocked` prop 和锁定文案依赖，模型 picker 始终按传入 disabled 控制；本次 Task 页不传 disabled。
- `src/features/task/TaskView.tsx`：用 resolver 派生当前 selection；切换模型时调用 optimistic mutation；发送、队列 flush、regenerate 使用当前会话 selection。
- `src/features/task/TaskView.model-selection.test.tsx`：新增窄集成测试，通过 mocked child components 验证 Task 页模型切换和发送参数。
- `src/i18n/locales/en/task.json`、`src/i18n/locales/zh/task.json`：删除或停用旧 `task.input.modelLocked` 依赖；若保留 key，仅作为未使用遗留文案。

## 任务 1：补齐 sidecar conversation model API

**Files:**
- Modify: `sidecar/src/services/threads.ts`
- Modify: `sidecar/src/routes/conversations.ts`
- Create: `sidecar/src/routes/conversations.test.ts`

- [ ] **Step 1: 写失败测试，覆盖创建 conversation 时 seed model**

创建 `sidecar/src/routes/conversations.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { createBunSqliteRunStore } from "../agui/store-sqlite";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { ThreadService } from "../services/threads";
import { buildConversationRoutes } from "./conversations";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "conversation-route-"));
  const threads = new ThreadService(db);
  const store = createBunSqliteRunStore(db);
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const app = buildConversationRoutes({ threads, store, agentWorkspaces });
  return { app, db, baseDir, threads };
}

describe("conversation routes — model", () => {
  it("POST /conversations stores the optional model", async () => {
    const { app, baseDir } = harness();
    try {
      const res = await app.request("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Model thread", model: "gpt-5.1" }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { model: string | null };
      expect(body.model).toBe("gpt-5.1");
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 写失败测试，覆盖 patch model / clear model / invalid model**

在同一个 describe 中继续添加：

```ts
  it("PATCH /conversations/:id updates and clears the model", async () => {
    const { app, baseDir, threads } = harness();
    try {
      const thread = threads.create({ title: "Model patch" });

      const setRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-ai/DeepSeek-V3.2" }),
      });
      expect(setRes.status).toBe(200);
      expect(((await setRes.json()) as { model: string | null }).model).toBe(
        "deepseek-ai/DeepSeek-V3.2",
      );
      expect(threads.get(thread.id)?.model).toBe("deepseek-ai/DeepSeek-V3.2");

      const clearRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: null }),
      });
      expect(clearRes.status).toBe(200);
      expect(((await clearRes.json()) as { model: string | null }).model).toBeNull();
      expect(threads.get(thread.id)?.model).toBeNull();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("PATCH /conversations/:id rejects empty and non-string model values", async () => {
    const { app, baseDir, threads } = harness();
    try {
      const thread = threads.create({ title: "Invalid model patch" });

      const emptyRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "" }),
      });
      expect(emptyRes.status).toBe(400);
      expect(await emptyRes.json()).toEqual({ error: "invalid_model" });

      const numberRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: 123 }),
      });
      expect(numberRes.status).toBe(400);
      expect(await numberRes.json()).toEqual({ error: "invalid_model" });
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
rtk proxy bun test sidecar/src/routes/conversations.test.ts
```

Expected: FAIL，`POST /conversations` 不保存 model，`PATCH` 不识别/校验 model，`ThreadService.updateModel` 尚不存在。

- [ ] **Step 4: 实现 `ThreadService.updateModel()`**

在 `sidecar/src/services/threads.ts` 的 `updateWorkingDir()` 后添加：

```ts
  /** Update the conversation default model. null means this thread falls back to
   *  the global provider default when starting a run. */
  updateModel(id: string, model: string | null): Thread {
    this.db
      .prepare("UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?")
      .run(model, Date.now(), id);
    return this.get(id)!;
  }
```

- [ ] **Step 5: 实现 conversation route create/patch 支持**

在 `sidecar/src/routes/conversations.ts` 的 `POST /conversations` body 类型里加入：

```ts
          model?: string | null;
```

在 `threads.create({ ... })` 入参中加入：

```ts
      model:
        typeof body?.model === "string" && body.model.length > 0
          ? body.model
          : null,
```

在 `PATCH /conversations/:id` body 类型里加入：

```ts
          model?: string | null;
```

在 `workingDir` 分支之后、`agentWorkspaceId` 分支之前加入：

```ts
    if (body?.model !== undefined) {
      if (body.model !== null && typeof body.model !== "string") {
        return c.json({ error: "invalid_model" }, 400);
      }
      if (typeof body.model === "string" && body.model.length === 0) {
        return c.json({ error: "invalid_model" }, 400);
      }
      threads.updateModel(id, body.model);
    }
```

- [ ] **Step 6: 运行 sidecar conversation route 测试**

Run:

```bash
rtk proxy bun test sidecar/src/routes/conversations.test.ts
```

Expected: PASS，3 个 model route 测试通过。

- [ ] **Step 7: 运行相关 route 回归测试**

Run:

```bash
rtk proxy bun test sidecar/src/routes/agentWorkspaces.test.ts sidecar/src/routes/conversations.test.ts
```

Expected: PASS，agent workspace conversation binding 行为不受影响。

- [ ] **Step 8: 提交**

```bash
rtk git add sidecar/src/services/threads.ts sidecar/src/routes/conversations.ts sidecar/src/routes/conversations.test.ts
rtk git commit -m "feat(sidecar): persist conversation model"
```

## 任务 2：新增前端 conversation model 数据层与乐观更新

**Files:**
- Modify: `src/lib/data/conversations.ts`
- Modify: `src/lib/data/queries.ts`
- Create: `src/lib/data/conversation-model-queries.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖 PATCH body**

创建 `src/lib/data/conversation-model-queries.test.tsx`：

```tsx
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Conversation } from "./types";

notifyManager.setScheduler(queueMicrotask);

const fetchCalls: Array<{ path: string; init?: RequestInit }> = [];
let shouldFail = false;

const existingConversation: Conversation = {
  id: "thr_1",
  title: "Thread",
  agentWorkspaceId: null,
  pinned: false,
  archived: false,
  workingDir: "/tmp/work",
  scheduledTaskId: null,
  model: "gpt-5.1",
  permissionMode: null,
  createdAt: 1,
  updatedAt: 1,
};

mock.module("../sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    fetchCalls.push({ path, init });
    if (shouldFail) {
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    }
    const parsed = init?.body ? JSON.parse(String(init.body)) as { model: string | null } : { model: null };
    return new Response(
      JSON.stringify({
        ...existingConversation,
        model: parsed.model,
        updatedAt: 2,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
}));

const { queryKeys, useUpdateConversationModelMutation } =
  require("./queries") as typeof import("./queries");

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchCalls.length = 0;
  shouldFail = false;
});

describe("useUpdateConversationModelMutation", () => {
  it("PATCHes the conversation model", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "deepseek-ai/DeepSeek-V3.2" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchCalls[0]?.path).toBe("/conversations/thr_1");
    expect(fetchCalls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      model: "deepseek-ai/DeepSeek-V3.2",
    });
  });
});
```

- [ ] **Step 2: 写失败测试，覆盖 optimistic update 和成功覆盖**

在同一个 describe 中新增：

```tsx
  it("optimistically updates the conversation detail cache and then stores the server result", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.detail("thr_1"), existingConversation);
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });

    await waitFor(() =>
      expect((qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model).toBe(
        "gpt-5.1-mini",
      ),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).updatedAt).toBe(2);
  });
```

- [ ] **Step 3: 写失败测试，覆盖失败回滚**

继续新增：

```tsx
  it("rolls back the optimistic model when PATCH fails", async () => {
    shouldFail = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.detail("thr_1"), existingConversation);
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model).toBe(
      "gpt-5.1",
    );
  });
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
rtk proxy bun test src/lib/data/conversation-model-queries.test.tsx
```

Expected: FAIL，`useUpdateConversationModelMutation` 和 `updateConversationModel` 不存在。

- [ ] **Step 5: 实现 `updateConversationModel()` 和 create args**

在 `src/lib/data/conversations.ts` 中把 `CreateConversationArgs` 改为：

```ts
export interface CreateConversationArgs {
  title?: string;
  agentWorkspaceId?: string | null;
  workingDir?: string | null;
  model?: string | null;
}
```

在 `updateWorkingDir()` 后添加：

```ts
export async function updateConversationModel(
  id: string,
  model: string | null,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  return expectJson<Conversation>(res);
}
```

- [ ] **Step 6: 实现 optimistic mutation**

在 `src/lib/data/queries.ts` 的 import 列表中加入：

```ts
  updateConversationModel,
```

在文件底部 `useMoveConversationToAgentMutation()` 前添加：

```ts
export function useUpdateConversationModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; model: string | null }) =>
      updateConversationModel(vars.id, vars.model),
    onMutate: async (vars) => {
      const key = queryKeys.detail(vars.id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Awaited<ReturnType<typeof getConversation>>>(key);
      qc.setQueryData(key, (current: Awaited<ReturnType<typeof getConversation>> | undefined) =>
        current ? { ...current, model: vars.model } : current,
      );
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.detail(vars.id), context.previous);
      }
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.detail(updated.id), updated);
    },
    onSettled: (_data, _error, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.detail(vars.id) });
    },
  });
}
```

- [ ] **Step 7: 运行数据层测试**

Run:

```bash
rtk proxy bun test src/lib/data/conversation-model-queries.test.tsx
```

Expected: PASS，3 个 mutation 测试通过。

- [ ] **Step 8: 运行数据层相关回归**

Run:

```bash
rtk proxy bun test src/lib/data/conversation-model-queries.test.tsx src/lib/data/thread-tools-queries.test.tsx
```

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
rtk git add src/lib/data/conversations.ts src/lib/data/queries.ts src/lib/data/conversation-model-queries.test.tsx
rtk git commit -m "feat(task): add optimistic conversation model mutation"
```

## 任务 3：新增 Task 页会话模型解析 helper

**Files:**
- Create: `src/features/task/threadModelSelection.ts`
- Create: `src/features/task/threadModelSelection.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 conversation model 唯一匹配**

创建 `src/features/task/threadModelSelection.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import type { EnabledModelOption, ProviderModelSelection } from "@/lib/data/settings";
import { resolveThreadProviderSelection } from "./threadModelSelection";

const enabledModels: EnabledModelOption[] = [
  {
    providerId: "conn-openai",
    providerName: "OpenAI",
    providerLabel: "OpenAI",
    modelId: "gpt-5.1",
    modelLabel: "GPT-5.1",
    modelDescription: "Flagship",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  },
  {
    providerId: "conn-sf",
    providerName: "SiliconFlow",
    providerLabel: "SiliconFlow",
    modelId: "deepseek-ai/DeepSeek-V3.2",
    modelLabel: "DeepSeek V3.2",
    modelDescription: "Remote",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  },
];

const defaultSelection: ProviderModelSelection = {
  providerId: "conn-openai",
  modelId: "gpt-5.1",
};

describe("resolveThreadProviderSelection", () => {
  it("resolves a unique conversation model to its provider selection", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "deepseek-ai/DeepSeek-V3.2",
        enabledModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual({
      providerId: "conn-sf",
      modelId: "deepseek-ai/DeepSeek-V3.2",
    });
  });
});
```

- [ ] **Step 2: 写失败测试，覆盖 local selection 优先**

继续添加：

```ts
  it("prefers the local selection after the user changes the picker", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "gpt-5.1",
        enabledModels,
        defaultSelection,
        localSelection: {
          providerId: "conn-sf",
          modelId: "deepseek-ai/DeepSeek-V3.2",
        },
      }),
    ).toEqual({
      providerId: "conn-sf",
      modelId: "deepseek-ai/DeepSeek-V3.2",
    });
  });
```

- [ ] **Step 3: 写失败测试，覆盖同名模型优先全局默认 provider**

继续添加：

```ts
  it("uses the global default provider when multiple providers expose the same model id", () => {
    const duplicateModels = [
      ...enabledModels,
      {
        ...enabledModels[0]!,
        providerId: "conn-alt-openai",
        providerName: "Alt OpenAI",
        providerLabel: "Alt OpenAI",
      },
    ];

    expect(
      resolveThreadProviderSelection({
        conversationModel: "gpt-5.1",
        enabledModels: duplicateModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual(defaultSelection);
  });
```

- [ ] **Step 4: 写失败测试，覆盖找不到 conversation model 时回退默认**

继续添加：

```ts
  it("falls back to the global default when the conversation model is unavailable", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "removed-model",
        enabledModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual(defaultSelection);
  });

  it("returns null when no local, conversation, or global selection is available", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: null,
        enabledModels: [],
        defaultSelection: null,
        localSelection: null,
      }),
    ).toBeNull();
  });
```

- [ ] **Step 5: 运行测试确认失败**

Run:

```bash
rtk proxy bun test src/features/task/threadModelSelection.test.ts
```

Expected: FAIL，helper 文件不存在。

- [ ] **Step 6: 实现 helper**

创建 `src/features/task/threadModelSelection.ts`：

```ts
import type {
  EnabledModelOption,
  ProviderModelSelection,
} from "@/lib/data/settings";

interface ResolveThreadProviderSelectionInput {
  conversationModel?: string | null;
  enabledModels: EnabledModelOption[];
  defaultSelection?: ProviderModelSelection | null;
  localSelection?: ProviderModelSelection | null;
}

function isEnabledSelection(
  selection: ProviderModelSelection,
  enabledModels: EnabledModelOption[],
): boolean {
  return enabledModels.some(
    (model) =>
      model.providerId === selection.providerId &&
      model.modelId === selection.modelId,
  );
}

export function resolveThreadProviderSelection({
  conversationModel,
  enabledModels,
  defaultSelection,
  localSelection,
}: ResolveThreadProviderSelectionInput): ProviderModelSelection | null {
  if (localSelection && isEnabledSelection(localSelection, enabledModels)) {
    return localSelection;
  }

  if (conversationModel) {
    const matches = enabledModels.filter((model) => model.modelId === conversationModel);
    if (matches.length === 1) {
      const match = matches[0]!;
      return { providerId: match.providerId, modelId: match.modelId };
    }

    if (
      matches.length > 1 &&
      defaultSelection?.modelId === conversationModel &&
      matches.some((model) => model.providerId === defaultSelection.providerId)
    ) {
      return defaultSelection;
    }

    if (matches.length > 1) {
      const match = matches[0]!;
      return { providerId: match.providerId, modelId: match.modelId };
    }
  }

  return defaultSelection && isEnabledSelection(defaultSelection, enabledModels)
    ? defaultSelection
    : null;
}
```

- [ ] **Step 7: 运行 helper 测试**

Run:

```bash
rtk proxy bun test src/features/task/threadModelSelection.test.ts
```

Expected: PASS，5 个 resolver 测试通过。

- [ ] **Step 8: 提交**

```bash
rtk git add src/features/task/threadModelSelection.ts src/features/task/threadModelSelection.test.ts
rtk git commit -m "feat(task): resolve thread model selection"
```

## 任务 4：拆分 ProviderModelPicker 的全局默认持久化职责

**Files:**
- Modify: `src/features/task/ProviderModelPicker.tsx`
- Modify: `src/features/task/ProviderModelPicker.test.tsx`

- [ ] **Step 1: 修改测试 helper 支持 `persistDefault`**

在 `src/features/task/ProviderModelPicker.test.tsx` 中把 `renderPicker()` 签名改为：

```tsx
function renderPicker(
  disabled = false,
  value: ProviderModelSelection | null = {
    providerId: "conn-openai",
    modelId: "gpt-5.1",
  },
  persistDefault = false,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ProviderModelPicker
          disabled={disabled}
          value={value}
          onChange={onChangeMock}
          persistDefault={persistDefault}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 2: 改写现有默认持久化测试为失败测试**

把现有 `it("persists the selected provider model as the next default"...` 改成：

```tsx
  it("does not persist the selected model globally by default", async () => {
    renderPicker();

    fireEvent.click(await screen.findByText("DeepSeek V3.2"));

    await waitFor(() =>
      expect(onChangeMock).toHaveBeenCalledWith({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );
    expect(setDefaultProviderSelectionMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: 添加显式全局持久化测试**

继续新增：

```tsx
  it("persists the selected provider model as the next default when requested", async () => {
    renderPicker(false, { providerId: "conn-openai", modelId: "gpt-5.1" }, true);

    fireEvent.click(await screen.findByText("DeepSeek V3.2"));

    await waitFor(() =>
      expect(setDefaultProviderSelectionMock).toHaveBeenCalledWith({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );
  });
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
rtk proxy bun test src/features/task/ProviderModelPicker.test.tsx
```

Expected: FAIL，组件 props 不包含 `persistDefault`，默认仍会调用 `setDefaultProviderSelection`。

- [ ] **Step 5: 实现 `persistDefault`**

在 `src/features/task/ProviderModelPicker.tsx` 中更新 props：

```ts
interface ProviderModelPickerProps {
  value: ProviderModelSelection | null;
  onChange: (selection: ProviderModelSelection) => void;
  persistDefault?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}
```

更新函数参数：

```ts
export function ProviderModelPicker({
  value,
  onChange,
  persistDefault = false,
  disabled = false,
  disabledReason,
}: ProviderModelPickerProps) {
```

把 `handleSelect` 改为：

```ts
  const handleSelect = (selection: ProviderModelSelection) => {
    onChange(selection);
    if (!persistDefault) return;
    queryClient.setQueryData(["provider"], (current: typeof data) =>
      current ? { ...current, defaultSelection: selection } : current,
    );
    void setDefaultProviderSelection(selection)
      .then((next) => {
        queryClient.setQueryData(["provider"], (current: typeof data) =>
          current ? { ...current, ...next, builtIn: current.builtIn } : next,
        );
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: ["provider"] });
      });
  };
```

- [ ] **Step 6: 运行 picker 测试**

Run:

```bash
rtk proxy bun test src/features/task/ProviderModelPicker.test.tsx
```

Expected: PASS，默认不写全局、显式 `persistDefault` 才写全局。

- [ ] **Step 7: 提交**

```bash
rtk git add src/features/task/ProviderModelPicker.tsx src/features/task/ProviderModelPicker.test.tsx
rtk git commit -m "feat(task): decouple model picker persistence"
```

## 任务 5：New Task 将首轮模型 seed 到 conversation

**Files:**
- Modify: `src/features/new-task/NewTaskView.tsx`
- Modify: `src/features/new-task/NewTaskView.test.tsx`

- [ ] **Step 1: 更新 NewTaskView 测试 mock，暴露 createConversation 调用**

在 `src/features/new-task/NewTaskView.test.tsx` 顶部新增：

```tsx
const createConversationMock = mock(async () => ({ id: "conversation-1" }));
```

把 `mock.module("@/lib/data/conversations"...` 改为：

```tsx
mock.module("@/lib/data/conversations", () => ({
  createConversation: createConversationMock,
}));
```

在 `beforeEach()` 中加入：

```tsx
  createConversationMock.mockClear();
```

- [ ] **Step 2: 写失败测试，覆盖 selected model seed**

把 `TestModelPicker` 改成可触发选择：

```tsx
function TestModelPicker({
  onChange,
}: {
  onChange: (selection: { providerId: string; modelId: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onChange({
          providerId: "conn-sf",
          modelId: "deepseek-ai/DeepSeek-V3.2",
        })
      }
    >
      Model
    </button>
  );
}
```

新增测试：

```tsx
  it("stores the selected model on the created conversation", async () => {
    renderNewTaskView();

    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.change(screen.getByLabelText("How can I help you today?"), {
      target: { value: "Build the thing" },
    });
    fireEvent.submit(screen.getByLabelText("How can I help you today?").closest("form")!);

    await screen.findByRole("heading", {
      name: "Let Agent Studio move work forward on this desktop.",
    });
    expect(createConversationMock).toHaveBeenCalledWith({
      title: "New task",
      workingDir: null,
      model: "deepseek-ai/DeepSeek-V3.2",
    });
  });
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
rtk proxy bun test src/features/new-task/NewTaskView.test.tsx
```

Expected: FAIL，`createConversation` 当前不接收 model；`ProviderModelPicker` 调用也未传 `persistDefault`。

- [ ] **Step 4: 修改 NewTaskView createConversation 入参和 picker props**

在 `src/features/new-task/NewTaskView.tsx` 中把 create conversation 调用改为：

```ts
      const conv = await createConversation({
        title: t("newTask.defaultTitle"),
        workingDir,
        model: providerSelection?.modelId ?? null,
      });
```

把 `ModelPicker` 调用改为：

```tsx
                <ModelPicker
                  value={providerSelection}
                  onChange={setProviderSelection}
                  persistDefault
                />
```

如果 `ModelPickerComponent` 类型报错，把类型定义改为：

```ts
type ModelPickerComponent = typeof ProviderModelPicker;
```

保持现状即可；`typeof ProviderModelPicker` 会包含新增 prop。

- [ ] **Step 5: 运行 NewTaskView 测试**

Run:

```bash
rtk proxy bun test src/features/new-task/NewTaskView.test.tsx
```

Expected: PASS。

- [ ] **Step 6: 运行 picker + new task 回归**

Run:

```bash
rtk proxy bun test src/features/task/ProviderModelPicker.test.tsx src/features/new-task/NewTaskView.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
rtk git add src/features/new-task/NewTaskView.tsx src/features/new-task/NewTaskView.test.tsx
rtk git commit -m "feat(task): seed new threads with selected model"
```

## 任务 6：Task 页接入会话模型选择和乐观更新

**Files:**
- Modify: `src/features/task/TaskMessageInput.tsx`
- Modify: `src/features/task/TaskView.tsx`
- Create: `src/features/task/TaskView.model-selection.test.tsx`

- [ ] **Step 1: 写 TaskView 窄集成测试的基础 mock**

创建 `src/features/task/TaskView.model-selection.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProviderModelSelection } from "@/lib/data/settings";

const sendMock = mock(async (_text: string, _opts?: unknown) => {});
const regenerateMock = mock(async (_id: string, _opts?: unknown) => {});
const updateConversationModelMutate = mock(
  (_vars: { id: string; model: string | null }, opts?: { onError?: () => void }) => {
    void opts;
  },
);
let currentPickerSelection: ProviderModelSelection | null = null;

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/app/AppShellContext", () => ({
  useAppShell: () => ({
    pendingFirstPrompt: null,
    setPendingFirstPrompt: mock(() => {}),
    preview: { open: false, file: null },
    openPreview: mock(() => {}),
    closePreview: mock(() => {}),
  }),
}));

mock.module("@/features/task/TaskHeader", () => ({
  TaskHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

mock.module("@/features/task/ChatStream", () => ({
  ChatStream: ({ onRegenerate }: { onRegenerate: (id: string) => void }) => (
    <button type="button" onClick={() => onRegenerate("msg_user_1")}>
      Regenerate
    </button>
  ),
}));

mock.module("@/features/task/TaskRightPanel", () => ({
  TaskRightPanel: () => null,
}));

mock.module("@/features/task/QueuedMessagesPanel", () => ({
  QueuedMessagesPanel: () => null,
}));

mock.module("@/features/task/PreviewPane", () => ({
  PreviewPane: () => null,
}));

mock.module("@/features/task/TaskMessageInput", () => ({
  TaskMessageInput: ({
    providerSelection,
    onProviderSelectionChange,
    onSend,
  }: {
    providerSelection: ProviderModelSelection | null;
    onProviderSelectionChange: (selection: ProviderModelSelection) => void;
    onSend: (text: string) => void;
  }) => {
    currentPickerSelection = providerSelection;
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            onProviderSelectionChange({
              providerId: "conn-sf",
              modelId: "deepseek-ai/DeepSeek-V3.2",
            })
          }
        >
          Switch model
        </button>
        <button type="button" onClick={() => onSend("Next message")}>
          Send message
        </button>
      </div>
    );
  },
}));

mock.module("@/lib/agui/react/useChat", () => ({
  useChat: () => ({
    viewMessages: [{ id: "msg_user_1", role: "user", content: "Hello" }],
    state: {},
    runtime: { getState: () => ({ activeRunId: null }) },
    isRunning: false,
    isThinking: false,
    error: null,
    send: sendMock,
    regenerate: regenerateMock,
    cancel: mock(async () => {}),
    attachToRun: mock(() => {}),
    setHistoricalMessages: mock(() => {}),
    pendingInterrupts: [],
    resumeRun: mock(async () => {}),
  }),
}));

mock.module("@/lib/agui/react/useThreadStatuses", () => ({
  useActiveRunForThread: () => null,
  useThreadStatuses: () => ({ data: [] }),
}));

mock.module("@/lib/agui/react/useThreadUnread", () => ({
  useThreadUnread: () => ({ markRead: mock(() => {}) }),
}));

mock.module("@/lib/agui/react/useAllowedTools", () => ({
  useAllowedTools: () => ({ allowedTools: new Set<string>() }),
}));

mock.module("@/lib/agui/react/useWorkspaceAllowedTools", () => ({
  useWorkspaceAllowedTools: () => ({
    allowedTools: new Set<string>(),
    addAllowedTool: mock(() => {}),
  }),
}));

mock.module("@/lib/agui/react/useThreadPermissionMode", () => ({
  useThreadPermissionMode: () => ({
    mode: "ask",
    setMode: mock(() => {}),
  }),
}));

mock.module("@/features/task/MessageQueueContext", () => ({
  useMessageQueue: () => ({
    items: [],
    add: mock(() => {}),
    remove: mock(() => {}),
    popHead: mock(() => null),
    clearUserCancelled: mock(() => {}),
    markUserCancelled: mock(() => {}),
    userCancelled: false,
  }),
}));

mock.module("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    ensureAuthenticated: mock(async () => {}),
    getValidAccessToken: mock(async () => "token"),
    refreshUser: mock(async () => {}),
  }),
}));

mock.module("@/features/task/officialRunAuth", () => ({
  buildOfficialRunAuthFields: mock(async () => ({})),
}));

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => ({
    defaultSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
    enabledModels: [
      {
        providerId: "conn-openai",
        providerName: "OpenAI",
        providerLabel: "OpenAI",
        modelId: "gpt-5.1",
        modelLabel: "GPT-5.1",
        modelDescription: "Flagship",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
      {
        providerId: "conn-sf",
        providerName: "SiliconFlow",
        providerLabel: "SiliconFlow",
        modelId: "deepseek-ai/DeepSeek-V3.2",
        modelLabel: "DeepSeek V3.2",
        modelDescription: "Remote",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.siliconflow.cn/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
    ],
  })),
}));

mock.module("@/lib/data/queries", () => ({
  useArchiveConversationMutation: () => ({ mutate: mock(() => {}) }),
  useConversation: () => ({
    data: {
      id: "thr_1",
      title: "Thread",
      workingDir: "/tmp/work",
      model: "gpt-5.1",
      agentWorkspaceId: null,
      scheduledTaskId: null,
      permissionMode: null,
    },
  }),
  useMessages: () => ({ data: [], isLoading: false }),
  useUpdateConversationModelMutation: () => ({
    mutate: updateConversationModelMutate,
  }),
}));

const { TaskView } = require("./TaskView") as typeof import("./TaskView");

function renderTaskView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/task/thr_1"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/task/:threadId" element={<TaskView />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sendMock.mockClear();
  regenerateMock.mockClear();
  updateConversationModelMutate.mockClear();
  currentPickerSelection = null;
});

afterEach(() => cleanup());
```

- [ ] **Step 2: 写失败测试，覆盖初始 selection、切换 patch、发送使用新模型**

在同一文件添加：

```tsx
describe("TaskView conversation model selection", () => {
  it("allows changing the model after messages exist and uses it for the next send", async () => {
    renderTaskView();

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));

    expect(updateConversationModelMutate).toHaveBeenCalledWith(
      {
        id: "thr_1",
        model: "deepseek-ai/DeepSeek-V3.2",
      },
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-sf",
            modelId: "deepseek-ai/DeepSeek-V3.2",
          },
        }),
      ),
    );
  });
```

- [ ] **Step 3: 写失败测试，覆盖 regenerate 使用当前会话模型**

继续添加：

```tsx
  it("uses the current model selection for regenerate", async () => {
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    await waitFor(() =>
      expect(regenerateMock).toHaveBeenCalledWith(
        "msg_user_1",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-sf",
            modelId: "deepseek-ai/DeepSeek-V3.2",
          },
        }),
      ),
    );
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
rtk proxy bun test src/features/task/TaskView.model-selection.test.tsx
```

Expected: FAIL，TaskView 尚未接入 `useUpdateConversationModelMutation` 和 resolver，切换不会 patch conversation。

- [ ] **Step 5: 移除 TaskMessageInput 的 `modelLocked` prop**

在 `src/features/task/TaskMessageInput.tsx` 中删除 props 注释和字段：

```ts
  /** Lock the model picker — the session has started, model is fixed. */
  modelLocked?: boolean;
```

从参数中删除：

```ts
  modelLocked = false,
```

把 `ProviderModelPicker` 调用改为：

```tsx
            <ProviderModelPicker
              value={providerSelection}
              onChange={onProviderSelectionChange}
            />
```

删除 `disabled={modelLocked}` 和 `disabledReason={t("task.input.modelLocked")}`。

- [ ] **Step 6: TaskView 导入 resolver 和 mutation**

在 `src/features/task/TaskView.tsx` 中补 import：

```ts
  useUpdateConversationModelMutation,
```

从 `@/lib/data/queries` import 列表加入。

新增 resolver import：

```ts
import { resolveThreadProviderSelection } from "@/features/task/threadModelSelection";
```

- [ ] **Step 7: TaskView 派生当前 provider selection**

在 `providerQuery` 后或 `conversationQuery` 后添加：

```ts
  const updateConversationModel = useUpdateConversationModelMutation();
  const effectiveProviderSelection = useMemo(
    () =>
      resolveThreadProviderSelection({
        conversationModel: conversationQuery.data?.model ?? null,
        enabledModels: providerQuery.data?.enabledModels ?? [],
        defaultSelection: providerQuery.data?.defaultSelection ?? null,
        localSelection: providerSelection,
      }),
    [
      conversationQuery.data?.model,
      providerQuery.data?.enabledModels,
      providerQuery.data?.defaultSelection,
      providerSelection,
    ],
  );
```

把 `sendOrQueue()` 中传给 `buildRunOptions` 的 `providerSelection` 改为：

```ts
          providerSelection: effectiveProviderSelection,
```

把 dependency 中 `providerSelection` 替换为 `effectiveProviderSelection`。

把 `onRegenerate` 中传给 `buildRunOptions` 的 `providerSelection` 也改为：

```ts
                    providerSelection: effectiveProviderSelection,
```

并更新 dependency。如果 `onRegenerate` 是 JSX inline，不需要手动依赖数组。

- [ ] **Step 8: TaskView 添加切换处理函数**

在 `sendOrQueue` 前添加：

```ts
  const handleProviderSelectionChange = useCallback(
    (selection: ProviderModelSelection) => {
      const previousSelection = effectiveProviderSelection;
      setProviderSelection(selection);
      if (!activeTaskId) return;
      updateConversationModel.mutate(
        { id: activeTaskId, model: selection.modelId },
        {
          onError: () => {
            setProviderSelection(previousSelection);
          },
        },
      );
    },
    [activeTaskId, effectiveProviderSelection, updateConversationModel],
  );
```

注释写中文，说明：本地 state 先变，mutation 失败时回滚；已经启动的 run 不撤回。

- [ ] **Step 9: TaskView JSX 使用新 selection 和 handler**

把 `TaskMessageInput` props 改为：

```tsx
                providerSelection={effectiveProviderSelection}
                onProviderSelectionChange={handleProviderSelectionChange}
```

删除：

```tsx
                modelLocked={viewMessages.length > 0}
```

- [ ] **Step 10: 首轮 pending prompt 设置会话本地选择**

在 first-turn effect 中保留：

```ts
      setProviderSelection(firstProviderSelection);
```

不需要额外 mutation，因为任务 5 已经在 `createConversation` 时 seed `model`。

- [ ] **Step 11: 运行 TaskView model selection 测试**

Run:

```bash
rtk proxy bun test src/features/task/TaskView.model-selection.test.tsx
```

Expected: PASS，模型切换会 patch conversation，后续 send/regenerate 使用新 selection。

- [ ] **Step 12: 运行 Task 相关回归测试**

Run:

```bash
rtk proxy bun test src/features/task/threadModelSelection.test.ts src/features/task/ProviderModelPicker.test.tsx src/features/task/TaskView.model-selection.test.tsx src/features/task/providerRunOptions.test.ts
```

Expected: PASS。

- [ ] **Step 13: 提交**

```bash
rtk git add src/features/task/TaskMessageInput.tsx src/features/task/TaskView.tsx src/features/task/TaskView.model-selection.test.tsx
rtk git commit -m "feat(task): allow per-thread model switching"
```

## 任务 7：清理旧锁定文案并做端到端验证

**Files:**
- Modify: `src/i18n/locales/en/task.json`
- Modify: `src/i18n/locales/zh/task.json`
- Verify: no code ownership changes unless tests reveal a stale import/type issue

- [ ] **Step 1: 搜索旧锁定字段引用**

Run:

```bash
rtk rg -n "modelLocked|task\\.input\\.modelLocked|The model can't be changed|模型.*不能" src
```

Expected before cleanup: only locale key references or no references. If `TaskMessageInput` / `TaskView` still references these, return to Task 6 and remove them.

- [ ] **Step 2: 清理 locale key**

如果 Step 1 只剩 locale JSON，则从 `src/i18n/locales/en/task.json` 的 `input` 对象删除：

```json
"modelLocked": "The model can't be changed once a session has started. Start a new session to use a different model.",
```

从 `src/i18n/locales/zh/task.json` 删除对应 `modelLocked` 文案。删除时保持 JSON 逗号合法。

- [ ] **Step 3: 运行全量相关测试**

Run:

```bash
rtk proxy bun test sidecar/src/routes/conversations.test.ts sidecar/src/routes/agentWorkspaces.test.ts src/lib/data/conversation-model-queries.test.tsx src/features/task/threadModelSelection.test.ts src/features/task/ProviderModelPicker.test.tsx src/features/new-task/NewTaskView.test.tsx src/features/task/TaskView.model-selection.test.tsx src/features/task/providerRunOptions.test.ts
```

Expected: PASS，所有新增和相关回归测试通过。

- [ ] **Step 4: 运行 TypeScript 检查**

Run:

```bash
rtk proxy bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS，无 `modelLocked` prop、`persistDefault` prop、mutation 类型错误。

- [ ] **Step 5: 运行 build**

Run:

```bash
rtk proxy bun run build
```

Expected: PASS，Vite build 成功。

- [ ] **Step 6: 最终状态检查**

Run:

```bash
rtk git status --short
```

Expected: 只包含本计划相关文件变更，没有无关文件。

- [ ] **Step 7: 提交清理与验证收口**

```bash
rtk git add src/i18n/locales/en/task.json src/i18n/locales/zh/task.json
rtk git commit -m "chore(task): remove obsolete model lock copy"
```

如果 Step 2 没有 locale 变更，则跳过 commit，并在执行报告里说明旧文案已经无引用。

## 最终验收清单

- [ ] 创建新会话时选择模型，首轮 run 使用该模型，并且 conversation 返回 `model`。
- [ ] 完成首轮后 Task 页模型 picker 仍可切换。
- [ ] Task 页切换模型调用 `PATCH /conversations/:id { model }`，不调用 `setDefaultProviderSelection`。
- [ ] 切换后立即发送下一条消息，请求包含新 `{ providerId, modelId }`。
- [ ] 当前 run 运行中切换模型不会取消当前 run；队列 flush 读取最新会话选择。
- [ ] regenerate 使用当前会话默认模型。
- [ ] PATCH 失败时 TanStack Query cache 和 picker 本地 state 回滚。
- [ ] 新建另一个会话时不会被上一个会话的 Task 页切换误改全局默认。
- [ ] `rtk proxy bunx tsc --noEmit -p tsconfig.app.json` 通过。
- [ ] `rtk proxy bun run build` 通过。

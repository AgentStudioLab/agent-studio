# Agent Tasks 工具设计

日期：2026-06-22

## 背景

Agent Studio 当前接入的是 `@anthropic-ai/claude-agent-sdk`。SDK 已提供新的任务工具：

- `TaskCreate`
- `TaskGet`
- `TaskUpdate`
- `TaskList`

同时 SDK 仍暴露旧的 `TodoWrite` schema，但从 TypeScript Agent SDK `0.3.142` 起，`TodoWrite` 默认禁用，SDK 文档建议改用新的 Task 工具。

当前仓库没有实现 `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` 的桥接或 UI。现有代码只在 `src/lib/agui/runtime/derivations.ts` 中从历史/实时 tool call 里派生 `TodoWrite` 的 `args.todos`，并把 `TodoWrite` 归类到右侧 Process tab 的 plan 阶段。`useThreadPlan()` 当前没有实际调用点。也就是说，现有 `TodoWrite` 不是完整 todo 功能，而是遗留的前端派生逻辑。

本设计目标是做一次干净迁移：以 SDK 原生 Task 工具作为唯一任务来源，移除旧 `TodoWrite` 派生语义，并在输入框上方提供只读任务列表 UI。

## 目标

1. 使用 SDK 原生 `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` 实现 agent 任务列表。
2. 任务列表由 agent 维护，前端只读展示，不提供用户手动编辑、清空或改状态。
3. 输入框上方显示 trigger 按钮；点击后打开任务列表 popover。
4. UI 风格遵守当前项目规范和 design token 体系。
5. 移除旧 `TodoWrite` 依赖，避免维护两套任务语义。
6. 将 SDK 原始事件隔离在 sidecar bridge/normalizer 边界，前端只消费稳定的 Agent Studio 内部任务模型。
7. 用纯函数和 focused tests 覆盖任务归一化、runtime reducer、派生逻辑和 UI 交互。

## 非目标

1. 不兼容旧 `TodoWrite`。
2. 不恢复 `CLAUDE_CODE_ENABLE_TASKS=0`。
3. 不新增用户编辑任务的 UI。
4. 不新增数据库表；任务状态必须从已持久化的 run events 和 tool calls 重放恢复。
5. 不把任务列表放到右侧 `TaskRightPanel` tab 中。
6. 不把 Task 工具纳入用户审批/HITL 流程。

## 推荐方案

接入 SDK 新 Task 工具，并在 Agent Studio 内部建立轻量、稳定的 `AgentTask` 状态模型。

后端负责：

1. 让 Claude provider 的 SDK options 暴露 Task 工具。
2. 在 bridge 层识别 Task 工具调用和结果。
3. 用纯函数 normalizer 维护 per-turn task snapshot。
4. 通过 `CUSTOM agent.tasks` 事件向 AGUI runtime 发送完整任务快照。

前端负责：

1. 在 `ChatState` 中保存当前 `tasks`。
2. reducer 消费 `CUSTOM agent.tasks` snapshot。
3. 重构旧 `deriveTodos()` / `useThreadPlan()` 为 task 语义。
4. 在 `TaskView` 输入框上方渲染 trigger + popover。

该方案顺 SDK 的任务体系前进，不引入自定义 MCP todo 工具，也不依赖废弃的 `TodoWrite`。

## 内部任务模型

前端和 sidecar 共享的概念模型保持小而稳定：

```ts
type AgentTaskStatus = "pending" | "in_progress" | "completed";

interface AgentTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTaskStatus;
  updatedAt: number;
}
```

映射规则：

1. `TaskCreate` result 中的 `task.id` 是稳定 id。
2. `TaskCreate` 的 `subject` 优先使用 result，缺失时回退 input。
3. `description` 和 `activeForm` 来自 `TaskCreate` / `TaskUpdate` input。
4. `TaskUpdate(status: "deleted")` 从 snapshot 中移除该任务。
5. UI 只展示 `pending` / `in_progress` / `completed` 三态。
6. 如果 SDK 或工具结果出现 `running` 等内部状态，normalizer 映射为 `in_progress`。
7. 如果多个任务同时为 `in_progress`，UI 照实展示；约束通过 prompt guidance 引导模型保持最多一个 active task。
8. 每次变更向前端发送完整 snapshot，而不是 delta。

## SDK 与 provider

`sidecar/src/agui/provider-claude/provider.ts` 中需要调整 Claude SDK options：

1. `allowedTools` 包含 `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList`。
2. 默认工具设置 `sidecar/src/services/settings-tools.ts` 增加这些 Task 工具。
3. `canUseTool` 对 Task 工具直接 allow，并返回 `updatedInput: input`。
4. Task 工具不走 workspace sandbox，不走 approval bus，不匹配 approval rules。

理由：

- Task 工具只维护会话内任务状态，不读写文件，不执行命令。
- 把它们纳入 HITL 会打断 agent 的计划更新，体验上会显得噪音很重。
- 任务状态属于 agent 内部工作面板，语义更接近 planning metadata，而不是外部副作用。

Provider 的 append prompt 需要加入 Task 工具 guidance：

1. 多步骤工作早创建任务。
2. 任务保持短、具体、可执行。
3. 进展变化时及时更新状态。
4. 同一时间最多一个 `in_progress`。
5. 最终回复前把已完成事项标记为 `completed`。
6. 不再提 `TodoWrite`。

## Bridge 与 normalizer

新增 sidecar feature-local 纯函数模块，例如：

```ts
sidecar/src/agui/provider-claude/task-normalizer.ts
```

职责：

1. 接收 SDK tool call start/end/result 语义。
2. 根据 `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` 更新内存 snapshot。
3. 输出 `AgentTask[]`。
4. 对 malformed input/result 容错，不让 bridge 崩溃。

主路径：

1. `TaskCreate` input 暂存 `subject` / `description` / `activeForm`。
2. `TaskCreate` result 到达后读取 `task.id`，创建或 upsert task。
3. `TaskUpdate` input 携带 `taskId` 和 patch；result 成功时应用 patch。
4. `TaskUpdate(status: "deleted")` 删除 task。
5. `TaskList` result 如果包含完整 tasks，可用于 resync snapshot。
6. `TaskGet` result 可用于补齐单个 task。

Bridge 输出事件：

```ts
{
  type: "CUSTOM",
  name: "agent.tasks",
  value: {
    tasks: AgentTask[]
  }
}
```

Bridge 应在 snapshot 实际变化时 emit，避免无意义刷新。

## Runtime 与历史恢复

`src/lib/agui/runtime/types.ts` 中 `ChatState` 新增：

```ts
tasks: AgentTask[];
hasTaskSnapshot: boolean;
```

`createInitialState()` 返回 `tasks: []` 和 `hasTaskSnapshot: false`。

`src/lib/agui/runtime/reducer.ts` 新增 `CUSTOM agent.tasks` 处理：

1. 校验 payload 是数组。
2. 过滤 malformed task。
3. 保留稳定排序。
4. 更新 `state.tasks`。
5. 设置 `hasTaskSnapshot: true`。

历史恢复策略：

1. 运行中通过 `CUSTOM agent.tasks` 获得实时 snapshot。
2. 刷新或切换线程后，如果 run events 已经 replay 出 `CUSTOM agent.tasks`，直接使用 `state.tasks`。
3. 如果没有 replay 到 snapshot，则从 `historicalMessages` 和 `liveMessages` 中已有 tool calls 派生当前 tasks。
4. 不新增数据库表；恢复能力必须建立在现有 append-only run events 和 persisted tool calls 上。

旧 `deriveTodos()` / `TodoEntry` / `useThreadPlan()` 应替换为：

```ts
deriveAgentTasks(state: ChatState): AgentTask[]
useThreadTasks(state: ChatState | null): { tasks: AgentTask[] }
```

如果 `state.hasTaskSnapshot` 为 true，直接使用 `state.tasks`；否则走 tool call 派生。这样空数组可以明确表示“agent 已清空任务”，不会和“尚未恢复任务状态”混淆。

## Process 阶段

右侧 `Process` tab 继续展示固定的 context / plan / execute / finish 四阶段，但 plan 阶段不再识别 `TodoWrite`。

更新规则：

1. `TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList` 归到 `plan` phase。
2. `TaskCreate` label 可显示为 `Task created` 或本地化后的短标签。
3. `TaskUpdate` label 可显示为 `Task updated`。
4. 旧测试中 “TodoWrite lands in plan phase” 改成 “Task tools land in plan phase”。

任务详情不塞进 Process tab；完整列表由输入框上方 trigger 展示。

## 前端 UI

新增组件放在 `src/features/task/` 内，例如：

```txt
src/features/task/TaskTodosTrigger.tsx
```

挂载位置在 `TaskView` 输入区容器内：

```txt
QueuedMessagesPanel
TaskTodosTrigger
TaskMessageInput
```

交互：

1. 无任务时隐藏 trigger。
2. 有任务后显示紧凑 trigger。
3. 点击 trigger 打开 popover。
4. Popover 列表只读。
5. 列表可滚动，避免任务较多时挤压输入区。
6. 保持 `max-w-[760px]` 输入区宽度约束。

Trigger 内容：

1. 左侧 lucide 图标，例如 `ListChecks`。
2. 文案显示完成数和总数，例如 `任务 2/5` / `Tasks 2/5`。
3. 如果存在 `in_progress` 任务，显示该任务的 `activeForm` 或 `subject` 的短文本。

任务行：

1. `completed`：check icon，success token，文字弱化。
2. `in_progress`：brand token，activity indicator，文字强调。
3. `pending`：muted token，empty circle。

样式要求：

1. 使用现有 Tailwind token utility 和 semantic tokens。
2. 不在 `src/features/` 中硬编码 hex/raw HSL。
3. 不新增一套 todo 专属颜色。
4. 按现有项目规范使用 lucide icon。
5. 文案走 `src/i18n/locales/en/task.json` 和 `src/i18n/locales/zh/task.json`。

## 错误处理

1. Task 工具 input 缺字段：normalizer 忽略该次变更，保留已有 snapshot。
2. Task result 缺 id：不创建新 task。
3. `TaskUpdate` 指向未知 task：如果 input 有足够字段，可创建占位；否则忽略。
4. `TaskList` result malformed：忽略 resync。
5. `CUSTOM agent.tasks` payload malformed：前端 reducer 忽略。
6. SDK run error/cancel 不清空 `tasks`，除非后续 snapshot 明确为空；用户仍可看到 agent 已形成的计划。

## 测试计划

### Sidecar

1. Task normalizer：`TaskCreate` input + result 创建 task。
2. Task normalizer：`TaskUpdate` 更新 status、subject、description、activeForm。
3. Task normalizer：`TaskUpdate(status:"deleted")` 删除 task。
4. Task normalizer：`TaskList` result resync snapshot。
5. Task normalizer：malformed input/result 不抛错。
6. Bridge：Task snapshot 变化时 emit `CUSTOM agent.tasks`。
7. Provider：Task 工具 bypass sandbox 和 HITL，返回 allow + `updatedInput`。
8. Settings tools：默认工具集包含新的 Task 工具。

### Runtime

1. `createInitialState()` 包含 `tasks: []`。
2. reducer 消费 `CUSTOM agent.tasks` 更新 `state.tasks`。
3. reducer 忽略 malformed payload。
4. `deriveAgentTasks()` 能从历史 tool calls 恢复当前 snapshot。
5. `deriveProgressPhases()` 把 Task 工具归为 plan。

### UI

1. 无任务时不渲染 trigger。
2. 有任务时显示完成数/总数。
3. 有 `in_progress` 时显示当前任务短文本。
4. 点击 trigger 打开 popover。
5. Popover 渲染 pending / in_progress / completed 三态。
6. UI 不提供编辑、删除、清空按钮。
7. 中英文文案存在。

### 类型与集成

1. `bun test src/lib/agui/runtime/derivations.test.ts`
2. `bun test src/lib/agui/runtime/reducer.test.ts`
3. `bun test src/features/task/...`
4. `cd sidecar && bun test src/agui/provider-claude/...`
5. `bunx tsc --noEmit -p tsconfig.app.json`
6. `cd sidecar && bunx tsc --noEmit`

## 迁移与清理

1. 删除 `TodoWrite` 专属派生逻辑。
2. 删除或重命名 `useThreadPlan()`。
3. 删除旧 `TodoWrite` tests。
4. 删除 `TodoWrite` phase 分类。
5. 不保留 `TodoWrite` compatibility branch。
6. 确保注释、变量名、测试描述统一使用 `AgentTask` / `Task tools` / `tasks`，避免继续混用 `todo plan`。

## 验收标准

1. Agent 能通过 SDK Task 工具维护任务列表。
2. 输入框上方 trigger 在有任务时出现，点击可查看只读列表。
3. 任务状态在 streaming 期间实时更新。
4. 刷新或切换线程后能从历史恢复任务列表。
5. 旧 `TodoWrite` 逻辑被移除。
6. Task 工具不会触发用户审批。
7. Process tab 的 plan 阶段由 Task 工具驱动。
8. 新增和调整的测试通过。

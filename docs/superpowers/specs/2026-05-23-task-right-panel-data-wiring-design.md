# Task 右侧面板数据接入设计

**Date:** 2026-05-23
**Status:** Design
**Scope:** `TaskView` 右侧 Process / Files / Context 三个 Tab 从 mock-driven 切换为真实 agent 运行数据驱动。

## 背景

`src/features/task/TaskRightPanel.tsx` 视觉外壳与 `原型稿/Claude Desktop/Showcase 1 - Cowork.html` 1:1 对齐，三个 Tab 组件 (`ProcessTab` / `FilesTab` / `ContextTab`) 都已就位。但在 `TaskView.tsx:267` 调用时不传任何 props——所有 Tab 都进入空状态分支，用户看到 "No artifacts yet"。

本设计回答**每个 Tab 该展示什么数据、数据从哪里来**，不重做视觉。

## 核心思路

```
┌─────────────────────────────────────────────────┐
│  ChatRuntime reducer (frontend)                  │
│   ├─ existing: messages, interrupts, ...         │
│   ├─ NEW: latestTodos[]    ← TodoWrite tool_use  │
│   └─ NEW: touchedFiles{}   ← Read/Write/Edit...  │
└──┬───────────────────────┬──────────────────────┘
   │ useThreadPlan(id)     │ useThreadFiles(id)
   ▼                       ▼
ProcessTab              FilesTab        ┌──── ContextTab
                                        │
                                        ▼
                              useThreadContext(id)
                                        │
                                        ▼
                              GET /threads/:id/context
                                        │
                                        ▼
                              sidecar (SDK system.init 元数据)
```

- **Process / Files** 是事件流派生——reducer 在已有 chat stream 上扩两段逻辑，无新数据库字段。线程切换或 sidecar 重启后，从持久化 messages 重跑 reducer 即可恢复。
- **Context** 是线程级 RPC 查询——sidecar 解析 SDK `system.init` 的 `mcp_servers` + `tools` 字段，挂在内存 `SessionMetadata` map 里，前端 `useQuery` 拉取。

## Process Tab

**数据源：** 聊天事件流里 `TodoWrite` 工具调用的最新一次 `todos` 数组。agent 每次调用 TodoWrite 会全量覆盖之前的 todo 列表，所以 reducer 只需保留最后一次。

**Todo 项结构（reducer 中沉淀的形状）：**

```ts
interface TodoEntry {
  content: string;       // 显示文案
  activeForm?: string;   // 进行时文案（active 状态下显示）
  status: 'pending' | 'in_progress' | 'completed';
}
```

**状态映射：**

| SDK todo status | UI status | 视觉 |
|---|---|---|
| `pending` | `pending` | 虚线圆圈 |
| `in_progress` | `active` | 橙色圆圈 + pulse-dot |
| `completed` | `done` | 绿色对勾 |
| (未来) `failed` | `failed` | 红色 X — UI 已支持 |

**耗时计时：** 从当前 Run 的 `runStartedAt` 起，每秒刷新差值。已有 `ProcessTab.tsx` 的 `setInterval` 改成从 `useThreadRunMeta(threadId)` 取 `runStartedAt`，去掉 `MockTask.elapsedSeconds` 来源。

**空状态：** 「等待 agent 制定计划…」。短任务里 agent 可能完全不调 TodoWrite——这种情况就一直保持空时间线 + 底部「Task running · 02:13 elapsed」横幅。

**对现有代码影响：** `ProcessTab.tsx` 视觉完全保留，props 从 `task: MockTask` 改成 `threadId: string`，内部用 `useThreadPlan(threadId)` 拿 todos 数组、用 `useThreadRunMeta(threadId)` 拿运行元数据。

## Files Tab

**数据源：** 聊天事件流里的文件操作工具调用——`Read` / `Write` / `Edit` / `MultiEdit` / `NotebookEdit`。reducer 维护 `Map<path, TouchedFile>`，**跨 Run 累积**（同一 thread 多个 Run 共用一份）。

**TouchedFile 结构：**

```ts
interface TouchedFile {
  absolutePath: string;
  relativePath: string;       // 相对 workingDir
  firstTool: 'Read' | 'Write' | 'Edit' | 'MultiEdit' | 'NotebookEdit';
  lastTool: 'Read' | 'Write' | 'Edit' | 'MultiEdit' | 'NotebookEdit';
  firstSeenAt: number;        // ms epoch
  lastTouched: number;        // ms epoch
}
```

**过滤：** 只保留 `path.startsWith(workingDir + "/")` 的项。`workingDir` 从 `useConversation(threadId)` 已能拿到，不需要新字段。

**显示规则：**
- 路径相对 `workingDir`（`src/foo.ts` 而不是 `/Users/.../project/src/foo.ts`）
- Header 显示 `basename(workingDir)`，匹配 Cowork 的 `stuio` 样式
- 列表按 `lastTouched` 倒序（最新动作的文件排最上）

**"new" 角标：** `firstTool === "Write"` 则标 new。Write 覆盖已有文件偶尔会误判，接受这个代价（避免 sidecar 多一次 `fs.stat`）。`firstTool === "Read"` 的文件不打角标，仍列在列表里（让用户看到 agent 都看过哪些文件）。

**类型识别：** 沿用现有 `TYPE_META`（markdown/spreadsheet/presentation/code/image/generic），按扩展名匹配。

**点击：** 沿用现有 `onOpenFile` 回调 → 唤起 `PreviewPane`（`TaskView.tsx` 里已经接好）。

**空状态：** 「agent 还没读写文件」。

**砍掉：** 原 `FilesTab.tsx` 末尾的「Add files to working tree」按钮。**理由：**

- 我们没有 Cowork 那种隔离 working-tree 抽象——agent 直接在 cwd 上动手。
- 用户要给 agent 喂新文件，更自然的位置在 input 框（paperclip 图标 / `@`-mention），而不是这个浏览历史文件的 Tab。
- FilesTab 那个按钮按完，用户视线必须跳回 input 框继续写 message，按钮位置和动作终点错位。

「输入框添加文件」能力**不在本次 spec 范围**，另起一个小 spec。

## Context Tab

**数据源：** 新增 sidecar 路由 `GET /threads/:threadId/context`，返回 SDK runtime 在该线程实际加载的能力。

**返回结构：**

```ts
{
  skills: Array<{
    id: string;          // 'xlsx' / 'pptx' / 'huashu-design'
    name: string;        // 显示名（默认 = id）
    description: string;
    color?: string;      // 可选类别色（fallback：InitialsAvatar hue）
  }>;
  mcpServers: Array<{
    name: string;        // 'filesystem' / 'github' / 'slack'
    description: string;
    connected: boolean;  // SDK 当前连接状态
  }>;
}
```

**Sidecar 实现：**

1. `bridge.ts` 现有 `system.init` 解析只取了 `session_id`。**扩展**该分支同时把 `mcp_servers: { name, status }[]` 和 `tools: string[]`（含 SDK 内置 + MCP 暴露 + skill 暴露）通过新的内部事件（如 `session_init_meta`）传出来。bridge 保持纯转换。
2. 新增 `sidecar/src/services/sessionMetadata.ts`：内存 `Map<threadId, { mcpServers, tools, updatedAt }>`。`provider.ts` 在订阅 SDK 事件流时拦截 `session_init_meta` → 调 `store.upsert(threadId, meta)`。
3. 新增 `sidecar/src/routes/threads.ts`：`GET /:threadId/context` 读 sessionMetadata 返回。线程未启动 → 200 + 空数组。

**Skill 识别策略：** SDK `system.init` 的 `tools` 数组里 skill 暴露的工具名约定前缀（实现时根据 SDK 实际输出确认；fallback：与 provider 配置的 skill 白名单交叉匹配）。

**前端：**

- 新增 `src/lib/agui/react/useThreadContext.ts`：`useQuery(['thread-context', threadId], fetcher, { staleTime: ∞ })`
- 触发刷新：线程切换、Run 启动后 `system.init` 重发（通过 `invalidateQueries`）
- `ContextTab.tsx` UI 完全保留，props 改成 `threadId`，内部用 hook 取 `skills` / `mcpServers`

**空状态分级：**

| 场景 | 显示 |
|---|---|
| 线程未启动（无 system.init） | 「等待 agent 启动…」 |
| 线程已启动、0 skills + 0 MCP | 「未加载任何 skill 或 MCP server。可在『自定义』里配置」+ 跳转链接 |

## 加载与空状态汇总

| 场景 | Process | Files | Context |
|---|---|---|---|
| 线程未启动 | 「等待 agent 制定计划…」 | 「agent 还没读写文件」 | 「等待 agent 启动…」 |
| 已跑，没调过 TodoWrite | 空时间线 + 底部 elapsed 横幅 | — | — |
| 已跑，没碰过 cwd 内文件 | — | 「agent 还没读写文件」 | — |
| 已跑，0 skills/MCP | — | — | 跳转「自定义」链接 |
| 线程切换中（messages 还没回来） | 时间线骨架（3 个 dashed 圆圈） | 文件骨架（3 行灰条） | 不重拉，沿用缓存 |

**Tab 角标：** 不显示数量（Cowork 也没有，保持现状）。

## 实现影响清单

**前端：**

- `src/lib/agui/runtime/reducer.ts` — 扩 reducer：新增 `latestTodos` 提取（TodoWrite tool_use）+ `touchedFiles` 累积（Read/Write/Edit/MultiEdit/NotebookEdit tool_use）
- `src/lib/agui/react/useThreadPlan.ts` *(新建)* — 派生 hook，输出 `{ todos: TodoEntry[] }`
- `src/lib/agui/react/useThreadFiles.ts` *(新建)* — 派生 hook，输出 `{ files: TouchedFile[] }`，包含 cwd 过滤
- `src/lib/agui/react/useThreadContext.ts` *(新建)* — `useQuery` wrapper
- `src/lib/agui/react/useThreadRunMeta.ts` *(新建或扩展)* — 输出 `{ runStartedAt: number | null, status: RunStatus }`
- `src/features/task/TaskRightPanel.tsx` — 删 props 透传，内部三个 Tab 都改成 `threadId` 一参（保留 `onOpenFile`）
- `src/features/task/ProcessTab.tsx` — props 改 `{ threadId }`，去掉 `MockTask` 依赖
- `src/features/task/FilesTab.tsx` — props 改 `{ threadId, onOpenFile }`，删 "Add files" 按钮 + `onAddFiles` prop
- `src/features/task/ContextTab.tsx` — props 改 `{ threadId }`
- `src/features/task/TaskView.tsx` — `<TaskRightPanel onOpenFile={openPreview} />` 加 `threadId={activeTaskId}` prop
- `src/lib/mock/types.ts` / `src/lib/mock/*.ts` — 清理 right-panel 相关 mock：`MockTask.plan`、`MockTask.elapsedSeconds`、`MockFile`、`MockSkill`、`MockMcpServer`（若其他地方不再使用）

**Sidecar：**

- `sidecar/src/agui/provider-claude/bridge.ts` — `system.init` 分支扩展：解析 `mcp_servers` + `tools` 字段并 emit 到 sessionMetadata
- `sidecar/src/services/sessionMetadata.ts` *(新建)* — `class SessionMetadataStore`，方法 `upsert(threadId, meta)` / `get(threadId)`
- `sidecar/src/routes/threads.ts` *(新建)* — `GET /:threadId/context` 路由
- `sidecar/src/server.ts` — 实例化 SessionMetadataStore + 挂载 `threads.ts` 路由 + 将 store 注入 provider

**i18n keys 调整：**

- `task.processTab.*` — 保留现有 key（`plan` / `countOf` / `elapsed` / `status.*`）
- `task.processTab.empty.notStarted` *(新增)* — 「等待 agent 制定计划…」
- `task.filesTab.*` — 删 `addFiles` / 调整 `fileCount`
- `task.filesTab.empty` *(新增)* — 「agent 还没读写文件」
- `task.contextTab.empty.notStarted` *(新增)* — 「等待 agent 启动…」
- `task.contextTab.empty.noCapabilities` *(新增)* — 「未加载任何 skill 或 MCP server」
- `task.contextTab.empty.goToCustomize` *(新增)* — 「前往自定义」

## 范围边界

**本次 spec 范围：** 上面"实现影响清单"列出的所有内容。

**不在本次范围：**

- TaskMessageInput 的 `@`-mention 文件能力（另起小 spec）
- TodoWrite 项下展开工具子调用的两段式视图
- Context Tab 里的「使用过」高亮（先纯静态显示）
- Skill / MCP server 的开关/管理（继续走 Customize 页面）
- Files Tab 的搜索 / 排序 / 分组（按 lastTouched 倒序简单展示即可）
- Tab 标题角标 / 计数

## 风险与决策记录

1. **Skill 识别启发式**：SDK `system.init` 的 `tools` 数组里 skill 暴露的工具名前缀约定**待实现时根据 SDK 实际输出确认**。如果约定不明确，fallback 是与 provider 配置的 skill 白名单交叉匹配。这是设计里唯一的小 unknown。
2. **"new" 角标误判**：Write 覆盖已存在文件会被错标 new。决策：接受。代价 = 给 sidecar 加 `fs.stat` 跟踪不值得。
3. **跨 Run 累积可能让 Files 列表很长**：决策：先不分页/不折叠。如果实际使用中长到不可接受，再做"按 Run 分组"的折叠。
4. **Context 不实时反映 agent mid-run 加载/卸载 skill**：每次 Run 开始时的 `system.init` 触发 invalidate，足够覆盖 99% 场景。Mid-run 动态加载（如果 SDK 支持）暂不处理。
5. **sessionMetadata 是内存态**：sidecar 重启后失效，需要重新发起 Run 才能填充。决策：可接受。用户能看到「等待 agent 启动…」空状态，下一个 Run 触发后自动填充。如果要持久化，可以后续加 SQLite 落盘，但目前 YAGNI。

## Verification（实现后验收）

1. 新开线程，问 agent "列出 ~/Workspace 下的所有项目"，agent 调用 TodoWrite → Process Tab 显示 todos 时间线，状态随 agent 执行更新
2. agent 在线程里 Read/Write 几个文件 → Files Tab 列出，cwd 之外的 ~/.zshrc 不出现
3. agent Write 新建一个文件 → Files Tab 该项有 "new" 角标
4. 点 Files Tab 里某条 → 右侧 PreviewPane 打开
5. 切走线程再切回 → Process / Files Tab 内容从 messages 重建，和切走前一致
6. 重启 sidecar → 重新发 Run → Context Tab 显示 skills + mcp servers
7. 进入一个全新（未启动）线程 → 三个 Tab 都显示对应的"未启动"空状态
8. 进入 agent 没调过 TodoWrite 的短任务线程 → Process Tab 显示「等待…」+ 底部 elapsed 横幅

# 智能体详情页布局重构（Spec-2）设计

**Goal:** 把 `AgentSpaceView` 从单列重构成 Claude.ai Projects 式两栏布局——左 composer + 按 agent 过滤的 Recents；右栏可折叠卡 Instructions / Scheduled / Context(文件夹 + Memory)；标题区 pin + 三点菜单（Edit details / Archive）。并把侧边栏会话菜单「移动到项目」改为「移动到智能体空间」子菜单。

**Architecture:** 复用 AppShell 既有 320px `aside`，把现有 InstructionsCard/AgentFoldersCard/MemoryCard 剥成 body、塞进统一的 `RailSection` 可折叠壳。Pin 复用侧边栏已有的 `PinnedItem` `kind:"project"` 渲染+路由。按 agent 过滤走后端 query 参数。Move-to-agent 复用已支持 `agentWorkspaceId` 的 `PATCH /conversations/:id`。

**Tech Stack:** React 19 + TanStack Query + shadcn(Collapsible/DropdownMenu) 前端；Bun + Hono sidecar。design-tokens 3 层（无硬编码）、反 AI slop、lucide 图标。测试 `bun test`。

---

## 1. 布局 / 数据流（AgentSpaceView）

单列 → `<AppShell main aside>`：
- **main**：`<AgentSpaceHeader>`（名字 + pin + 三点菜单）→ composer（现状不变）→ `<AgentRecents>`（按 agent 过滤的最近会话）
- **aside**：`<AgentRail>` 竖排三张 `RailSection`：Instructions / Scheduled / Context

## 2. 组件（均在 `src/features/agent-workspaces/`，除注明）

- **`RailSection`**（新，共用壳）：`{ title, action?: ReactNode, defaultOpen?: boolean, children }`。渲染 `rounded-2xl border border-border bg-card` 容器 + 头行（标题左；`action`(＋/铅笔) + chevron 右，作 `CollapsibleTrigger`）+ `CollapsibleContent`。基于 shadcn `Collapsible`，chevron 旋转抄 `features/task/ProcessGroup.tsx`。
- **`InstructionsCard` / `AgentFoldersCard` / `MemoryCard`**（改造）：移除各自外层 chrome（`rounded-2xl border bg-card p-4`）+ 标题/描述，只导出 body；标题与动作（铅笔编辑 / ＋）上提到 `RailSection`。Memory 两块内容原样落入 Context → Memory。
- **`ContextCard`**（新）：一个 `RailSection`，`action` = DropdownMenu ＋，本期仅「Choose a folder」（复用 AgentFoldersCard 的 folder picker）。body = "On your computer"（文件夹列表）+ "Memory"（MemoryCard body）。
- **`ScheduledRailCard`**（新）：`RailSection`，`action` = DropdownMenu ＋ → 「Existing tasks」(本 agent 任务列表，点击 `navigate('/scheduled/:id')`) /「Create new task」(开 `NewScheduledModal` 预绑定本 agent)。body = 该 agent 的任务列表 / 空态。
- **`AgentSpaceHeader`**（新）：serif 名字 + pin 按钮 + 三点 `DropdownMenu`（Pin/Unpin、Edit details、Archive）。抄 `SidebarItemContextMenu`/`TaskHeader` 模式。
- **`AgentRecents`**（新，本地轻量）：按 agent 过滤的最近会话行（chat 图标 + 标题 + 预览 + 相对时间），点击 `navigate('/task/:id')`。

## 3. 后端净新增（sidecar）

1. **Pin**：`agent_workspaces` 加 `pinned INTEGER NOT NULL DEFAULT 0`（`ensureColumn` 迁移）；`AgentWorkspace.pinned`、`UpdateAgentWorkspaceInput.pinned`、PATCH `/agents/:id` 校验（boolean）。前端 `agents.ts`：`AgentWorkspace.pinned` + `UpdateAgentWorkspaceArgs.pinned`。
2. **按 agent 过滤**（后端参数，非客户端裁剪 —— recents 全局只取 20 条，客户端裁剪会漏老会话）：
   - `GET /conversations?agentWorkspaceId=` → `ThreadService.list({ agentWorkspaceId })` 过滤。
   - `GET /scheduled?agentWorkspaceId=` → `ScheduledTaskService.list({ agentWorkspaceId })` 过滤。
   - 前端 `listRecents(limit, agentWorkspaceId?)`、`listScheduledTasks(agentWorkspaceId?)` + hooks（query key 带 agentId）。

## 4. Pin 机制 + 侧栏展示（复用现成 infra）

- 切换 → `useUpdateAgentWorkspaceMutation({ pinned })`（失效 agents 列表 + 侧栏 pinned 查询）。
- **Sidebar 展示**：`SidebarContent` 的「Pinned」区**把 pinned 智能体与 pinned 会话并列展示**（参考截图：`jay` = 智能体，`Weekly review` = 会话）。`useAgentWorkspaces()` 客户端过滤 `pinned`，转 `MockPinnedItem{ kind:"project" }`，与现有 pinned conversations(`kind:"task"`) 合并后渲染。
- **点击 pinned 智能体 → 进入该智能体空间详情**（`navigate('/agents/{id}')`）——`PinnedItem` 已有 `kind:"project"` 的点击路由分支，无需改 `PinnedItem`。
- **图标**：pinned 智能体沿用 app 内智能体的图标（与侧栏「智能体」NavItem 的 `Briefcase` 一致），与 `kind:"task"` 会话的圆点区分；若 `PinnedItem` 现用 `Folder`，对齐成统一的智能体图标。

## 5. 「移动到智能体空间」子菜单（侧栏 + 任务页会话菜单）

- 把 `SidebarItemContextMenu` 与 `TaskHeader` 会话菜单里的扁平「Move to project」项换成 `DropdownMenuSub`「移动到智能体空间 / Move to agent space」→ 子菜单列出智能体（`useAgentWorkspaces`），选中 → 移动该会话。
- 抽出共用 `src/shared/MoveToAgentSubmenu.tsx`（`{ conversationId, currentAgentWorkspaceId? }`；内部用 `useAgentWorkspaces` + 新 `useMoveConversationToAgentMutation`），返回一个 `<DropdownMenuSub>`，可嵌入两个 `DropdownMenuContent`。当前所属 agent 标选中态。
- 后端已就绪：`PATCH /conversations/:id { agentWorkspaceId }`（已校验 agent 存在并重解析 home dir）。前端加 `setConversationAgent(id, agentWorkspaceId)` 客户端 + mutation（失效 recents/pinned/threadStatuses + 该会话）。
- i18n：`sidebar.contextMenu.moveToProject` / `task.header.moveToProject` 键改名 `moveToAgentSpace`，值「移动到智能体空间」/「Move to agent space」。
- **不做**：tasks 列表的批量「移动 N 个对话」子菜单（仅按需改文案，行为不动）。

## 6. 我替你定的点（已与你确认）

- **Edit details = 仅改名**（avatar 选择器推迟）：`NewAgentModal` 加 `mode/initial`，编辑态预填 name + PATCH。
- `NewScheduledModal` 加 `presetAgentWorkspaceId`（"Create new task" 预绑定本 agent；其 `NewScheduledFormData` 补 `agentWorkspaceId`）。
- 过滤走**后端参数**；pin 复用 `kind:"project"`（不删该分支）。

## 7. 测试（bun test）

- **sidecar**：agent `pinned` PATCH 往返 + 迁移回填；`ThreadService.list` / `ScheduledTaskService.list` 的 `agentWorkspaceId` 过滤；对应 GET 路由 query 参数；`PATCH /conversations` 设/清 `agentWorkspaceId`（已存在则复测不回归）。
- **前端**：tsc（tsconfig.app.json）+ vite build；现有 sidebar/scheduled 测试不回归。组件交互测试按现有覆盖面补关键路径（move 子菜单选中触发 mutation、RailSection 折叠）。

## 8. 不做（推迟 / Spec-3）

- **Add a link / URL 作上下文** → Spec-3。Context ＋ 本期仅「Choose a folder」。
- avatar 编辑、scheduled 卡内联编辑、批量移动子菜单重写。

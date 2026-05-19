# Agent Studio UI 产品需求说明（PRD）

> 版本：2026-05 · 基于当前 `tauri` 分支静态 UI 与 Cowork 公开行为推断
> 范围：仅描述用户可见行为与意图。**不**约束底层 Agent SDK / sidecar 协议细节。
> 状态：**UI 已 1:1 实现原型稿（`原型稿/Claude Desktop/Showcase 1 - Cowork.html`），后端逻辑尚未接入。**本文档定义"接入后应该做什么"。

---

## 目录

1. [产品总览](#1-产品总览)
2. [信息架构（IA）](#2-信息架构ia)
3. [功能详述（按视图）](#3-功能详述按视图)
   - [3.1 新建任务（New Task）](#31-新建任务new-task)
   - [3.2 任务（Task）](#32-任务task)
   - [3.3 项目（Projects）](#33-项目projects)
   - [3.4 项目详情（Project Detail）](#34-项目详情project-detail)
   - [3.5 计划任务（Scheduled）](#35-计划任务scheduled)
   - [3.6 自定义（Customize）](#36-自定义customize)
   - [3.7 设置（Settings）](#37-设置settings)
   - [3.8 侧边栏（Sidebar）](#38-侧边栏sidebar)
4. [关键 UX 模式](#4-关键-ux-模式)
5. [面向工程的开放问题](#5-面向工程的开放问题)
6. [外部参考](#6-外部参考)

---

## 1. 产品总览

**Agent Studio** 是面向知识工作者的桌面 AI Agent 工作区，参照 Anthropic 的 Claude Cowork 产品形态构建。区别于"一问一答"的聊天工具，它把 Claude 当成一名"在你电脑上做事"的协作者：用户描述一个**目标**（"清理我电脑上不再活跃的项目"），Agent 自己拆解步骤、读写本地文件、调用工具与 MCP 服务器，最终交付可读的成果（Markdown 报告、Excel 工作表、PPT 大纲等）。整个会话被组织为一个**任务**（Task），任务的相关沉淀（指令、文件、记忆、定时调度）可以被聚合到一个**项目**（Project）里作为持久工作区。

Cowork 在 2026 年 4 月转正后，把"Skill → Plugin → Agent → Workspace"的层级显式产品化（参考 Anthropic [Cowork 产品页](https://www.anthropic.com/product/claude-cowork) 与 [帮助中心 Getting started](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)），Agent Studio 的 UI 完整继承了这套层级。

**用户画像**：单机使用、有重复性长链路任务（每日简报、清单整理、报表生成、内容写作）的中高级知识工作者；不要求懂代码，但乐于配置自己的"AI 偏好"和工具集。

**当前实现状态**：
- ✅ 静态 UI：8 个顶级视图、全部 i18n（中/英）、Sidebar/PreviewPane 等交互、设计 token 体系、shadcn + ai-elements 组件齐备。
- ⛔ 业务后端：Tauri shell + Bun sidecar 通道已建立（见 `CLAUDE.md` "Architecture"），但 prompt 提交、定时调度、文件读写、Agent 运行时均使用 mock 数据 / 桩函数。
- ⛔ 持久化：`tauri-plugin-store` 已挂在 Rust 端，但 UI 尚未写入。
- ⛔ MCP / 插件市场：仅显示 mock 列表。

本 PRD 描述当 UI 与真正的 Agent SDK 后端接通后，每个交互**应当**的行为。

---

## 2. 信息架构（IA）

顶级导航由 `src/features/sidebar/SidebarContent.tsx` 定义，对应 8 个视图（`src/app/AppShellContext.tsx` 的 `ViewKey`）：

```
Agent Studio
├── 新建任务 New Task          (sidebar.nav.newTask)        → new-task
├── 项目     Projects          (sidebar.nav.projects)       → projects ─┐
│                                                            project-detail (深入)
├── 计划任务 Scheduled         (sidebar.nav.scheduled)      → scheduled-list ─┐
│                                                            scheduled-detail (深入)
├── 自定义   Customize         (sidebar.nav.customize)      → customize  (Skills / Agents / Plugins)
├── (隐式)   任务 Task                                       → task      (从 New Task 提交或 Sidebar Recents 进入)
└── 设置     Settings          (sidebar.nav.settings via UserPopover)
                                                            → settings  (Profile / Appearance)
```

**横向流转**（`setView` 触发）：

- `NewTaskView` 提交 prompt → `TaskView`（`src/features/new-task/NewTaskView.tsx#L37`）
- `ProjectsView` 卡片点击 → `setActiveProjectId` → `ProjectDetailView`（`src/features/projects/ProjectsView.tsx#L32-35`）
- `ScheduledListView` 卡片点击 → `setActiveScheduledId` → `ScheduledDetailView`
- `TaskHeader` 菜单 "移到项目" → `ProjectDetailView`（`src/features/task/TaskView.tsx#L31`）
- `Sidebar` Recents / Pinned 点击 → `TaskView` 或 `ProjectDetailView`
- `UserBar` → `UserPopover` → "设置" → `SettingsView`
- `Customize` / `Settings` 为**全屏视图**（`FULLSCREEN_VIEWS` in `AppShellContext.tsx`），进入时隐藏 Sidebar，左上角 ChevronLeft 返回上一个非全屏视图（当前桩为 `setView("task")`）。

**应用初始视图**：`AppShellProvider` 默认 `initialView = "task"`（mock fixture），上线后应改为 `"new-task"` 或最近一次任务。

---

## 3. 功能详述（按视图）

### 3.1 新建任务（New Task）

**视图组件**：`src/features/new-task/NewTaskView.tsx` · **i18n**：`newTask.*`

**意图**：作为应用的"零状态首屏"，把用户带入一次新会话。视觉上向 Anthropic 主页/Cowork 看齐——一段欢迎语 + 一个大输入框 + 三个选择 chip——主张"先说目标，配置随后"。

**UI 元素**：

| 元素 | i18n key | 行为意图 |
|---|---|---|
| 欢迎标题 | `newTask.welcome.heading`（"来，把你清单上的事搞定一件"） | 静态展示，可后续替换为按用户名/时段的个性化文案。 |
| Learn more 链接 | `newTask.welcome.learnMore` | 跳转外部安全/使用指引文档（产品自定义）。 |
| Prompt 输入框 | `newTask.input.placeholder` | 多行文本输入；Enter 或点击 `PromptInputSubmit` 提交。 |
| Chip 1 · 项目作用域 | `newTask.input.workInProject`（"在项目中工作"） | 打开 dropdown 选择一个已存在的项目；选中后该任务自动归属此项目并继承其 instructions / memory / computer context。 |
| Chip 2 · 模式选择 | `newTask.input.ask`（"提问"） | 切换 Ask vs. Agent。**Ask**：每个工具调用前必须人工 Approve（"Ask before acting"）。**Agent**：自动执行，仅在文件**永久删除**前请求确认。语义对应 Cowork 文档中的 *Ask before acting* / *Act without asking* 两档（[support.claude.com](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。 |
| Chip 3 · 模型选择 | `newTask.input.legacyModel` | Dropdown 选择 Claude 模型（默认/Legacy/Opus/Sonnet/Haiku）。 |
| 提交 | `PromptInputSubmit` | 创建一个新 Task：1) 生成 task id；2) 把 prompt 作为第一条用户消息；3) 调用 sidecar 启动 Agent run；4) `setView("task")` 切到 TaskView 并显示 streaming 输出。 |

**未决**：项目作用域 chip 与"创建定时任务"模式互斥的视觉提示；模型选择是否随 user/work profile 给默认推荐。

---

### 3.2 任务（Task）

**视图组件**：`src/features/task/TaskView.tsx` + 私有子组件 · **i18n**：`task.*`

**意图**：一个任务 = 一段长上下文的 Agent 对话 + 它持有的计划、文件、上下文。是产品的主操作界面，也是产品 PvP 的核心：让用户看清 Agent 在做什么，并随时干预。

**布局**（三栏，左侧 Sidebar 由 AppShell 提供）：

```
┌───── Sidebar ─────┬──────────── Main ──────────┬───── Right Panel ────┐
│                   │ TaskHeader (标题/菜单)        │ 三段 Tab:               │
│                   │ ─────────────────────────── │ • Process (计划)        │
│                   │ TaskChatStream              │ • Files (工作目录)       │
│                   │  ├ UserMessage              │ • Context (Skills/MCP) │
│                   │  ├ AssistantMessage         │                       │
│                   │  └ ToolCallTimeline         │  ↓ 点击 artifact        │
│                   │ ─────────────────────────── │ PreviewPane (可拖宽)    │
│                   │ TaskMessageInput            │                       │
└───────────────────┴─────────────────────────────┴───────────────────────┘
```

#### 3.2.1 TaskHeader（`src/features/task/TaskHeader.tsx`）

任务标题为一个 dropdown trigger，展开后的菜单项语义（i18n keys 在 `task.header.*`）：

| 菜单项 | 意图 |
|---|---|
| `schedule` "定时运行" | 用当前任务的 prompt 作为模板，打开 `NewScheduledModal` 创建定时任务（Cowork 中对应 `/schedule` 命令，[support.claude.com](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。 |
| `turnIntoSkill` "转为技能" | 把任务过程中沉淀的指令 / 步骤包装成一个可复用 Skill（写入 `~/.claude-studio/skills/<name>/SKILL.md`），随后跳到 Customize → Skills。 |
| `moveToProject` "移到项目" | 子菜单列出所有项目；选中后任务 `projectId` 重写，sidebar 该任务从 Recents 移动到目标项目的 Recents。**冲突解决**详见第 5 节"开放问题"。 |
| `pin` "置顶" | 在 Sidebar Pinned 区出现该任务的快捷入口。 |
| `rename` "重命名" | 原地编辑任务标题；标题既显示在 header，也同步到 Sidebar。 |
| `archive` "归档" | 从 Recents 移除，但保留在数据库可搜索（与 delete 区分）。 |
| `delete` "删除" | destructive 红色样式；二次确认后从存储删除（带 trash bin 30 天保留是合理默认）。 |

右上 `PanelRight` 图标 → `toggleAside`：折叠/展开右侧面板。

#### 3.2.2 TaskChatStream

按消息序列渲染。三类元素：

- **UserMessage**：用户输入气泡。
- **AssistantMessage**：Claude 文本输出 + 末尾 `MessageActions`（`copy` / `thumbsUp` / `thumbsDown`）。
- **ToolCallTimeline**：工具调用链；折叠态显示 "X 步" / `task.timeline.done`，展开后逐步显示 tool name + 输入摘要。Cowork 的"sub-agent / dispatch"也会以同样形态出现（[support.claude.com Plugins/Connectors](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。
- **ArtifactInlineCard**：行内附件卡片，点击触发 `openPreview` → 右侧切换到 `PreviewPane`。

#### 3.2.3 TaskMessageInput

底部多行输入框（`task.input.placeholder`、底栏 chips 与 NewTaskView 相同）；底部小字 disclaimer：`task.input.disclaimer`（"Agent Studio 是 AI，可能会出错。请仔细核对回复。"）。

#### 3.2.4 右侧面板（TaskRightPanel · `task.tabs.*`）

三段 Tab，激活态把对应 tab 拉宽（`flex-[1.6]` vs `flex-1`）：

**Process 标签**（`ProcessTab.tsx` · `task.processTab.*`）

- 标题"计划"+ "{{done}} / {{total}}" 计数。
- 时间线 step 列表（状态：done/active/failed/pending）。Active 步有 pulse halo（brand-100 橙色），done 是 success-100 绿色 check，failed 是 danger-100 红色 X，pending 是虚线圆环。
- 底部状态条：`status.running|done|failed|paused` + `已用 mm:ss` 实时秒表。
- 任务恢复时 elapsed 接续，不重置。

**Files 标签**（`FilesTab.tsx` · `task.filesTab.*`）

- 显示该任务的工作目录树（来自 Cowork 的 sandbox VM，[Cowork 安全说明](https://www.anthropic.com/product/claude-cowork)）。
- 文件按类型着色（xlsx 绿、pptx 橙红、md/code 中性）。新创建/修改的文件加 `新` badge（brand-100 橙）。
- 文件计数 `{{count}} 个文件`；底部虚线按钮 `添加文件到工作目录`（让用户上传/拖入）。
- 点击文件 → `openPreview`，右栏从 TaskRightPanel 切到 `PreviewPane`（同时 main 区域宽度由 Tauri shell 决定收缩）。

**Context 标签**（`ContextTab.tsx` · `task.contextTab.*`）

- 两个分区：`Skills` 和 `MCP servers`。
- Skills：列出本次 run 已加载的 Skill（计数 `已加载 {{count}}`），每个 Skill 一个圆形字母头像（hue 来自 `MockSkill.hue`，分类色）+ 名称（mono 字体）+ 一句描述。
- MCP servers：状态点（success-100 = 已连接，text-400 灰 = 未连接）+ 名称 + 描述；未连接的 server 加 `未开启` 斜体标签。

**意图**：让用户能即时回答"现在 Agent 拥有哪些能力上下文"。这是 Cowork 文档中 "trust & oversight" 原则的可视化表达。

#### 3.2.5 PreviewPane（`src/features/task/PreviewPane.tsx`）

- 左侧拖动条（6px 热区）调整宽度，MIN 360 / MAX 720 / DEFAULT 520。
- 内容按文件类型分发：markdown → 自实现简易渲染；code → `CodeBlock`（ai-elements）；spreadsheet → 表格；presentation → 三张 mock slide；其余 → `未实现` 占位。
- **比例缩放（zoom）而非 reflow**：宽度变化时 `zoom = (paneWidth - padding) / 480`，clamped 0.6 ~ 1.5。这保证表格不会列挤压、PPT 比例正确。
- 顶部 opener 徽标（Markdown/Code → "C"+accent-100 蓝；Office → "W"+brand-100 橙），表示"用此外部应用打开"的入口（mock：`OPENER_BY_TYPE`）。

---

### 3.3 项目（Projects）

**视图组件**：`src/features/projects/ProjectsView.tsx` · **i18n**：`projects.*`

**意图**：项目是任务的**持久工作区**容器，对应 Cowork 的 Projects 概念："每个 Project 是一个本地文件夹，自带 instructions、working files、scheduled tasks、conversation history"（[Anthropic 帮助中心](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。Memory 只在项目内保留，单点 Cowork 会话间不跨越。

**UI 元素**：

- Header：标题 "项目"（`projects.title`）+ 排序按钮 + 搜索按钮 + 主按钮 `新建项目`（`projects.newProject`）。
- 卡片网格：1 / 2 / 3 列响应式（`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`）。每张卡片 = 一个 `ProjectCard`，含项目名、最近活动时间、一段摘要。
- **New project modal**（`projects.modal.*`）：
  - 字段 1：`项目名称`（必填，例："周更博客"）
  - 字段 2：`项目偏好说明`（多行文本，例："保留我的语气，短句，技术细节放在段尾。"）
  - Hint：`Agent Studio 在该项目内的所有对话都会参考这些偏好`。
  - 按钮：`取消` / `创建`。
- 点击卡片 → `setActiveProjectId` → `ProjectDetailView`。

**项目持有的实体**（见 `MockProject` 类型 + `projectDetail.sections.*`）：

| 字段 | 含义 |
|---|---|
| `instructions` | 项目级 system instructions，应用于所有该项目下的任务。 |
| `scheduledTasks: string[]` | 与本项目绑定的定时任务 ID 列表。 |
| `memory: string[]` | Agent 在与你协作时主动记下的偏好/事实条目。Cowork 仅项目内保留。 |
| `computerContext: string[]` | 本机文件夹路径白名单（哪些目录 Agent 可读写）。 |
| `recentConversations` | 最近会话快照（按时间倒序）。 |

---

### 3.4 项目详情（Project Detail）

**视图组件**：`src/features/project-detail/ProjectDetailView.tsx` · **i18n**：`projectDetail.*`

**意图**：把项目当作"半个 Task"——既能像 Task 一样发起会话（顶部 PromptInput），也能像设置页一样配置长期上下文（右侧 cards）。

**Main 区**：

- Header：项目名（font-serif 40px）+ 右上 `pin` / `more` 图标按钮。
- **PromptInput**：placeholder `你想在这个项目里做什么？`。提交后**在此项目作用域下创建新任务**（携带项目 instructions + memory + computer context 作为 system prompt 注入）。
- "近期对话"列表（`projectDetail.recents`）：每行 = 一个会话快照 → 点击进入对应 TaskView。

**Aside 区**（4 张卡片，i18n keys 在 `projectDetail.sections.*`）：

| 卡片 | 内容 | 操作 |
|---|---|---|
| `Instructions` 说明 | 项目级偏好说明（Markdown 文本）。 | `编辑` 按钮，inline 编辑后落盘。 |
| `Scheduled` 定时任务 | 该项目下定时任务的迷你列表（`ScheduledMiniCard`）。 | `添加` → 打开 `NewScheduledModal`，预选项目作用域。 |
| `Memory` 记忆 | Agent 主动累积的事实（"用户偏好早 9 点收到日报"）。 | 可逐条删除/编辑；用户应能"撤销记忆"。 |
| `Computer Context` 本机文件夹 | 项目可访问的本机路径白名单。 | `添加` → 弹出系统目录选择；权限授予走 Tauri capability。 |

空状态：每张卡片有 `empty.*` 文案（"暂无…"）。

---

### 3.5 计划任务（Scheduled）

**视图组件**：`src/features/scheduled/ScheduledListView.tsx` + `ScheduledDetailView.tsx` · **i18n**：`scheduled.*`

**意图**：用户写一次 prompt + 设一个频率，Agent 自动按计划执行。对应 Cowork 的 Scheduled Tasks（[Anthropic 帮助中心](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)、[kentgigger.com](https://kentgigger.com/posts/claude-agents-dispatch-scheduled-tasks-computer-use)）。

#### 3.5.1 列表视图

- Header："计划任务"标题 + subtitle "按计划运行任务，或随时手动触发。在任意已有任务中输入 `/schedule` 即可创建。"（与 Cowork 文档一致）。
- 工具栏：`排序` / `搜索` / 主按钮 `新建任务`。
- **KeepAwakeBanner**（`scheduled.keepAwake.*`）：信息条 "定时任务仅在电脑保持唤醒时运行。" + `保持唤醒` toggle。
  - 行为：开启时调用 Tauri 平台 power API 阻止系统睡眠；关闭则放任系统休眠（用户接受可能跳过任务）。
  - 与 Cowork 的限制一致（"Desktop app must stay open—close the app, kill the session" — [Anthropic 帮助中心](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。
- 卡片网格 + 底部 "更多灵感" 区：两个 chip（`每日简报` / `每周回顾`）点击预填 modal。
- **New scheduled modal**（`scheduled.modal.*`）：
  - `名称*`（如"每日简报"）
  - `描述*`（如"早上汇总今日日程和待办"）
  - Prompt 多行（如"汇总我的日程和未读邮件……"）+ 三个 chip：项目作用域 / Ask vs. Agent / 模型。
  - `频率`：`手动 | 每小时 | 每天 | 工作日 | 每周` Select；非 manual/hourly 时附带 time picker（HH:MM）。
  - Hint：`为了服务器性能，将随机延迟数分钟执行。`（即 cron jitter）
  - 按钮：`取消` / `保存`。

#### 3.5.2 详情视图

- 顶部 `< 返回所有定时任务`。
- 标题 + 工具栏：`编辑` / `删除`（destructive）/ 主按钮 `立即运行`（手动触发一次，不影响周期）。
- 描述段。
- **Switch + 状态徽章**：开关切换 active/inactive；活跃时显示绿色 `运行中`+ 时钟图标，否则灰 `已暂停`。右侧 `下次运行：{{value}}`。
- 三段卡片：
  - `指令`：完整 prompt。
  - `重复`：人类可读频率描述（如 "每天 09:00。" / "工作日 09:00。"）。
  - `始终允许`：会话期间用户曾对某工具/路径授予 "always allow" 的权限项列表。Hint：`你在运行中授予的许可会显示在这里。`
    - 行为：定时任务在 Ask 模式下若每次都要交互将无法自动化；用户可在首次手动 run 时勾选 "Always allow" 把该工具调用加入此列表，之后定时跑就免确认。**这是定时任务和普通任务最大的权限差异。**

---

### 3.6 自定义（Customize）

**视图组件**：`src/features/customize/CustomizeView.tsx`（全屏视图）· **i18n**：`customize.*`

**意图**：把 Cowork 的"Skill / Agent / Plugin"三层产品化对象分别管理。术语完全跟随 Anthropic（[Anthropic Plugins for Cowork](https://claude.com/plugins)、[dev.to 概念图](https://dev.to/sid_telang_78198f3dfddea3/claude-skills-plugins-agent-teams-and-cowork-demystified-4k2m)）。

**布局**：顶部 sticky header（`返回` + "定制"标题）+ 左侧 `CustomizeNav` + 右侧 main 区。

`CustomizeNav` 四档：`home | skills | agents | plugins`。

#### 3.6.1 Home（`customize.home.*`）

入门空状态卡：

- `连接你的应用`（让 Agent Studio 读写工具，跳第三方应用 connectors 流程，TBD）。
- `创建新技能`（→ skills 子页 + "新建"流程）。
- `浏览插件`（→ plugins 子页）。

#### 3.6.2 Skills（`customize.skills.*`）

- 左侧列表分两段：`个人技能`（用户自建）/ `内置技能`（Anthropic 预置）。
- 选中后 main 区显示 Skill 详情：
  - 标题 + Switch `已启用` toggle + `更多` 菜单。
  - 元数据 dl：`添加者: 你` / `触发方式: 手动 + 自动建议`（Cowork 中 Skill 既可通过 `/skill` 显式触发，也可在 Claude 检测到相关上下文时自动启用）。
  - 描述卡 + `工作原理` 列表（自动触发 / 输出标注）。
  - 展开的 personal skill 显示其源码树（SKILL.md / agents/ / assets/ …）—— 用户应能在内置编辑器或外部 IDE 中打开。
- 上线后应支持：新建 Skill（向导生成 SKILL.md）、导入 Skill（.zip）、删除 Skill、跨设备同步。

#### 3.6.3 Agents（`customize.agents.*`）

- 左侧分 `我的 Agent` / `内置 Agent`，每个 Agent 一张卡（emoji 作为分类色 token，非装饰）。
- 详情：
  - 标题 + `编辑` / `更多`。
  - `系统提示词`：完整 system prompt，`编辑` 按钮原地修改。
  - `允许的技能`：该 Agent 可调用的 Skill 子集（白名单）+ `添加技能`。
  - `MCP 服务器`：该 Agent 可访问的 MCP 列表 + `添加服务器`。
  - `允许的项目`：该 Agent 可作用于的项目白名单；默认 `所有项目（无限制）`。
- 语义对应 Cowork 中"sub-agent"或"agent persona"，配置一次后可在 Task 中通过 mode 切换调用（[Cowork power user tips](https://karozieminski.substack.com/p/claude-cowork-guide-plugins-memory-sub-agents-tips)）。

#### 3.6.4 Plugins（`customize.plugins.*`）

- Header："浏览插件" + subtitle "由 Anthropic 和社区伙伴构建的预置知识包。安装即可让 Agent Studio 立刻获得角色级专长。"
- 类别 chips：`全部 / 生产力 / 研究 / 开发 / 沟通 / 设计 / 数据`。
- 卡片网格：`PluginCard` 含图标 / 名称 / 描述 / 作者 / 安装次数 / `安装` 或 `已安装` 按钮（toggle）。
- 安装一个 Plugin = 把它打包的 Skills + Connectors + sub-agents 一次性挂到当前用户配置（对齐 Cowork 文档 "one install gives you everything"，[support.claude.com](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)）。
- 未来需要支持：作者/来源审查、版本升级、卸载清理、按需启用某个 Plugin 的子组件。

---

### 3.7 设置（Settings）

**视图组件**：`src/features/settings/SettingsView.tsx`（全屏视图）· **i18n**：`settings.*`

**布局**：顶部 header `< 返回 / 设置` + 左侧固定 nav（当前仅一档 `通用`）+ 右侧表单（最大宽 2xl）。

#### 3.7.1 Profile（`settings.profile.*`）

| 字段 | 行为 |
|---|---|
| `姓名` | 显示用 |
| `请告诉 Agent Studio 怎么称呼你`（placeholder "Jay"） | 注入到 system prompt（"称呼用户为 Jay"）。 |
| `你的工作是？` | 7 选 Select：`软件工程师 / 设计师 / 产品经理 / 研究员 / 作者 / 运营 / 业务 / 其他`。影响默认推荐的 Skills / Plugins。 |
| `对 Agent Studio 的偏好说明` | 多行文本，注入全局 system prompt（Cowork 用户级 instructions）。Hint：`Agent Studio 会在所有对话和 Cowork 中记住这些偏好（遵守 Anthropic 准则）。` |

#### 3.7.2 Appearance（`settings.appearance.*`）

- `主题`：`跟随系统 / 明亮 / 暗黑` ThemeSegment。落地：`data-mode="light|dark"` on `<html>` + localStorage 持久化（`useThemeMode` hook）。
- `语言`：`中文 / English` LanguageSegment，切换 `react-i18next` 实例 + localStorage。

未来扩展：键盘快捷键自定义、字体缩放、降噪模式（关闭动画）。

---

### 3.8 侧边栏（Sidebar）

**视图组件**：`src/features/sidebar/Sidebar.tsx` + `SidebarContent.tsx` + `SidebarToggle.tsx` · **i18n**：`sidebar.*`

**意图**：始终可见的导航 + 上下文（Pinned / Recents）锚点。Cowork 桌面应用 Sidebar 的等价物。

**布局**（从上到下）：

1. **顶部 icon 行**：折叠/展开按钮（`PanelLeftClose`，`sidebar.toggle.collapse|open`）+ 搜索（`⌘K`，触发 mock 对话框）。
2. **主 Nav**：`新建任务 / 项目 / 计划任务 / 自定义`。Active 态由 currentView 推断（`projects` 与 `project-detail` 共享一个 active）。
3. **Pinned 区**（`sidebar.sections.pinned`）：用户置顶的任务和项目。空时整段不渲染。
4. **Recents 区**（`sidebar.sections.recents`）：scrollable 列表，每行一个 `RecentItem`。
5. **Footer**：`UpdateCard` "重启以更新"（v0.1.0，sidebar.update.title）+ `UserBar`。

#### Item 状态点（`StatusDot`）

每个 Recents 项左侧显示一个 12px 状态点：

| status | 视觉 | 含义 |
|---|---|---|
| `active` (running) | success-100 绿点 + halo pulse | 任务正在执行 |
| `done` | success-100 绿圆 + 白 ✓ | 已完成 |
| `failed` | danger-100 红圆 + 白 ✕ | 失败 |
| `scheduled` | accent-100 蓝时钟图标（无填充） | 该项是定时任务 |
| `pending` | text-400 虚线圆环 | 待执行 / 空闲 |

#### 上下文菜单（`SidebarItemContextMenu` · `sidebar.contextMenu.*`）

hover 时右侧出现 `⋯` 按钮，下拉菜单项：
- `移动到项目`（子菜单列出所有项目）
- `置顶 / 取消置顶`（依 `pinMode`）
- `重命名`
- `归档`
- `删除`（destructive）

每个动作的语义与 TaskHeader 菜单一致；改在这里执行的好处是不必先点开任务。

#### Pin/Unpin 联动

`SidebarContent.tsx` 中：

- `handlePin(recent)`：从 recents 移除该项，向 pinned 添加（kind 推断 "task"）。
- `handleUnpin(item)`：从 pinned 移除，向 recents 顶部插入（任务类型恢复 status: pending）。

#### Collapse 行为（`SidebarToggle.tsx`）

- 折叠时整列消失，主区域左上出现一个 `PanelLeft` 小图标。
- 鼠标移到该图标 → HoverCard 浮出完整 SidebarContent（260px，半透明阴影面板）。
- 点击图标 → 永久展开 sidebar。
- **细节**："armed" 状态防止刚折叠后光标还停在图标上立即弹出 popover——光标必须先离开图标一次才"武装"hover 行为。

#### UserBar / UserPopover

- UserBar 底部行 = 头像 + 邮箱 + 折叠箭头。点击展开 UserPopover（向上、左对齐 240px）。
- 弹窗内容：邮箱（mute）/ 分隔线 / `设置`（带 `⌘,` 键盘提示）/ 分隔线 / `退出登录`。
- `设置` → `setView("settings")`；`退出登录` → 清登录态 + 关闭 sidecar token。

---

## 4. 关键 UX 模式

1. **3-tier 设计 token**（详见 `CLAUDE.md` "Critical conventions #7" 与 `.claude/skills/design-tokens/`）：所有颜色/间距/圆角通过 `primitives → semantic → components → shadcn-alias` 流向 Tailwind。组件代码里禁止 hex / 原始 HSL，唯一例外是 FilesTab 中 xlsx/pptx 分类色（已注明）。
2. **反 AI slop 视觉规则**：单一 brand-100 橙色作为强调；lucide-react inline SVG 作 icon；InitialsAvatar 字母方块代替头像；**禁止**紫色渐变、emoji 装饰 icon、左侧圆角色条、SVG 绘制头像（见 `CLAUDE.md` #8）。这是 code review 的硬性 block 项。
3. **可拖宽 + 比例缩放 Preview**：宽度调整时内容用 CSS `zoom` 等比缩放而非 reflow，保证表格不抖动、PPT 比例正确（`PreviewPane.tsx`）。
4. **Hover-armed latch（Sidebar）**：折叠后第一次 hover 不触发 popover，避免误触发。
5. **Modal 模式**：NewProjectModal 与 NewScheduledModal 共享同一视觉语言（DialogContent + rounded-2xl + 大字段标题 + 必填 `*` 红星 + 主操作右下深底按钮）。新建模态都给出 placeholder 示例而非空字段。
6. **状态点是产品级 motion**：StatusDot 的 active halo 动画 + Process tab step indicator 的 brand-100 pulse 是用户判断"Agent 还在工作"的唯一即时信号。
7. **全屏视图收起 sidebar**：Customize / Settings 进入时 `hideSidebar = true`，让用户聚焦配置而非来回切换。
8. **Right panel 与 Preview 互斥**：右栏只有一个槽位，PreviewPane 出现时 TaskRightPanel 被替换（`previewOpen ? PreviewPane : TaskRightPanel`），并把 aside 切换为 `bareAside` 模式让 PreviewPane 自管理宽度。
9. **active entity id 由 Context 持有**：`activeProjectId` / `activeScheduledId` 在 AppShellContext，让列表→详情跳转不丢上下文（见 AppShellContext.tsx 注释）。
10. **Pinned/Recents 持久于 Provider**：避免 sidebar 折叠/展开切换 SidebarContent 实例时丢失本地状态。

---

## 5. 面向工程的开放问题

以下是当前静态 UI 暗示但未定义、需要在后端接入时决定的事项：

1. **Agent 流式输出协议** — sidecar 现成 SSE 通道（`subscribeSSE` in `lib/sidecar-client.ts`），但**事件格式**未定（Anthropic Messages stream? 自定义？plan step 怎么 push？file write 怎么通知 FilesTab 增量刷新？）。
2. **任务移动到项目的冲突解决** — 当用户把任务 A 从项目 X 移动到项目 Y：A 的 Computer Context 路径白名单是否合并？是否重新走一次项目 Y 的 instructions？历史消息是否需要 replay？
3. **定时任务的成本上限** — Cowork 在 hourly 频率下可能产生显著 token 成本。UI 需要：1）当前月度成本展示；2）单任务 token budget 上限警告；3）超量后的降级策略（pause / 提示）。
4. **Skill 自动触发的可观测性** — `customize.skills.triggerValue` 说明触发方式为"手动+自动建议"，但 UI 没有 surface 出"刚才这一步是因为 Skill X 自动触发"。可以在 ProcessTab step 上加 Skill badge。
5. **MCP server 发现与安装** — ContextTab 列出 MCP servers 但没有"安装新 server"入口。决定：放进 Customize → Plugins（因为 Plugin 包含 Connector），还是单独一档？
6. **Search（⌘K）语义** — 当前是占位 modal。需明确：跨 task body / 跨 project instructions / 跨 file content 的搜索分别是怎样的 latency / 准确度预期？是否需要 embedding 索引？
7. **多设备 / 单用户模型** — Profile / Skills / Projects 是否跨设备同步？Cowork 桌面是单机的，Anthropic Cloud Routines（[2026-04-14 发布](https://intelligenceandpower.substack.com/p/claude-cowork-review-2026-the-agentic)）是云的。Agent Studio 的边界？
8. **Plugin 生命周期** — 安装时是否需要校验签名、二次确认权限？卸载是否清理它创建的 Skills？升级是否自动？
9. **"始终允许" 的撤销路径** — ScheduledDetail "始终允许" 列表能添加，但 UI 上没有 surface 出"如何取消授权"。需要每项右侧 `×`。
10. **Recents 的归档/删除可恢复性** — `archive` 与 `delete` 区分了语义，但 UI 没有"已归档"入口。需要一个 Archive 视图或在 Search 中可见。
11. **遥测 / 错误上报** — failed 状态点显示在 Recents，但用户怎么看到失败的 stack/原因？是否需要 Task 历史 timeline replay？
12. **离线行为** — Cowork 要求联网（[CNBC, 2026-03](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html)）。Agent Studio 离线时 sidecar 仍在跑 / UI 行为如何？至少需要离线状态条 + 任务 queue。
13. **Rename / Archive / Delete 的二次确认** — 当前菜单只标 destructive 颜色。删除项目应当二次确认（带 task 数量警告），归档则不必。需要明确分级。
14. **NewTaskView 提交后任务标题来源** — 当前 mock 直接进入 `inactiveProjectsTask`。真实链路应是 Agent 第一轮回复后从 prompt 自动生成短标题（typical Cowork behavior）。
15. **Computer Context 权限粒度** — 项目可附加多个本机文件夹，但 Agent 跨项目跑时是否能读其他项目 context？默认应严格隔离（Cowork sandbox 隔离的语义）。

---

## 6. 外部参考

- Anthropic 官方：
  - [Cowork 产品页](https://www.anthropic.com/product/claude-cowork)
  - [Cowork: Claude Code power for knowledge work](https://claude.com/product/cowork)
  - [Get started with Claude Cowork（帮助中心）](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
  - [Plugins for Claude Code and Cowork](https://claude.com/plugins)
- 第三方文档与综述：
  - [Claude Cowork Review 2026 — intelligenceandpower](https://intelligenceandpower.substack.com/p/claude-cowork-review-2026-the-agentic)
  - [DataCamp Cowork Tutorial](https://www.datacamp.com/tutorial/claude-cowork-tutorial)
  - [kentgigger — Dispatch / Scheduled Tasks / Computer Use](https://kentgigger.com/posts/claude-agents-dispatch-scheduled-tasks-computer-use)
  - [karozieminski — Cowork Power User Guide（plugins / memory / sub-agents）](https://karozieminski.substack.com/p/claude-cowork-guide-plugins-memory-sub-agents-tips)
  - [dev.to — Claude Skills / Plugins / Agent Teams / Cowork demystified](https://dev.to/sid_telang_78198f3dfddea3/claude-skills-plugins-agent-teams-and-cowork-demystified-4k2m)
  - [findskill.ai — Cowork vs Managed Agents](https://findskill.ai/blog/claude-cowork-guide/)
  - [CNBC, 2026-03-24 — Anthropic computer use launch](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html)
- 项目内文档：
  - 原型稿：`原型稿/Claude Desktop/Showcase 1 - Cowork.html`
  - 视觉与设计 token 规则：`CLAUDE.md` §7-8、`.claude/skills/design-tokens/`
  - 架构 / sidecar 协议：`CLAUDE.md` "Architecture"

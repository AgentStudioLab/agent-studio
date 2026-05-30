# 智能体空间(Agent Workspaces)· 设计文档

> 日期:2026-05-30 · 状态:待评审
> 把侧边栏的「项目」重构为「智能体」,每个智能体是一个持久化空间:自己的家目录、可外挂的外部文件夹、CLAUDE.md 说明、记忆,以及它名下的会话和定时任务。

## 1 · 背景与目标

现状:侧边栏的「项目」**没有任何后端持久化**——没有 `projects` 表,纯前端 mock(`src/lib/mock/projects.ts`)。只有 `conversations.project_id` / `scheduled_tasks.project_id` 两个可空字符串列引用它。详情页右侧的四张卡片(`InstructionsCard` / `ScheduledMiniCard` / `ComputerContextCard` / `MemoryCard`)UI 已存在,但全是 mock、未接后端。运行时的工作目录 `cwd` 按**会话**算(`thread.workingDir`,默认 `~/.agent-studio/workspace`)。

目标:把这个概念升级为「智能体空间」并**第一次为它做真实后端持久化**,赋予每个智能体:

1. 一个自动创建的**家目录**(读写),作为它的工作区。
2. 可**外挂外部文件夹**作为额外上下文,**默认只读**,可逐个授权写。
3. 一个**说明模块**,以真实的 `CLAUDE.md` 形式存在,运行时自动加载。
4. 一套**记忆机制**:智能体运行中可主动存,用户也可手动维护,跨会话生效。
5. 名下的**会话**与**定时任务**;归属某智能体的会话/定时任务,运行时用**该智能体的完整上下文**执行,而非通用工作区。

## 2 · 概念与命名

一个「智能体」= 一个持久化空间,聚合:身份(名字 / 头像)+ 家目录(读写)+ 外挂外部文件夹(默认只读)+ 说明(CLAUDE.md)+ 记忆(DB)+ 它名下的会话 + 它的定时任务。

| 层 | 名称 |
|---|---|
| 代码:目录 / 表名 / 标识 | `agent workspaces` / `agent-workspaces` / `agent_workspaces` |
| 对外文案 | 「智能体」;空间页 header 标题「智能体空间」 |
| 磁盘家目录 | `~/.agent-studio/agent-workspaces/<id>/` |
| 路由 | `/agents`、`/agents/:id` |
| 外键列 | `agent_workspace_id`(替换旧 `project_id`) |

通用 / 默认智能体:`agent_workspace_id = null` 的会话/定时任务,走默认工作区(即现在「新建任务」的行为),无任何智能体上下文。

## 3 · 范围与非目标

**范围**(分三期,见 §13):重命名;`agent_workspaces` 实体持久化;家目录;外挂文件夹 + 读写权限;CLAUDE.md 说明;DB 记忆 + `remember` 工具;会话/定时任务归属与运行时上下文继承。

**非目标**(本轮不做):团队共享 / 云同步(Cowork 也没有);记忆的向量检索 / 语义召回(只做线性条目);跨机器同步;数据迁移兼容(见 §4,DB 可清空重建)。

## 4 · 数据模型

新增三张表 + 改两列。**不保留旧数据、不做兼容**——DB 可清空重建。

### 4.1 新表

```sql
-- 智能体本体
CREATE TABLE agent_workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT,                       -- 复用 InitialsAvatar 的色相/缩写约定
  home_dir    TEXT NOT NULL,              -- ~/.agent-studio/agent-workspaces/<id>/
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 外挂外部文件夹(默认只读)
CREATE TABLE agent_folders (
  id                 TEXT PRIMARY KEY,
  agent_workspace_id TEXT NOT NULL,       -- FK → agent_workspaces.id
  path               TEXT NOT NULL,       -- 绝对路径
  folder_name        TEXT NOT NULL,       -- 展示名
  writable           INTEGER NOT NULL DEFAULT 0,   -- 0=只读, 1=可写
  created_at         INTEGER NOT NULL
);

-- 记忆条目
CREATE TABLE agent_memories (
  id                 TEXT PRIMARY KEY,
  agent_workspace_id TEXT NOT NULL,       -- FK → agent_workspaces.id
  content            TEXT NOT NULL,
  source             TEXT NOT NULL,       -- 'agent' (remember 工具写) | 'user' (手动)
  created_at         INTEGER NOT NULL
);
```

**说明不进表**:作为家目录下的真实文件 `<home_dir>/CLAUDE.md`(见 §6)。

### 4.2 改列

- `conversations.project_id` → **`agent_workspace_id`**(可空,FK)。
- `scheduled_tasks.project_id` → **`agent_workspace_id`**(可空,FK)。

直接改名替换,不保留旧列。删智能体时(见 §15 删除语义):名下**会话归档**(`conversations.archived=1`),**定时任务解绑**(`agent_workspace_id` 置 null、任务保留),**家目录磁盘文件不删**。

## 5 · 工作空间与文件夹 + 沙箱

### 5.1 家目录

创建智能体时在 `~/.agent-studio/agent-workspaces/<id>/` 自动建目录,记入 `home_dir`,读写。CLAUDE.md / 任何产物默认落在这里。

### 5.2 外挂文件夹

`agent_folders` 一行一个;默认 `writable=0`(只读);每个文件夹一个「允许写」开关。

### 5.3 沙箱(读写真实拦截)—— 沿用现有两层模型

**关键:SDK 的 OS 级沙箱本就启用**(`provider.ts:356-367`),当前 `filesystem.allowWrite: [ctx.cwd]`,读由 `canUseTool` 里的 `checkWorkspaceSandbox`(`sandbox.ts`,UX 层)限制在 `ctx.cwd`。本设计**扩展、不替换**这两层:

- **写(OS 强制)**:`sandbox.filesystem.allowWrite = [家, …writable=1 的外挂]`。越权写被内核级拦截。
- **读(canUseTool 策略层)**:把 `checkWorkspaceSandbox` 从单 root 改成**多 root 感知**——允许读 `[家, …全部外挂]`,其余拒并给友好报错。沿用现有「读不弹审批、只静默拒」的姿态。
- **写外挂时叠 HITL**:写操作本就全部过 `canUseTool` HITL(`provider.ts:373-384` 的 `permissions.ask` 含 `Write/Edit/...`),写到外挂(可写)文件夹时用户会看到审批卡。

`additionalDirectories`:运行时设为 `[家, …全部外挂]`,让模型知道这些目录可访问(`provider.ts` options 新增字段)。

## 6 · 说明模块 = 真实 CLAUDE.md

- `InstructionsCard` 编辑的是 `<home_dir>/CLAUDE.md`(读 / 写文件,不是 DB 字段)。
- Provider 新增 `settingSources: ["project"]`(现在**未设**),配合已有的 `systemPrompt: { type:"preset", preset:"claude_code" }`(`provider.ts:311-319`),SDK 在 `cwd=家` 时**自动加载** CLAUDE.md 作为项目指令。这就是「充当 claude md 的能力」。
- `settingSources:["project"]` 可全局常开:未绑定智能体的会话 `cwd=默认工作区`,无 CLAUDE.md,无副作用。
- **注意**:`"project"` 源同时会读 `<cwd>/.claude/settings.json`。家目录由我们创建、其下无该文件,无影响;但需在文档/代码注释中标明,避免日后误放配置被吃进权限。

## 7 · 记忆 = DB + remember MCP 工具

### 7.1 写入路径

1. **智能体自己存**:扩展现有 in-process MCP 服务 `agent_studio`(`scheduled-tool.ts`,`SCHEDULED_MCP_SERVER="agent_studio"`),**新增第二个工具** `remember`(FQN `mcp__agent_studio__remember`)。照 `buildScheduledMcpServer` 的形态,新建 `buildRememberTool({ agentWorkspaceId, onRemember })`,per-run 构建以捕获当前绑定的智能体;持久化经 host 回调 `onRemember`(在 `server.ts` 接到 `AgentMemoryService`,镜像现有 `onCreateScheduledTask` 的 DI 方式)。`source='agent'`。
2. **用户手动维护**:`MemoryCard` 增 / 删 / 改条目,`source='user'`。

工具仅在**会话绑定了智能体**时暴露,且 FQN 要追加进 `allowedTools`(照 `provider.ts:158` 对 `SCHEDULED_TOOL_FQN` 的做法)。

### 7.2 注入路径

每次运行把该智能体的 `agent_memories` 拼成一段文本,**经现有 `resolveAppendPrompt → systemPrompt.append` 缝注入**(`provider.ts:76/311-319`)。当前 append 装的是用户 profile(callMe / work / instructions);把绑定智能体的记忆块组合进去(由 runWorker 按 `agent_workspace_id` 解析后合并,见 §10)。

**缓存注记**:记忆变化会冲 prompt cache。本轮可接受;后续若需要,用 SDK 的 `systemPrompt.excludeDynamicSections` 优化(非阻塞,记为 backlog)。

## 8 · 会话归属语义

- **新建任务**默认 `agent_workspace_id = null`(不进任何空间,通用工作区)。
- 用户可把某个对话**移入**某智能体空间 → 设上 `agent_workspace_id`。**下次运行**起用该空间的家 / 文件夹 / CLAUDE.md / 记忆(因 cwd 与上下文在 runWorker 按运行解析,移动只改 FK)。
- 在智能体空间详情里**发起**的对话,创建时即绑定该智能体。
- 移动只改 FK、不迁移历史消息;已存在的 SDK session 在下次运行以新 cwd 续接(`getResumeSessionId(threadId, cwd)` 按 thread+cwd 取,cwd 变了相当于该 thread 在新 cwd 起新 session——可接受;若要严格,移动后清该 thread 的 resume 标记,记为实现细节)。

## 9 · 定时任务归属语义(用该智能体执行)

- 定时任务带 `agent_workspace_id`(可空,空=通用)。
- scheduler 触发时生成的线程带上这个 `agent_workspace_id`;runWorker 据此组装**该智能体的完整上下文**(家 cwd / 外挂 / CLAUDE.md / 记忆 / `remember` 工具)→ 即「用这个智能体去执行」。
- **现有缝几乎现成**(`scheduler.ts:19,90-101`):已有 `resolveProjectCwd?: (projectId)=>string|null` 和「建线程带 `{projectId, workingDir, scheduledTaskId}` → `runWorker`」。改造:`projectId`→`agentWorkspaceId`,`resolveProjectCwd`→`resolveAgentHome(agentWorkspaceId)`(返回家目录)。
- **UX**:智能体空间的 `ScheduledMiniCard` 列出该智能体名下的定时任务;Scheduled 列表 / 详情提供「移入 / 移出智能体空间」动作(set / clear `agent_workspace_id`),下次运行即生效。

## 10 · 运行时集成(单一执行路径)

**核心不变量(沿用 CLAUDE.md invariant #10):智能体上下文一律由 runWorker 按线程的 `agent_workspace_id` 解析。** 交互式 `POST /runs`、regenerate、scheduler tick 全走 `runWorker`(`scheduler.ts:117` 已如此),因此三者自动一致,无需为 scheduler 单写逻辑。

runWorker(`runWorker.ts:165` 现为 `const cwd = thread.workingDir;`)改为:

1. 若 `thread.agent_workspace_id` 存在 → 解析该智能体:
   - `cwd` = 家目录(`home_dir`)。
   - 外挂文件夹 → 计算 `additionalReadDirs`=[家+全部外挂]、`additionalWriteDirs`=[家+writable 外挂]。
   - 记忆 → 组合进 systemPrompt append。
   - 暴露 `remember` 工具(并入 allowedTools)。
2. 否则 → 现状(默认工作区,无上述上下文)。

把上述新增项经 **RunContext**(cwd 本就在 RunContext 上;新增 `additionalReadDirs` / `additionalWriteDirs` / 记忆 append 片段 / `exposeRememberTool` 标记)传给 `provider.runTurn`。Provider 据此填:`options.cwd`、`options.additionalDirectories`、`options.sandbox.filesystem.allowWrite`、`checkWorkspaceSandbox` 的多 root 列表、`systemPrompt.append`、`mcpServers.agent_studio`(含 remember)、`allowedTools`。`settingSources:["project"]` 全局常开。

`server.ts` 的 DI:新增 `AgentWorkspaceService` / `AgentFolderService` / `AgentMemoryService`;把 `onRemember`、`resolveAgentHome` 等回调接上(镜像现有 `onCreateScheduledTask` / `resolveProjectCwd` 的接法)。

## 11 · 前端改动

- feature 目录:`features/projects/` + `features/project-detail/` → **`features/agent-workspaces/`**(`AgentsView` 列表 + `AgentSpaceView` 详情 + 复用现有四张卡片)。遵守 feature-folder + 直接 import、无 barrel 约定。
- 列表页与详情页 header 用大号 serif 标题(与 ScheduledListView / SkillsView 一致):列表「智能体」,详情显示智能体名;详情副标题可放说明摘要。
- 侧边栏:label 改「智能体」,**图标不变(保留 `Briefcase`)**,route `/agents`。
- 四张卡片接真实后端:
  - `InstructionsCard` ↔ `<home>/CLAUDE.md` 文件读写。
  - `ComputerContextCard` ↔ `agent_folders`(增 / 删 + 可写开关 + 选目录)。
  - `MemoryCard` ↔ `agent_memories`(增 / 删 / 改)。
  - `ScheduledMiniCard` ↔ 该智能体名下 `scheduled_tasks`。
- 数据接入:照现有 `src/lib/agui/react/use*` 钩子风格新增 `useAgents` / `useAgentFolders` / `useAgentMemories`,走 `fetchSidecar`。
- 样式一律走 3-tier design tokens(见 design-tokens skill);禁硬编码色值;反 AI slop(无紫渐变 / 无 emoji 图标 / 无圆角左色条)。

## 12 · i18n

- 新增 / 重命名命名空间:`projects` / `projectDetail` → `agents` / `agentSpace`(zh + en),在 `src/i18n/locales/{zh,en}/index.ts` 注册。
- 文案对外用「智能体」「智能体空间」;代码标识保持 `agent workspaces`。

## 13 · 分期实现

| 期 | 内容 | 可验证产出 |
|---|---|---|
| **P1 地基** | 重命名(目录 / 文案 / i18n / 路由 / 导航);`agent_workspaces` 表 + `AgentWorkspaceService` + routes;创建时自动建家目录;`conversations` / `scheduled_tasks` 列改 `agent_workspace_id`;runWorker 按绑定解析 `cwd=家`(交互式与 scheduler 共用);`scheduler` 的 `resolveProjectCwd`→`resolveAgentHome`。`settingSources:["project"]` 全局开。 | 能建智能体、进空间、在家目录里跑;移动会话 / 任务进空间后下次运行 cwd=家。其余卡片暂 mock / 隐藏。 |
| **P2 文件夹** | `agent_folders` 表 + service + routes;`ComputerContextCard` 增删 + 可写开关 + 选目录;runWorker 计算 read/write 目录;provider 填 `additionalDirectories` + `sandbox.filesystem.allowWrite`;`checkWorkspaceSandbox` 多 root 化;写外挂 HITL。 | 挂只读 / 可写文件夹;越权写被内核级拦;读越权被静默拒。 |
| **P3 说明 + 记忆** | `InstructionsCard` ↔ `<home>/CLAUDE.md` 文件读写;`agent_memories` 表 + `AgentMemoryService` + routes;`agent_studio` MCP 服务加 `remember` 工具 + `onRemember` DI + allowedTools;runWorker 组合记忆进 `systemPrompt.append`;`MemoryCard` CRUD。 | CLAUDE.md 自动加载生效;记忆自动攒 + 手动改 + 跨会话生效;定时任务自动继承全部上下文。 |

每期独立可发布、独立可验证。因全部能力从「按 `agent_workspace_id` 解析上下文」这一入口流出,定时任务在每期自动一并继承新增能力。

## 14 · 测试(Bun runner,非 vitest)

- 服务层:`AgentWorkspaceService` / `AgentFolderService` / `AgentMemoryService` CRUD(`sidecar`,`bun test`)。
- 路由层:agents / folders / memories 路由;归属移动(set / clear `agent_workspace_id`)。
- 沙箱:`checkWorkspaceSandbox` 多 root 读放行 / 越权拒;`allowWrite` 仅含家 + writable 外挂。
- runWorker 集成:绑定 → cwd=家 + additionalDirectories + append + remember 暴露;未绑定 → 现状。
- scheduler:带 `agent_workspace_id` 的任务触发 → 线程带该 id → runWorker 解析家 cwd。
- 前端:`features/agent-workspaces/` 组件渲染 + 钩子(`bun test`,`*.test.tsx` import `bun:test`)。
- 删除语义:删智能体 → 名下会话归档(`archived=1`)、定时任务解绑(`agent_workspace_id=null`、任务保留)、家目录磁盘文件保留。
- 回归:`bunx tsc --noEmit -p tsconfig.app.json` 干净(忽略既有 `SkillCard.stories.tsx` 的 sourcePath 报错);`bunx vite build` exit 0;`cd sidecar && bunx tsc --noEmit` 干净。

## 15 · 已定默认 / 风险 / 待澄清

**已定默认**
- 会话 / 定时任务归属**可空**(空=通用工作区)。
- 外挂文件夹**默认只读**,逐个授权写。
- 旧 `project_id` 直接改名 `agent_workspace_id`,不兼容旧数据(DB 可清空)。
- 侧边栏图标不变(`Briefcase`)。
- 记忆为线性条目,无语义检索。
- 删智能体:名下**会话归档**(`archived=1`)、**定时任务解绑**(`agent_workspace_id=null`、任务保留)、**家目录磁盘文件保留**(仅解除引用,不删盘)。

**风险 / 注记**
- `settingSources:["project"]` 会读 `<cwd>/.claude/settings.json` —— 家目录下不放该文件,代码注释标明。
- 记忆注入冲 prompt cache —— 可接受,backlog 用 `excludeDynamicSections` 优化。
- 移动已有会话改变 cwd → 该 thread 在新 cwd 起新 SDK session(`getResumeSessionId` 按 thread+cwd)。可接受;严格则移动时清 resume 标记。
- SDK 无原生 memory 工具(2026-05 快照);本设计用「文件工具不涉,自建 DB + MCP `remember`」绕开,符合 Cowork 的文件式记忆精神但更结构化、更可靠。

**全部开放点已闭环,无待澄清项。**

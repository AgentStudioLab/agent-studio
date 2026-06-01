# 智能体文件式记忆设计（单 MEMORY.md 索引 + 场景文件）

**日期**：2026-06-01
**状态**：设计已定，待实施
**取代**：`2026-06-01-agent-long-term-memory-design.md`（Spec-1，行模型 + profile/facts 两 block）的存储层。

## 1. 动机

Spec-1 把记忆存成 `agent_memories` 表的行，分 `profile`/`facts` 两 block，运行时把**全部**行注入 `systemPrompt.append`。实跑下来三个问题：

1. **不透明**：用户看不到、也信不过一张 DB 表里的记忆。
2. **不可扩展**：全量注入，条数一多就撑爆 append。
3. **平行栈**：DB 表 + CRUD 路由 + 专用 MemoryCard，和我们已有的「文件夹文件树 + PreviewPane + 沙箱」是两套东西。

改成**文件式**——把记忆变成 agent 家目录里的 markdown 文件，用一个 `MEMORY.md` 当索引。这正是 Claude Code / Hermes / 用户自己那套全局记忆机制的模式：索引常驻上下文、正文按需读取（非 RAG 的选择性召回）。最关键的是：本仓库 `<home>/CLAUDE.md` 早就是「文件存家目录 → 运行时读出 → 注入 append」的活样板，记忆只是再加几个同款文件，**复用而非新建**。

## 2. 核心决策（已与用户对齐）

| 决策 | 选择 |
|---|---|
| 存储 | 文件，存在 `<home>/memory/` |
| 结构 | **单一索引 `MEMORY.md` + 每场景一个 `<slug>.md`**；**不再分 profile/facts** |
| 写入路径 | 保留 `remember` MCP 工具（改成写文件），不弹 HITL |
| 「写已有 vs 建新文件」 | agent 决定（索引在它上下文里）；工具执行并保证索引同步 |
| 注入 | **只常驻注入 `MEMORY.md` 索引**；场景文件正文由 agent 按需 `Read` |
| 用户可编辑性 | 记忆文件**全程只读**（仅预览）；用户唯一可编辑的是**说明**（`CLAUDE.md`，走现有 InstructionsCard，**本设计不动**） |
| 迁移 | 预发布阶段直接清掉 `agent_memories` 表与相关 CRUD，**不做数据迁移** |

## 3. 存储模型

```
<home>/
  CLAUDE.md            # 说明（用户可编辑，不变）
  memory/
    MEMORY.md          # 唯一索引。每条场景记忆一行：
                       #   - [标题](slug.md) — 一句话钩子
    <slug>.md          # 每个场景一个文件，纯 markdown 正文
```

- **没有** profile/facts 之分。「用户是谁」只是众多场景之一（如 `user-profile.md`），与其它场景文件平级、一样被索引。
- `<slug>.md` 正文为**纯 markdown**，不强加 frontmatter（召回靠索引行的钩子，足够）。
- 智能体创建时（`AgentWorkspaceService.create`）顺手 `mkdir <home>/memory/` 并写一个带表头注释的空 `MEMORY.md`，保证 SDK 首个工具不会 ENOENT、且索引文件恒存在。

## 4. 注入（runWorker → systemPrompt.append）

- **常驻注入**（每个 agent-bound run）：`CLAUDE.md`（说明，不变）+ `memory/MEMORY.md`（索引，逐字）。
- **不注入**场景文件正文。agent 看索引钩子判断相关后，用 `Read` 取 `<home>/memory/<slug>.md`（该路径在 cwd / 沙箱内，无需额外授权）。
- **预算**：只需约束索引（始终在上下文）。沿用「soft/warn/hard」三档思路，作用于 `MEMORY.md` 字符数：
  - 达到 `warn`：在注入的索引尾部追加一句 nudge，提示 agent 合并/淘汰旧条目。
  - 超过 `hard`：host 兜底——按索引中**最旧**条目顺序删除其索引行 + 对应 `<slug>.md`，直到回落到 `soft`。
  - 场景文件正文不做硬预算（不进常驻上下文）；工具描述里提示 agent 保持单文件简洁。
  - 单一索引预算建议初值：`{ soft: 2000, warn: 1600, hard: 2800 }`（字符；纯代理 token，无 tokenizer）。实施时定为常量 `MEMORY_INDEX_BUDGET`。

## 5. `remember` 工具（重写）

去掉 `block`。工具语义从「编辑行」变为「编辑场景文件 + 维护索引」。agent 调用前**已在上下文里看到索引**，由它决定写入哪个 `slug`（复用已有 slug = 写进已有文件；新 slug = 建新文件）——这就是用户要的「先看一下是否在已有文件写入还是创建新文件」。

工具形态（参数名实施时可微调）：

- `action: "save"`
  - `file: string` — 场景文件 slug（kebab-case，不含 `.md`）。
  - `title: string` — 索引链接显示标题。
  - `hook: string` — 索引行的一句话钩子（召回靠它）。
  - `content: string` — 该场景文件的完整正文。
  - 行为：写 `memory/<file>.md = content`；**upsert** `MEMORY.md` 中该文件的索引行 `- [title](file.md) — hook`（已存在则更新标题/钩子，不存在则追加）。
  - 「往已有文件追加」由 agent 负责：先 `Read` 该文件 → 合并 → 用同一 `file` 整体回写（与 Claude Code 的 Read-modify-Write 一致）。
- `action: "remove"`
  - `file: string`
  - 行为：删 `memory/<file>.md` + 删 `MEMORY.md` 中对应索引行。

工具描述需引导：先查上下文里的记忆索引；要补充已有场景就 `Read` 那个文件后合并回写；新场景才用新 `slug`。`save`/`remove` 都不可逆地落盘但**非破坏性**（`destructiveHint:false`），经 in-process MCP 工具直通、**不触发审批卡**。

`validateMemoryEditArgs` / `resultToText` 的纯函数 + 测试模式保留，改成新参数。

## 6. 并发

同一 agent 可能交互 run 与 scheduler run 并发写同一 `memory/`。需要：

- **按 agentId 的进程内串行锁**：`Map<agentId, Promise>` 链式 await，包住每次 `save`/`remove`（索引读-改-写 + 文件写必须原子成对）。
- **原子写**：写临时文件再 `rename`，避免半写。

## 7. 后端改动清单

**新增**
- `sidecar/src/services/agentMemoryStore.ts`（替代 `agentMemories.ts`）：构造接收 home 解析（或注入 `AgentWorkspaceService`）。方法：
  - `indexText(agentId): string`（读 `MEMORY.md`，供注入）
  - `save(agentId, {file, title, hook, content})`
  - `remove(agentId, file)`
  - `tree(agentId): TreeNode[]`（复用 `lib/fileTree.walkTree` 扫 `memory/`）
  - 内含串行锁 + 原子写。
- `GET /agents/:id/memory/tree`：沙箱限定 `<home>/memory`，`walkTree` 返回树（仿 `agentFolders.ts` 的 `/folders/:id/tree`）。

**重写**
- `remember-tool.ts`：见 §5。
- `server.ts` `onRemember`：dispatch 到 `agentMemoryStore.save`/`remove`。
- `runWorker.ts`：`buildAgentAppendContext(claudeMd, memoryIndex)` —— 注入 CLAUDE.md + `MEMORY.md` 索引（删 profile/facts 两段逻辑、删 block 列表读取与 `trimBlockToBudget` 两 block 循环，改为单索引 budget 兜底）。

**删除**
- `services/agentMemories.ts`、`routes/agentMemories.ts`（整个 CRUD）、`server.ts` 中 `buildAgentMemoryRoutes` 挂载。
- `db.ts`：移除 `agent_memories` 建表 + `idx_agent_memories_agent` + `ensureColumn(..., "block", ...)`（预发布，直接删表，无迁移）。

**预览复用**
- 文件预览继续走现有 `/files/content`（cwd 沙箱）：`workingDir = <home>/memory`，`file = <home>/memory/<slug>.md`。无需新预览端点。

## 8. 前端改动清单

**删除**
- `features/agent-workspaces/MemoryCard.tsx`（block UI + AddMemoryModal）。
- `lib/data/agent-memories.ts`、`lib/data/agent-memory-queries.ts`（CRUD client + hooks）。
- `types.ts` 的 `MemoryBlock` / `AgentMemory`（行模型类型）。

**新增 / 改**
- `features/agent-workspaces/MemoryFilesCard.tsx`：用已有 `FileTree` 渲染 `memory/` 文件树（**只读**）。点文件 → `onOpenFile(file, workingDir=<home>/memory)` → 复用 PreviewPane。无任何添加/编辑/删除 UI。
- `lib/data/agent-memory-tree.ts` + `agent-memory-tree-queries.ts`：`useAgentMemoryTree(agentId)` 打 `GET /agents/:id/memory/tree`（仿 `agent-folder-queries`）。
- `ContextCard.tsx`：把原 `<MemoryCard>` 换成 `<MemoryFilesCard>`，沿用现有 `onOpenFile` 透传到 AgentSpaceView 的 PreviewPane overlay。
- **PreviewPane 保持只读**（记忆文件不提供保存）。说明（InstructionsCard）编辑不变。

**i18n**
- `agentSpace.json` 的 `memory.*`：删 `blockProfile/blockFacts/add/addTitle/addPlaceholder/edit/cancel/remove/emptyHint`；保留/新增 `memory.title`、`memory.empty`（空文件夹提示）。zh + en 同步。

## 9. 测试（bun:test）

- `agentMemoryStore.test.ts`：
  - `save` 新 slug → 建 `<slug>.md` + 索引追加一行。
  - `save` 已有 slug → 覆盖正文 + 索引行 upsert（不重复）。
  - `remove` → 删文件 + 删索引行。
  - 并发两次 `save` 串行不互相覆盖（锁）。
  - `indexText` 读出 `MEMORY.md` 内容。
- `remember-tool.test.ts`：新参数的 `validateMemoryEditArgs` / `resultToText`。
- `runWorker` 注入：`buildAgentAppendContext` 输出含 CLAUDE.md + 索引，缺文件时优雅降级。
- `routes`：`GET /agents/:id/memory/tree` 返回树、跨 agent 404、噪声目录过滤（仿 `agentFolders.test.ts`）。
- 旧 `agentMemories.test.ts` / `agentMemories` 路由测试随删除一并移除。

## 10. 不在范围内（YAGNI）

- 用户在 UI 内手动编辑记忆文件（明确不允许）。
- 场景文件的 frontmatter / type 分类 / `[[wikilink]]`。
- 任何向量检索 / 嵌入（非 RAG 是硬约束）。
- 数据迁移（预发布，清表即可）。

## 11. 复用 vs 重写小结

- **留**：`remember` 工具对外存在性 + 无 HITL、append 注入链路、`lib/fileTree.walkTree`、`FileTree` 组件、PreviewPane、`/files/content` 沙箱、InstructionsCard（说明）。
- **改/删**：存储层（表→文件）、记忆服务（行 ops→文件 ops + 索引）、注入读取源（行→索引）、Memory 前端卡（block UI→只读文件树）。

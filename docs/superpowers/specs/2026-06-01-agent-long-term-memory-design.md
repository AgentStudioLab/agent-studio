# 智能体长期记忆（分块自编辑）设计

**Goal:** 把现有 `agent_memories`（add-only、平铺、全量注入）升级为非-RAG 的**分块自编辑记忆**：拆「用户画像 / 事实约定」两块，每块有字符预算，`remember` 工具支持 add/replace/remove，超阈值由 agent 自整理、host 硬上限兜底。

**Architecture:** 沿用现有"行模型 + run 启动时注入 `systemPrompt.append`"。`agent_memories` 加 `block` 列区分两块；`remember` MCP 工具扩成三动作（按子串定位 agent 行）；注入分两段并带用量标注与 ≥80% 整理引导；run 启动时若某块超硬上限则确定性丢弃最老的 agent 行兜底。短期记忆顺着 Claude Agent SDK 的 compaction 走，本设计不做。

**Tech Stack:** Bun + Hono sidecar（bun:sqlite）、`@anthropic-ai/claude-agent-sdk`(in-process MCP `tool()`)、React 19 + TanStack Query 前端。测试用 `bun test`。

**参考：** Hermes（MEMORY.md/USER.md + 单 `memory` 工具 add/replace/remove + 80% 整理 + 冻结快照）、Letta/MemGPT core memory blocks。**约束：no-RAG / 无向量；不引入 `settingSources`（安全）。**

---

## 1. 数据模型

`agent_memories` 加一列（行模型不变）：

```sql
block TEXT NOT NULL DEFAULT 'facts' CHECK (block IN ('profile','facts'))
```

- `profile`（用户画像）= 关于用户的偏好/身份/沟通习惯（≈ Hermes USER.md）
- `facts`（事实约定）= 关于项目/工作的事实、约定、踩坑（≈ Hermes MEMORY.md）
- 迁移：`ensureColumn` 加列、默认 `'facts'`，存量行自动归入 facts。`source`（`agent`|`user`）保留不变。
- `CLAUDE.md`（InstructionsCard）角色不变，仍是**人手写的说明**，与 agent 自管记忆物理隔离。

## 2. 预算（字符数 — sidecar 无 tokenizer，用 char 作 token 代理）

| 块 | 软预算 soft | 提示阈值 warn (80%) | 硬上限 hard (120%) |
|---|---|---|---|
| `profile` | 1500 | 1200 | 1800 |
| `facts` | 2500 | 2000 | 3000 |

命名常量集中在一处（`MEMORY_BUDGETS`），便于调整。块字符数 = 该块所有行 `content` 长度之和（不含 bullet 前缀）。

## 3. `remember` 工具协议（扩展，FQN 不变 → 不动 `allowedTools`）

```
remember(action: "add" | "replace" | "remove",
         block:  "profile" | "facts",
         content?: string,   // add: 新记忆；replace: 替换文本
         match?:   string)   // replace/remove: 定位已有 agent 行的子串
```

- **add**：在 `block` 写一条新记忆（`source='agent'`）。
- **replace**：在 `block` 内按 `match` 子串（大小写不敏感）定位**已有 `source='agent'` 行**，替换 `content`。
- **remove**：按 `match` 子串删除**已有 `source='agent'` 行**。
- **铁律：replace/remove 只作用于 `source='agent'` 行**；`source='user'` 行对 agent 只读。
- 匹配结果 → 工具返回给模型的文本（让模型自我纠正）：
  - 命中 1 条 → 执行，返回 `ok` 文案。
  - 命中 0 条 → `no_match`："no agent memory in <block> matches '<match>' …"
  - 命中 >1 条 → `ambiguous`："N entries match — be more specific:" + 候选列表。
  - `match` 只命中 user 行 → 等同 `no_match`，文案提示"that entry was added by the user; you can't edit it."

服务层返回判别式结果，工具只负责转文本：

```ts
type MemoryEditResult =
  | { status: "ok"; message: string }
  | { status: "no_match" }
  | { status: "ambiguous"; matches: string[] };
```

## 4. 整理：agent 自整理 + host 硬上限兜底

- **自整理（主路径）**：注入时每块带用量标注；某块 ≥ warn 阈值时，块 header 追加引导语，让 agent 用 `remember(replace/remove)` 合并去重。零额外 LLM 调用，对标 Hermes 80% 整理。
- **冻结快照（沿用现状）**：注入在 run 启动时定格；agent 当轮的写入**立刻落盘但本轮不进上下文，下一轮才生效**——避免"追自己尾巴"。
- **兜底（确定性）**：run 启动、构建注入**之前**，对每块：若块字符数 > hard，按 `created_at ASC` 丢弃该块**最老的 `source='agent'` 行**，直到 ≤ soft。**永不丢 user 行**。若 user 行自身已超 soft/hard → 尊重用户、照超不误（前端标超额）。

## 5. 注入格式（`buildAgentAppendContext` 重写）

```
<CLAUDE.md 原文（trim）>

## 用户画像 / User profile  (used 420/1500)
- …

## 事实约定 / Facts & conventions  (used 1980/2500 — near capacity, consolidate via the remember tool: merge duplicates, drop stale entries)
- …
```

- 空块整段省略；两块皆空且无 CLAUDE.md → 返回 `null`（同现状）。
- 用量标注 `(used X/soft)` 始终带；`X ≥ warn` 时追加整理引导短语。
- 函数保持纯（文件 IO/DB 读取在调用方），签名约为 `buildAgentAppendContext(claudeMd: string|null, blocks: { profile: string[]; facts: string[] }, budgets): string|null`，可单测。

## 6. 服务层 & 接线

**`AgentMemoryService`（`sidecar/src/services/agentMemories.ts`）**
- `AgentMemory` / `CreateAgentMemoryInput` 加 `block: MemoryBlock`（`'profile'|'facts'`）。
- `create` 加 `block` 参。
- 新增 `listByAgentBlock(agentWorkspaceId, block)`、`blockCharLength(agentWorkspaceId, block)`。
- 新增 `replaceAgentRow(agentWorkspaceId, block, match, newContent): MemoryEditResult`、`removeAgentRow(agentWorkspaceId, block, match): MemoryEditResult`（仅 `source='agent'` 行；判别式返回）。
- 新增 `trimBlockToBudget(agentWorkspaceId, block, softBudget): number`（丢最老 agent 行到 ≤ soft，返回丢弃条数；不动 user 行）。

**`remember-tool.ts`**：扩 zod schema（action/block/content/match）+ dispatch；`RememberFn` 签名 `(edit, ctx) => MemoryEditResult | Promise<…>`；结果转工具文本。

**`server.ts`**：`onRemember` 改为按 `edit.action` 分发到 `create`(add) / `replaceAgentRow` / `removeAgentRow`，返回 `MemoryEditResult`。

**`runWorker.ts`**：注入前先对两块跑兜底 trim，再读两块行 → `buildAgentAppendContext`。

**`routes/agentMemories.ts`**：`POST /agents/:id/memories` 加 `block` 入参（枚举校验，缺失/非法 → 400）；写入 `source='user'`。`GET` 不变（前端按 block 分组）；`DELETE` 不变。

**`provider.ts`**：仅随 `RememberFn` 签名变化传递；`allowedTools`/MCP 组装逻辑不变（tsc 守护）。

## 7. 前端

- `src/lib/data/types.ts`：`AgentMemory` 加 `block: "profile" | "facts"`。
- `agent-memories.ts` / `agent-memory-queries.ts`：`createAgentMemory` 加 `block` 参；`useCreateAgentMemoryMutation` 对应。
- `MemoryCard.tsx`：渲染两个分组（用户画像 / 事实约定），各自 list（保留 source 角标 + 单条删除）+ add 输入框（写入对应 block，`source='user'`）+ 小用量指示 `420/1500`（超 soft 标红/提示）。
- i18n `locales/{zh,en}/agentSpace.json`：加 `memory.blockProfile`/`memory.blockFacts`/用量等键。

## 8. 测试（`bun test`）

- **Service**：`block` 列迁移 + 存量回填 'facts'；`listByAgentBlock`；`replace/removeAgentRow` 的 `ok`/`no_match`/`ambiguous`/拒动 user 行；`trimBlockToBudget` 只丢最老 agent 行、保留 user 行、user 行超额时不动。
- **`buildAgentAppendContext`**：两段格式、用量标注、≥warn 引导语、空块省略、全空 `null`、CLAUDE.md 在前。
- **remember handler**：三动作 dispatch + 三种结果文案。
- **路由**：`POST` 的 `block` 校验（合法/非法/缺失）、`source='user'`；现有 `GET`/`DELETE` 仍过。
- 既有 `runs.test.ts` 等不回归（`RememberFn` 签名变更波及处编译通过）。

## 9. 明确不做（Spec-1 边界）

- **MemoryCard 仍在现有单列布局里**。把它做成可折叠、搬进右栏 `Context → Memory`、对齐 Claude.ai Projects 截图的空态样式 —— 归 **Spec-2：智能体详情页布局重构**（pin / Add-a-link / scheduled-on-page / 按 agent 过滤查询 / 右栏可折叠卡 / 三点菜单），本 spec 不动。
- **短期记忆**：顺着 SDK 的 compaction，不另建库。
- **语义检索 / 向量 / RAG**：不做。
- **host 端 LLM 整理 pass**：不做（用 agent 自整理 + 兜底替代）。

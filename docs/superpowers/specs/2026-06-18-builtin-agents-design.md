# 内置智能体（Built-in Agents）设计

> 状态：待评审 · 2026-06-18
> 目标：随 App 打包一批**官方只读预置智能体**，定义只通过仓库内 JSON 描述；运行时（对话、记忆、文件空间）与普通 agent 完全一致。

## 1. 背景与目标

当前仓库里 `AgentWorkspace` 就是"智能体"，是唯一概念，持久化在 sidecar 的 SQLite `agent_workspaces` 表，并与磁盘 `homeDir/`（含 `CLAUDE.md`、`memory/`）一一对应。**目前没有任何内置/预设 agent，全部由用户手动创建。**

要做的事：让 App 自带几个官方智能体（如"编码助手""研究助手"），用户打开即用。它们的**定义**（名称/头像/指令/技能）由开发者通过仓库内 JSON 维护、随 App 打包，用户不可改、不可删，但可以正常跟它们聊天、产生记忆、挂文件空间，也可以"克隆"成自己的可编辑 agent。

## 2. 已拍板的核心决策

| 维度 | 决策 |
|---|---|
| 定位 | 官方**只读预置**：列表里直接可用，用户不可编辑/删除，可克隆 |
| 运行时状态 | 与普通 agent **完全一致**：对话记录、`remember` 记忆、文件空间(folders)、链接(links)、pin 都正常 |
| 定义来源 | **仓库内 JSON**，随 App 打包，只有开发者能改 |
| 实现路径 | **方案 B：reconcile 进 DB**（因为 folders/links 是 `agent_workspaces` 的真外键，必须有真实 DB 行才能挂） |
| 技能(mountedSkills) | **只读，属于定义**，每次启动从 JSON 同步 |

### 为什么是方案 B 而不是"虚拟叠加(A)"

A 方案让内置 agent 不进 DB、纯活在 JSON。但 `agent_folders` / `agent_links` 对 `agent_workspaces(id)` 是 **真外键 + ON DELETE CASCADE**（`db.ts:168,182`），没有真实行就挂不了文件空间。既然要求"文件空间像普通 agent 一样工作"，内置 agent 就**必须**有 DB 行 → 方案 B。

> 注：`conversations.agent_workspace_id` / `scheduled_tasks.agent_workspace_id` 是**普通可空列、不是外键**（`db.ts:11,127`），所以对话/任务的绑定本来就很宽松；真正逼我们进 DB 的是 folders/links。

## 3. 只读边界（整个设计的核心切分）

把内置 agent 的字段切成两类，是消除"方案 B 拷贝漂移/孤儿行"老毛病的关键：

| 类别 | 字段 | 写入方 | reconcile 行为 |
|---|---|---|---|
| **定义**（只读，源在 JSON） | `name` / `avatar` / `instructions`(→CLAUDE.md) / `mountedSkills` | 仅开发者改 JSON + App 升级 | 每次启动**覆盖** |
| **用户自有**（与普通 agent 一致，可写） | `memory/` / 对话记录 / `folders` / `links` / `pinned` | 用户 | **绝不触碰** |
| **reconcile 托管** | `archived` | 由 JSON 是否存在决定 | JSON 在→0，JSON 删→1 |

- 因为定义字段每次启动从 JSON 覆盖 → **无漂移**。
- 因为用户自有字段从不被 reconcile 触碰 → 升级不丢用户数据。
- 因为下架的内置只软隐藏(`archived=1`)、保留数据 → **无孤儿悬空**，将来 JSON 复现可自动恢复。

## 4. 数据模型变更

### 4.1 新增 `source` 列

```sql
-- db.ts SCHEMA 的 agent_workspaces 表 + migrate() 里加幂等列
ensureColumn(db, "agent_workspaces", "source", "TEXT NOT NULL DEFAULT 'user'");
```

`source ∈ {'user','builtin'}`。它是"只读 / reconcile / 禁止用户改删"的**唯一判定依据**（比靠 id 前缀更稳）。

### 4.2 类型补字段

- sidecar `AgentWorkspace`（`services/agentWorkspaces.ts:8`）+ `rowToAgent`：加 `source: 'user' | 'builtin'`。
- 前端 `AgentWorkspace`（`src/lib/data/types.ts:73`）：加 `source: 'user' | 'builtin'`。

### 4.3 id 方案

内置 agent 的 id = `agw_builtin_<slug>`（`slug` 来自 JSON）。固定前缀，不与用户的 `agw_<nanoid>` 冲突，且肉眼可辨。homeDir 仍走默认根：`~/.agent-studio/agent-workspaces/agw_builtin_<slug>/`，与普通 agent 同构。

## 5. 定义文件结构与打包

### 5.1 一 agent 一文件夹

```
sidecar/src/builtins/agents/
  index.ts            # 手维护清单（静态 import 每个 agent）
  md.d.ts             # *.md 文本 import 的 ambient 声明
  coding-assistant/
    agent.json        # 索引/元数据：slug / name / avatar / mountedSkills
    AGENT.md          # 指令正文（真 markdown）；reconcile 落成 homeDir/CLAUDE.md
  research-assistant/
    agent.json
    AGENT.md
```

把长指令放进真 markdown（`AGENT.md`），而不是塞进 JSON 字符串里转义——`agent.json` 只是同级目录的**元数据索引**，正文是隔壁的 `AGENT.md`。

`agent.json`：

```json
{
  "slug": "coding-assistant",
  "name": "编码助手",
  "avatar": "blue",
  "mountedSkills": ["design-tokens", "claude-agent-sdk-reference"]
}
```

- `slug`：稳定标识，决定 id（`agw_builtin_<slug>`）。**改了 slug 等于换了一个 agent**（旧的会被软隐藏）。
- `avatar`：色调 token，取值 `orange|blue|purple|red|green|amber|stone` 之一（见 `shared/atoms/agent-avatar.ts`），可省略 → null（按 id 取确定性色调）。initials 由 name 推导，不在 JSON 里写。
- `mountedSkills`：三态。省略 → null（继承全部启用技能）；`[]` → 显式不挂；数组 → 子集。
  **skill id 格式（见 `skillRegistry.ts:135`）**：随 App 打包的内置技能 id = `agent-studio:<SKILL.md 的 name>`（如 `agent-studio:pdf`、`agent-studio:docx`）；个人技能（`~/.agent-studio/skills`、`~/.claude/skills`）id = 裸 `name`（无前缀）。运行时 `resolveSkillsConfig` 取 `全局启用集 ∩ mountedSkills`，写错或未启用的 id 会被交集自然丢弃、不报错。
- 指令不写在 JSON 里 → 同目录 `AGENT.md`（可空文件 → 空 CLAUDE.md）。

### 5.2 打包（编译期约束，已实测验证）

sidecar 经 `bun build --compile` 编译为单二进制，**运行时磁盘上没有源文件，不能 `fs` 扫描、不能用 JSON 里的路径字符串做动态 import**。`agent.json` 与 `AGENT.md` 都必须在 `index.ts` 里**静态 import 嵌进二进制**：

```ts
// sidecar/src/builtins/agents/index.ts —— 手维护清单
import codingMeta from "./coding-assistant/agent.json";
import codingMd from "./coding-assistant/AGENT.md" with { type: "text" };
import researchMeta from "./research-assistant/agent.json";
import researchMd from "./research-assistant/AGENT.md" with { type: "text" };

export interface BuiltinAgentDef {
  slug: string;
  name: string;
  avatar?: string | null;
  mountedSkills?: string[] | null;
  /** 来自同目录 AGENT.md 的正文（编译期注入）。 */
  instructions: string;
}

export const BUILTIN_AGENT_DEFS: BuiltinAgentDef[] = [
  { ...codingMeta, instructions: codingMd },
  { ...researchMeta, instructions: researchMd },
];
```

- 新增内置 = 建一个文件夹（`agent.json` + `AGENT.md`）+ 在 index.ts 加两行 import + 一行清单。
- `AGENT.md` 用 `with { type: "text" }` 文本 import —— **bun run / bun build --compile / tsc 三关均已实测通过**：
  - `bun build --compile` 后二进制能正确读出嵌入的 markdown（含中文）。
  - tsc 需：`sidecar/tsconfig.json` 加 `"resolveJsonModule": true`（json import）+ `sidecar/src/builtins/agents/md.d.ts` 写 `declare module "*.md" { const content: string; export default content; }`（md 文本 import）。补齐后两个 import 行 tsc 零报错。

## 6. 启动 reconcile

新文件 `sidecar/src/services/builtinAgents.ts`，导出 `reconcileBuiltinAgents(db, baseDir)`，在 `server.ts` 构造 `AgentWorkspaceService` 之后调用（`server.ts:113` 之后；与既有 `store.reconcileOrphans()` boot reconcile 同一阶段、同一风格）。

算法（对每个 `BUILTIN_AGENT_DEFS`）：

```
id = `agw_builtin_${def.slug}`
homeDir = join(baseDir, id)

# 1) 物理工作空间（幂等）
mkdir -p homeDir
mkdir -p homeDir/memory；若无 MEMORY.md 则写入 INDEX_HEADER   # 复用 agentMemoryStore 常量
覆盖写 homeDir/CLAUDE.md = def.instructions ?? ""              # 定义字段，每次覆盖

# 2) DB 行 upsert（只动定义字段 + archived，不碰 pinned/用户数据）
若行不存在:
  INSERT (id, name, avatar, home_dir, archived=0, pinned=0, source='builtin',
          mounted_skills_json, created_at=now, updated_at=now)
否则:
  UPDATE SET name=?, avatar=?, mounted_skills_json=?, archived=0, updated_at=now
  WHERE id=?    # 注意：不写 pinned、不写 home_dir
```

收尾：把 `source='builtin'` 且 slug 不在本次清单里的行 `archived=1`（软下架，保留用户数据）。

> reconcile 用自己的 SQL，**不复用** `AgentWorkspaceService.create()`（那个会生成随机 id 且 source 写不进去）。

## 7. 运行时（确认零改动）

内置 agent 一旦是真实 DB 行 + 真实 homeDir，下列全部**沿用现有逻辑、无需改动**：

- `runWorker.ts:344` 取 `get(id).name` 拼身份块 → 正常。
- `runWorker.ts:332` 读 `cwd/CLAUDE.md`（cwd=thread.workingDir=agent homeDir）→ reconcile 已把指令落成 CLAUDE.md，正常。
- `server.ts:218` `resolveSkillsConfig` 读 `get(id).mountedSkills` → reconcile 已写入，正常。
- 文件空间(folders)、链接(links)、记忆(memory)、对话(threads/runs)、scheduler → 因为是真实行，全部正常。

## 8. 只读 guard（路由层）

在路由里用 `agent.source === 'builtin'` 拦截**定义写操作**，放行用户自有操作：

| 路由 | 文件 | 对 builtin |
|---|---|---|
| `PATCH /agents/:id`（name/avatar/mountedSkills/archived） | `routes/agentWorkspaces.ts:45` | **403** `{error:"builtin_readonly"}`；但 `pinned` 是用户自有 → 允许（仅当 body 只含 pinned 时放行） |
| `DELETE /agents/:id` | `routes/agentWorkspaces.ts:74` | **403** |
| `PUT /agents/:id/instructions` | `routes/agentInstructions.ts:34` | **403** |
| `POST /agents/:id/folders`、`/links` 等 | folders/links 路由 | **放行**（用户自有） |
| `GET` 系列 | — | 放行 |

> pin 的处理：`PATCH` 里若 `source==='builtin'` 且 body 仅包含 `pinned` → 放行；含其它定义字段 → 403。实现上把"定义字段 patch"与"pin-only patch"分开判断。

## 9. 前端改动

`AgentWorkspace` 类型加 `source` 后，按 `source==='builtin'` 做只读 UI：

| 组件 | 改动 |
|---|---|
| `AgentSpaceHeader.tsx` | 名称/头像编辑入口禁用；删除按钮替换为 **"克隆为我的 agent"**；可加"官方"徽标 |
| `InstructionsCard.tsx` | 内置 → 只读展示（隐藏保存/编辑） |
| `SkillsRailCard.tsx` / `ManageSkillsModal.tsx` | 内置 → 只读展示挂载技能 |
| `ContextCard.tsx`（文件空间）/ `AgentLinksCard.tsx`（链接） | **保持可编辑**（用户自有） |
| `AgentCard.tsx` / `AgentsView.tsx` | 列表可加"官方"徽标；pin 正常 |

## 10. 克隆（escape hatch）

"克隆"= 用内置的 JSON 定义新建一个普通用户 agent：

- 后端：`POST /agents/:id/clone`（或前端组合现有接口）→ `create({name: name+" (副本)", avatar})` + 写 CLAUDE.md(=内置当前 instructions) + set mountedSkills；`source='user'`，完全可编辑。
- 不复制 memory / 对话 / folders（那是运行时数据，克隆只复制定义）。

## 11. 测试计划（Bun runner）

- `builtinAgents.test.ts`：reconcile 幂等性（跑两次结果一致）；新增 def → 建行+homeDir+CLAUDE.md；def 改 name/skills → 覆盖；def 移除 → archived=1 且 memory 保留；**pinned 不被覆盖**、folders 行不被删。
- 路由测试：builtin 的 PATCH(定义)/DELETE/PUT instructions → 403；pin-only PATCH → 200；folders/links → 正常。
- 复用现有 `AgentWorkspaceService` 测试模式（注入临时 db + baseDir）。

## 12. 非目标 / 未来

- 不支持用户向运行目录"投放" JSON（仅仓库内打包）。如需，未来再加扫描目录。
- 内置 agent 不带"默认模型"（现有数据模型里 agent 不持有 model，model 是 per-thread）。
- mountedSkills 用户不可改（只读）；若将来要"运行时可调"，需引入 override 层。

## 13. 实施步骤（有序，直接实施用）

1. **db**：`db.ts` 加 `source` 列（SCHEMA + ensureColumn）→ `bun test`/手测迁移幂等。
2. **service 类型**：`services/agentWorkspaces.ts` 的 `AgentWorkspace`/`rowToAgent`/SELECT 带上 `source`。
3. **定义文件 + 清单**：建 `builtins/agents/<slug>/{agent.json,AGENT.md}` ×N + `index.ts`（静态 import json 与 md 文本）+ `md.d.ts`；`sidecar/tsconfig.json` 加 `resolveJsonModule: true`。→ `cd sidecar && bunx tsc --noEmit` 零报错。
4. **reconcile**：`services/builtinAgents.ts` `reconcileBuiltinAgents`；`server.ts:113` 后调用。→ 启动后 DB 出现 builtin 行、homeDir 生成。
5. **路由 guard**：`routes/agentWorkspaces.ts` PATCH/DELETE + `routes/agentInstructions.ts` PUT 按 source 拦截（pin-only 例外）。
6. **前端类型**：`src/lib/data/types.ts` `AgentWorkspace` 加 `source`。
7. **前端只读 UI**：Header/Instructions/Skills 卡按 source 只读；Context/Links 保持可写；加克隆入口。
8. **克隆**：后端 clone 接口或前端组合 + 前端按钮。
9. **测试**：reconcile + 路由 guard 单测全绿。
10. **验证**：`bun run tauri:dev` 看列表出现官方 agent、能聊天/记忆/挂文件空间、改名/删/改指令被拒、克隆得到可编辑副本。

---

每一步成功判据：见对应行的"→"。整体完成判据 = 第 10 步全过。

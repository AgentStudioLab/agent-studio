# 智能体级技能挂载（Per-Agent Skill Mounting）设计

日期：2026-06-16

## 1. 背景与目标

当前 skills 是**全局**的：`resolveSkillsConfig()` 每轮把"所有启用的技能 id"丢给 Claude
Agent SDK（`skills` + `plugins` 选项），完全不区分是哪个智能体在跑。每个 agent 都看到
同一套技能。

目标：让每个智能体（agent workspace）能**指定自己挂载哪些 skills**，从而：

- **专注 / 可预测**：只挂少量技能的 agent，模型选错技能、被无关能力带偏的概率更低 ——
  让这个 agent 专做特定的事。这是首要收益。
- **顺带省上下文**：减少注入系统提示的"技能菜单"（每个技能的 name+description），以及这些
  技能附带注册的工具 / MCP（如 `schedule` 技能会注册 `creates_scheduled_task` MCP 工具，
  移除它连工具 schema 一起省）。注意：技能正文本就是按需懒加载的，不算常驻成本，所以省的是
  菜单 + 工具，量级取决于技能数量和是否带工具。

## 2. 核心设计决策

1. **三态挂载选择**（每个 agent 一份）：
   - `null` → **继承全部**（跟随全局启用集）。默认态，不落库。系统以后新增的技能会自动对
     未自定义的 agent 可见。
   - `["a","b"]` → 显式只挂这几个。
   - `[]` → 显式一个都不挂（空集，与"继承全部"区分开）。
2. **与全局开关取交集**：运行时有效技能 = `全局启用集 ∩ 挂载选择`（选择为 `null` 时即全局
   启用集）。全局关掉的技能在任何 agent 都不出现；agent 里挂了但已被全局禁用 / 卸载的，交集
   时自然掉出，无需额外清理。全局开关（自定义 > 技能）= "这台机器装没装这个能力"的总闸。
3. **作用域**：只对"绑定了某个 agent 的 run"生效。不绑 agent 的零散任务仍走全局集合 ——
   与 instructions / memory / 外挂文件夹完全一致。
4. **存储用 JSON 列，不建关联表**：挂载选择只是一组字符串 id、整体读写、需要三态，且从不被
   查询 / join，只在每次 run 整体读出。因此在 `agent_workspaces` 加一个
   `mounted_skills_json TEXT NULL` 列即可：`NULL` 天然表达"继承"，数组表达显式选择。比照搬
   `agent_folders` / `agent_links` 的"建表 + service + 路由"省很多代码（符合最小代码原则）。

## 3. 数据模型

`agent_workspaces` 新增列：

```sql
mounted_skills_json TEXT   -- NULL=继承全部；'[]'=显式不挂；'["id1","id2"]'=显式子集
```

`AgentWorkspace` 类型（sidecar 与前端各一份）新增字段：

```ts
/** 该 agent 挂载的技能 id 列表；null=继承全部启用技能，[]=显式不挂任何技能。
 *  运行时与全局启用集取交集。 */
mountedSkills: string[] | null;
```

## 4. 后端改动（sidecar）

- **`db.ts`**：`migrate()` 加 `ensureColumn(db, "agent_workspaces", "mounted_skills_json", "TEXT")`。
- **`services/agentWorkspaces.ts`**：
  - `AgentWorkspace` 接口加 `mountedSkills: string[] | null`。
  - `AgentWorkspaceRow` 加 `mounted_skills_json: string | null`。
  - `rowToAgent` 解析（安全 parse，损坏数据回退 `null`）。
  - `UpdateAgentWorkspaceInput` 加 `mountedSkills?: string[] | null`。
  - `update()` 处理：`undefined`=不改；`null`=写 NULL（继承）；数组=写 `JSON.stringify`。
- **`routes/agentWorkspaces.ts`**：`PATCH /agents/:id` 解析 `mountedSkills`：`null` → 传 null；
  字符串数组 → 传数组；否则 → `undefined`（沿用 avatar 的宽松三分支风格）。
- **`agui/provider-claude/provider.ts`**：
  - `ClaudeProviderOptions.resolveSkillsConfig` 签名改为
    `(agentWorkspaceId?: string) => { enabledSkills; pluginPath }`。
  - 调用处（约 358 行）改为 `opts.resolveSkillsConfig?.(ctxRun.agentWorkspaceId)`
    （`ctxRun.agentWorkspaceId` 已在作用域内，同 remember 工具的判定）。
- **`server.ts`**：`resolveSkillsConfig` 闭包改为接收 `agentWorkspaceId`，做交集：

  ```ts
  resolveSkillsConfig: (agentWorkspaceId) => {
    const enabled = skillRegistry.listEnabledIds();
    const mounted = agentWorkspaceId
      ? (agentWorkspaces.get(agentWorkspaceId)?.mountedSkills ?? null)
      : null;
    const effective = mounted == null
      ? enabled
      : enabled.filter((id) => mounted.includes(id));
    return { enabledSkills: effective, pluginPath: skillRegistry.builtinPluginPath() };
  },
  ```

  管线不动（`agentWorkspaceId` 早已一路传到 provider）。

## 5. 前端改动

- **`lib/data/types.ts`** + **`lib/data/agents.ts`**：`AgentWorkspace` 加 `mountedSkills`；
  `UpdateAgentWorkspaceArgs` 加 `mountedSkills?: string[] | null`（PATCH 透传即可，已有的
  `updateAgentWorkspace` 直接复用）。
- **`features/agent-workspaces/SkillsRailCard.tsx`**（新）：右栏卡片，套用 `RailSection`：
  - `mountedSkills == null` → 显示"全部技能"。
  - 数组 → 显示已挂数量 + 名称列表（id 经 `useSkills()` 映射成 name；找不到的 id 原样显示）。
  - 标题右侧 ＋/管理按钮（齿轮或铅笔）打开管理弹窗。
- **`features/agent-workspaces/ManageSkillsModal.tsx`**（新）：套用 `Dialog` + `Checkbox`：
  - 顶部一个"全部技能（默认）"开关：开 → 存 `null`；关 → 进入逐项勾选。
  - 列出 `useSkills()` 全量技能，复选框 = 是否挂载；全局关闭的技能加 "(已全局关闭)" 灰字提示
    （呼应交集语义，避免"挂了却不生效"的困惑）。
  - 保存：全选=全部 → 存 `null`；否则存勾选 id 数组（含空数组）。走
    `useUpdateAgentWorkspaceMutation`。
- **`AgentSpaceView.tsx`**：右栏在 `ScheduledRailCard` 与 `ContextCard` 之间（或末尾）插入
  `<SkillsRailCard agentId={agentId} />`。
- **i18n**：`zh/agentSpace.json` 与 `en/agentSpace.json` 新增 `skills.*` 文案块。

## 6. 边界与降级

- **损坏 JSON**：`rowToAgent` 安全 parse，异常回退 `null`（继承全部），不让坏数据炸 run。
- **技能被卸载 / 全局禁用**：交集在 run 时自然过滤，挂载列表里的陈旧 id 不必清理。
- **非 Tauri / 非 agent run**：行为不变，走全局集合。
- **空数组 = 显式不挂**：与 `null` 区分开，靠 JSON 列三态天然表达。

## 7. 验收标准

1. 新建或已有 agent，未操作时 `mountedSkills` 为 `null`，run 行为与现状一致（全局集合）。
2. 在管理弹窗里取消勾选若干技能并保存后，该 agent 的下一个 run 只在交集内拥有技能；其他 agent
   不受影响。
3. 显式清空（一个都不挂）后，该 agent 的 run 不带任何技能。
4. 全局禁用某技能后，即使某 agent 挂了它，run 里也没有它（交集）。
5. `bunx tsc --noEmit -p tsconfig.app.json`、`cd sidecar && bunx tsc --noEmit`、
   `cargo check`（无 Rust 改动可略）均通过；现有测试不回归。

## 8. 非目标

- 不改官方 / SDK skill，不改 `src/components/ui` 与 `src/components/ai-elements`。
- 不做技能的热重载（仍 sidecar 启动时扫描一次）。
- 不在"新建任务"零散对话里提供技能选择 UI（仅 agent 详情页）。
- 不做技能分组 / 标签 / 搜索等增强（YAGNI）。

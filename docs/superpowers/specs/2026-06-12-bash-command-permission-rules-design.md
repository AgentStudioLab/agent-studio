# Bash 命令级审批规则（Claude Code 风格）设计

- 日期：2026-06-12
- 状态：待评审
- 关联：工具审批（HITL）机制

## 1. 背景与目标

当前「始终允许 Bash」是**按工具名**的全有全无开关：点一次就放行该工作目录下**所有** bash 命令，无法像 Claude Code 那样按命令模式（`Bash(rg *)`、`Bash(git status)`）细分。

目标：把审批升级为 **Claude Code 风格的命令模式规则**，用户在审批卡上可选择「仅此命令 / 此命令前缀 / 整个 Bash」三档粒度授权；底层用 CC 的 `Tool(pattern)` 规则语法，匹配在 sidecar 的 `canUseTool` 内完成。

非目标（YAGNI，见 §9）：迁移规则持久化到 sidecar DB、文件类工具的 path-glob 规则、deny 黑名单管理 UI。

## 2. 现状（已彻查，含 file:line）

存在**两套并行、互不同步**的 allowlist：

**(A) 前端 Tauri-store 层** —— 驱动客户端静默自动放行
- 「始终允许」按钮 → `onAllowAlways={addWorkspaceTool}`（`src/features/task/TaskView.tsx:421`），写入按 cwd 的 `workspace-allowlist`（`src/lib/workspace-allowlist.ts`，形状 `Record<cwd, string[]>`）。
- 自动放行闸口：`TaskView.tsx:217` `if (toolName && allowedTools.has(toolName)) resumeRun({decisions:[{type:"allow"}]})`，以及 `src/features/task/ChatStream.tsx:242` 同款判断。
- **此层从不下推 sidecar。** 全局版在 `src/lib/hitl-allowlist.ts`，设置页 `src/features/settings/sections/PermissionsSection.tsx` 管理。

**(B) sidecar 层** —— 喂给 SDK `allowedTools`
- `resolveAllowedTools(threadId)`（`sidecar/src/server.ts:196`）= `threads.getAllowedTools(threadId)`（`allowed_tools_json` 列）`?? settingsTools.getDefault()`。
- 默认值含全部 9 个工具（`sidecar/src/services/settings-tools.ts:3`，`["Bash","Read","Write","Edit","Glob","Grep","WebFetch","WebSearch","Task"]`）。
- 每会话 override 的前端 hook `useThreadAllowedTools`（`src/lib/data/thread-tools-queries.ts:29`）**目前 UI 无人调用**；只有设置页「默认工具」栏改 `settings.allowedTools`。

**关键事实：**
1. 「始终允许 Bash」的真实链路是：SDK 照常对每个 Bash 调 `canUseTool` → 发审批卡 → **前端把卡片静默点掉**，sidecar 全程不知情。
2. sidecar 用一条 blanket `ask` 把变更类工具强制走 HITL（`sidecar/src/agui/provider-claude/provider.ts:483`）：
   ```ts
   settings: { permissions: { ask: ["Bash(*)","Write(*)","Edit(*)","MultiEdit(*)","NotebookEdit(*)","Task(*)","WebFetch(*)"] } }
   ```
   即使 Bash 在 `allowedTools` 默认列表，它仍弹卡 —— 说明本 SDK 里这条 `ask` 至少不弱于 `allowedTools`。
3. `canUseTool`（`provider.ts:233-316`）现有顺序：AskUserQuestion 特例 → 沙箱检查 → `act-without-asking` 短路（286）→ 无 bus 短路（289）→ `ctx.autoApproveTools?.includes(toolName) && !isDestructiveToolCall(...)` 放行（297-302）→ 否则 `bus.requestApproval`（303）。
4. 审批卡的 interrupt payload 已携带 `{toolName, input, title?, description?}`（`sidecar/src/agui/provider-claude/interrupt-bus.ts:112`），前端 `ToolApprovalCard` 的 `renderBash` 已读 `input.command`（`src/features/task/ToolApprovalCard.tsx:202`）。**所以前端能拿到命令字符串来生成规则。**
5. resume 路由 `POST /runs/:runId/resume`（`sidecar/src/routes/runs.ts:345`），decision 类型 `allow|deny|ask_user_answers`，allow 分支构造 `{behavior:"allow"}` 调 `bus.resolve`（`runs.ts:414-422`）。`bus.resolve(runId, interruptId, result)` 解决 pending 的 `canUseTool` Promise（`interrupt-bus.ts:161`），key 为 `${runId}:${toolUseID}`。
6. 定时任务把 `autoApproveTools: task.allowedTools`（裸名）传入（`sidecar/src/services/scheduler.ts:144`），即 §2.3 的 autoApprove 检查来源。

## 3. 设计决策

| # | 决策 | 取值 |
|---|---|---|
| D1 | 匹配位置 / 安全兜底 | **B2**：保留 `ask:["Bash(*)"]` 不动；在 `canUseTool` 进 bus 前做命令模式匹配，命中即放行、未命中才发卡。**已确认** |
| D2 | 授权粒度 | **卡片二选一**：仅此命令 / 此命令前缀。**刻意不提供「整个 Bash」一键放行**（会退回全有全无、失去命令级审批意义）。**已确认（评审修订）** |
| D3 | 规则语法 | CC 的 `Tool(pattern)` 字符串，存为 `string[]`。裸名 `Bash` ≡ `Bash(*)`。**无迁移**（旧 bare-name 条目天然合法，= 整工具放行） |
| D4 | 规则 source of truth | 维持**前端按 cwd 的 Tauri store**（§2.A）；内容从「工具名」升级为「CC 规则串」。本期**不**迁到 sidecar DB |
| D5 | 规则如何到达 sidecar | run 启动时由前端把 `union(全局规则, cwd 规则)` 作为 `approvalRules` 放进 `POST /runs` body 注入；run 内点「始终允许」经 resume 决策即时追加 |

## 4. 规则语法与生成

### 4.1 匹配语义（sidecar `matchApprovalRule(rule, toolName, input)`）
- `<Tool>`（裸名）或 `<Tool>(*)` → 匹配该工具**所有**调用。
- `Bash(<exact>)` → `input.command.trim() === <exact>`。
- `Bash(<prefix>:*)` → `cmd === <prefix>` 或 `cmd.startsWith(<prefix> + " ")`。
- 非 Bash 工具：本期只用裸名（`Edit` = 所有 Edit）。
- 规则 tool 段与 `toolName` 不一致直接不匹配。

### 4.2 规则生成（frontend `buildBashRule(command, scope)`）
- **仅此命令** → `Bash(<command.trim()>)`。
- **此命令前缀** → `Bash(<prefix>:*)`，`prefix` = 命令的前导 token，直到首个「以 `-` 开头」或「含 `/`」的 token 为止（启发式取"子命令"）。例：`git status --short`→`git status`；`npm run test`→`npm run test`；`rg -n foo`→`rg`。**卡片直接展示算出的 prefix**，用户所见即所授。
- 非 Bash 工具的「始终允许」→ 裸名 `<toolName>`（整工具；这些工具没有命令可做模式）。
- **不提供「整个 Bash」**：卡片不生成裸 `Bash` / `Bash(*)`。匹配器仍兼容裸名（向后兼容旧 store 与其它工具），但 UI 不再产出 Bash 全放行规则。

## 5. 架构与数据流（B2）

```
┌─ 前端 ────────────────────────────────────────────────┐
│ Tauri store（按 cwd + 全局）  ← source of truth（CC 规则串）│
│   · run 启动：union → approvalRules[] 进 POST /runs body  │
│   · 卡片点「始终允许(某档)」：写 store + resume{persistRule} │
└───────────────────────────────────────────────────────┘
            │ POST /runs {..., approvalRules}        │ POST /runs/:id/resume {decisions:[{type:"allow", persistRule}]}
            ▼                                         ▼
┌─ sidecar ──────────────────────────────────────────────┐
│ ApprovalRulesRegistry: Map<runId, Set<rule>>            │
│   · run 启动 seed = new Set(approvalRules)               │
│   · resume persistRule → registry.add(runId, rule)      │
│   · run terminal → registry.clear(runId)                │
│                                                          │
│ canUseTool(toolName, input):                             │
│   ... 沙箱 / act-without-asking 不变 ...                  │
│   rules = registry.get(runId) ∪ ctx.autoApproveTools     │
│   if rules.some(r => matchApprovalRule(r, toolName,input))│
│      && !isDestructiveToolCall(...) → allow（不进 bus）    │
│   else → bus.requestApproval（发卡，未命中才弹）            │
└──────────────────────────────────────────────────────────┘
```

要点：
- 命中规则的命令**根本不产生 interrupt**（比现状"发卡再静默点掉"少一次往返，更接近 CC 引擎侧匹配）。
- `autoApproveTools`（定时任务裸名）与 `approvalRules` 在匹配器里**统一**处理：裸名对两者都成立，定时任务无需改动即可复用。
- run 内即时生效靠 registry：resume 追加规则后，本 run 后续同模式命令自动放行。

## 6. 详细改动清单

### 6.1 sidecar
1. **新模块** `sidecar/src/agui/provider-claude/approval-rules.ts`：纯函数 `parseRule`、`matchApprovalRule(rule, toolName, input)`。带单测。
2. **registry** `sidecar/src/agui/provider-claude/approval-rules-registry.ts`：`Map<runId, Set<string>>` + `seed/add/get/clear`。在 server 装配处单例注入 provider 与 resume 路由（与 `interruptBus` 同级注入）。
3. **`provider-types.ts`**：`RunContext` 增 `approvalRules?: string[]`（seed 用）；provider opts 增 registry 句柄。
4. **`provider.ts` canUseTool**：把 297-302 的 `autoApproveTools?.includes(toolName)` 改为统一匹配：
   ```ts
   const rules = [...(registry.get(ctx.runId) ?? []), ...(ctx.autoApproveTools ?? [])];
   if (rules.some(r => matchApprovalRule(r, toolName, input)) && !isDestructiveToolCall(toolName, input)) {
     return { behavior: "allow", updatedInput: input };
   }
   ```
   `ask:["Bash(*)"]` 与沙箱、act-without-asking 全部保持不变。
5. **`runWorker.ts`**：`RunWorkerInput` + `provider.run({...})` 传 `approvalRules`；run 启动 `registry.seed(runId, approvalRules)`；`finally`/`cancelAll` 处 `registry.clear(runId)`。
6. **`routes/runs.ts`**：`POST /runs` body 解析 `approvalRules?: string[]`（校验 string[]）；`POST /runs/:runId/resume` 的 allow decision 解析可选 `persistRule?: string`，命中时 `registry.add(runId, persistRule)`（在 `bus.resolve` 前后均可，无序依赖）。

### 6.2 前端
7. **新工具** `src/features/task/bash-rule.ts`：`buildBashRule(command, scope)` + `bashRulePrefix(command)`（卡片标签用）。带单测。
8. **`ToolApprovalCard.tsx`**：
   - `onAllowAlways` 签名 `(toolName)` → `(rule: string)`，且**自包含**（内部触发 persist + resume，不再额外调 `onAllow()`）。
   - Bash：把单个「始终允许 Bash」改为带下拉的「始终允许」——主操作=「此前缀 `<prefix>`」，下拉含「仅此命令 / 整个 Bash」。样式走 `design-tokens` skill，不硬编码。
   - 非 Bash：保持单个「始终允许 {tool}」，rule=裸名。
   - `⌘⏎` 映射见开放问题 Q1。
9. **`TaskView.tsx`**：
   - 删除自动放行闸口（206-228 的 `autoAllowFiredByRun` + effect）—— 匹配已移至 sidecar，命中工具不再产生 interrupt，闸口成为死代码。
   - run 启动（send/regenerate，约 186/281/439）携带 `approvalRules = union(globalRules, cwdRules)`。
   - 新 `onAllowAlways` handler：`buildBashRule` 结果 → 写 cwd store（`addWorkspaceTool`）+ resume 带 `persistRule`。
10. **`ChatStream.tsx:242`**：同样删除其 allowlist 闸口。
11. **runtime/api/useChat**：send/regenerate options 与 `POST /runs` body 增 `approvalRules?: string[]`（`runtime.ts:221`、`api.ts:125` 一带）；resume 决策 payload 增 `persistRule?`。
12. **Tauri store**（`workspace-allowlist.ts` / `hitl-allowlist.ts`）：结构不变（仍 `string[]` / `Set<string>`），仅内容语义升级为 CC 规则串。向后兼容：旧裸名 = 整工具。
13. **`PermissionsSection.tsx`**：全局 HITL 栏维持整工具裸名勾选（合法规则），本期不加命令规则可视化管理（见 §9）。

## 7. 安全与边界
- **无静默放行新风险**：`ask:["Bash(*)"]` 兜底保留，所有 Bash 仍进 canUseTool，仅"已匹配用户规则"才放行。
- **沙箱不变**：匹配在沙箱检查之后，命中规则的 Bash 仍受 OS 写边界约束。
- **destructive 守卫保留**：命中规则但属不可逆操作（`isDestructiveToolCall`）仍发卡，与现 `autoApproveTools` 一致（豁免与否见 Q2）。
- **registry 生命周期**：仅内存、按 runId，run 终止即清，无跨 run 泄漏；持久化仍在前端 store。

## 8. 测试计划（Bun runner）
- `approval-rules.test.ts`：裸名 / `(*)` / exact / `prefix:*` 各情形；前缀边界（`git status` 不匹配 `git statusx`、匹配 `git status --short`）；tool 段不匹配。
- `bash-rule.test.ts`：三档生成 + 前缀启发式（flag / 路径截断）。
- sidecar canUseTool（扩 `provider.test.ts`）：命中→不进 bus；未命中→进 bus；命中但 destructive→仍进 bus；`autoApproveTools` 裸名经新匹配器仍放行（回归）。
- resume 集成（扩 `runs.test.ts`）：`persistRule` → registry 追加 → 后续同前缀命令自动放行。
- 前端：卡片三档点击产出正确 rule + 写 store + resume 带 `persistRule`；旧裸名 store 条目仍 = 整工具放行（回归）。

## 9. 不在本期范围（YAGNI）
- 规则持久化迁到 sidecar DB（保留前端 Tauri store + 按 run 注入即可满足需求）。
- 文件类工具 path-glob 规则（`Edit(/x/**)`）；本期仅 Bash 命令粒度，其它工具仅整工具。
- deny 黑名单（`Bash(rm -rf *)`）管理 UI。
- 设置页对 per-cwd 命令规则的列表 / 删除可视化（先靠卡片增量添加；删除能力后续补）。

## 10. 开放问题（实现前请拍板）
1. **Q1**：`⌘⏎` 快捷键映射到三档中的哪档？建议 = 「此前缀」（推荐档）。今天 `⌘⏎` = 整工具，改动需注意肌肉记忆。
2. **Q2**：用户显式 always-allow 的命令若被 `isDestructiveToolCall` 判定不可逆，是否豁免守卫直接放行？建议**不豁免**（安全优先），保持与 `autoApproveTools` 一致。
3. **Q3**：前缀启发式的 token 规则是否就用「前导非 flag / 非路径 token」？卡片展示结果作为安全阀。
4. **Q4**：是否保留全局 HITL 设置页（作为全局裸名规则来源）？建议保留。

## 11. 实施与评审修订（2026-06-12）

实现完成，落点与 §6 一致；以下为实施期 + 对抗式多维评审后的修订：

- **去掉「整个 Bash」一键放行**（D2 修订，用户要求）：Bash 仅命令级二选一（仅此命令 / 此前缀）；`buildBashRule` 不再有 `all` 档；卡片用下拉二选一。非 Bash 工具维持整工具裸名。
- **匹配器加固**（评审 #5–#8）：`matchApprovalRule` 对退化 pattern（`Bash()` / `Bash(:*)` / 空前缀）一律不匹配；尾部 `*` 与 `:*` 统一为「前缀 + 词边界」语义，避免 `Bash(git*)` 误中 `gitfoo`。卡片侧另加 `canAllowAlways` 守卫，命令为空的 Bash 不提供「始终允许」。
- **规则集加性合并**（评审 #1–#4）：经核查，`runTurn` 每个 run 只调用一次（`executeRunLoop` 不重入、HITL resume 走 `bus.resolve` 而非 `provider.resume`），故"重复 seed 清空规则"并非现网 bug；但 `seedRules` 已改为**加性合并**（不覆盖），消除未来若接入 `provider.resume` 的隐患。
- **类型收窄**（评审 #9）：`/resume` 取 `persistRule` 改为 `decision.type === "allow"` 判别式收窄，去掉不安全 cast。
- 验证：sidecar tsc + 449 测试通过；前端 tsc + build + 新增单测通过。

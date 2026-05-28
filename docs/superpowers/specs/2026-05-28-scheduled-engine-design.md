# Scheduled 自动化引擎 · 设计

> 把 Scheduled(计划任务)从静态 mock 变成真正能后台触发、自动跑 agent、产出工件、可回看的引擎。
> 文档版本 v1 · 2026-05-28 · 状态:待评审

---

## 1. 背景与目标

当前 chat/task 纵向已打通:`POST /runs` 能拉起真实 agent 流式执行、落工件、右栏可视化、HITL 审批、会话 CRUD。但 **Scheduled 完全是 mock**——`ScheduledListView`/`ScheduledDetailView`/`NewScheduledModal` 直接 `useState(mock/scheduled)`,sidecar 无 schedule 路由,Rust 与 sidecar 均无调度器。UI 能填表保存到内存,但没有任何东西会在到点时真的把它跑起来。

Cowork 区别于"聊天 app"的命脉,正是 **agent 在后台、按时间自主跑完一件事、产出工件**。chat 链路已具备"自主执行 + 工件 + HITL",**唯一缺失的 cowork 支柱就是定时/后台自动触发**。本设计补上这一块。

**对标验证(Claude Cowork 桌面版官方文档):**
- 桌面版 Cowork **本地跑**(隔离 VM),**app 必须开着**,关了 session 结束 —— 与我们架构同构。
- 调度 = **app 开着时每分钟查一次 schedule**(非 OS cron)—— 验证本设计的 tick 轮询。
- 每个定时任务 = **一个全新独立 session** —— 对应"每次触发新建 thread"。
- 错过(睡眠/app 关)= **跳过,唤醒/重开后补跑一次 + 通知 + 跳过记录进 history**。
- 每任务带 **确定性延迟(≤10 分钟)** 错峰 —— 本设计采纳。
- 永久删除文件 **永远要批准,无视权限模式** —— 本设计采纳为"删除硬护栏"。

## 2. 范围

**v1 在内(中间档:含白名单安全核心):**
- 全频率:手动 / 每小时 / 每天 / 工作日 / 每周 + 时间(`HH:MM`)
- sidecar 进程内 tick 调度器(每 60s),自写,不引 cron lib
- 每次触发新建会话 + 复用 `runWorker` 跑完
- **白名单(Always allowed)安全模型**:命中清单的工具自动放行,未命中 → run 挂起为 `awaiting_approval` → app 内"在等你"提示 → 复用 `/resume` 续跑
- 删除等破坏性操作硬护栏:即使在白名单内也强制审批
- 确定性错峰延迟
- run 历史(每次触发的会话,可点击进入)
- 错过补偿:只补跑一次

**v1 不做(留 V2):**
- 原生 OS 通知(v1 走 app 内徽标/列表)
- keep-awake 真实阻止系统休眠
- app 关闭后仍触发(需 OS 级常驻 daemon,属 V2/Dispatch 范畴)
- 首次跑完后 Claude 自动改写任务 prompt
- 任意会话内 `/schedule` 交互式创建(v1 只做表单)
- "每周"的星期几选择器(v1 锚定创建当天的星期)

## 3. 架构总览

```
sidecar 启动
  └─ ScheduledTaskService 加载 enabled 任务,补算缺失的 next_run_at
  └─ Scheduler.start():setInterval(tick, 60_000) + 立即跑一次
        │
   每 tick (60s):
        │  SELECT * FROM scheduled_tasks
        │  WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= now
        ▼
   对每个 due 任务 fire():
        ├─ 新建 thread(种子=prompt, tag=scheduled_task_id, cwd=项目目录)
        ├─ messages.appendUser(prompt)
        ├─ store.createRun
        ├─ runWorker({ permissionMode:"ask", autoApproveTools=任务白名单, model })
        │     └─ 命中白名单&非破坏性 → 自动放行
        │     └─ 否则 → bus.requestApproval → run 挂起 awaiting_approval
        └─ last_run_at = now;next_run_at = computeNextRunAt(freq, time, from=now)
              (computeNextRunAt 总是算"严格晚于 now 的下一次" → 错过的中间窗口自动跳过,只补一次)
```

调度器**不认识频率**:它只比较存好的 `next_run_at <= now`。所有频率差异收敛进纯函数 `computeNextRunAt`,调度循环对频率零分支。

## 4. 数据模型

### 4.1 新表 `scheduled_tasks`(sidecar SQLite)

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  prompt             TEXT NOT NULL,
  project_id         TEXT,                 -- 可选;决定 spawned 会话的 working_dir
  model              TEXT,                 -- 可选;per-run model 覆盖
  frequency          TEXT NOT NULL
                     CHECK (frequency IN ('manual','hourly','daily','weekdays','weekly')),
  time_of_day        TEXT,                 -- 'HH:MM';manual 可空,hourly 仅用分钟部分
  enabled            INTEGER NOT NULL DEFAULT 1,
  allowed_tools_json TEXT,                 -- JSON string[] — 本任务 Always allowed
  next_run_at        INTEGER,              -- epoch ms;manual / disabled 为 NULL
  last_run_at        INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_next ON scheduled_tasks (enabled, next_run_at);
```

放进 `db.ts` 的 `SCHEMA`(随 `CREATE TABLE IF NOT EXISTS` 幂等)。

### 4.2 run 历史:给 `conversations` 加 tag

```ts
ensureColumn(db, "conversations", "scheduled_task_id", "TEXT");
```

每次触发就是一条普通会话,只多打来源 tag。**run 历史 = `WHERE scheduled_task_id = ?` ORDER BY created_at DESC**,会话状态复用现有 `store.listThreadStatuses()`(done/error/running/awaiting_approval)。**不另建 `scheduled_runs` 表**(避免徒增 join)。

## 5. 调度器

新建 `sidecar/src/services/scheduler.ts` + `sidecar/src/services/scheduledTasks.ts`(CRUD + computeNextRunAt)。

### 5.1 `computeNextRunAt(frequency, timeOfDay, from): number | null`

纯函数,**用本地墙上时间构造 Date**(`new Date(y, m, d, hh, mm)`)而非固定毫秒加,跨夏令时自动正确。算"严格晚于 `from` 的下一次",再叠加确定性错峰偏移。

| 频率 | next_run_at 算法 | 备注 |
|---|---|---|
| `manual` | `null` | 永不自动,仅 Run now |
| `hourly` | 下一个"分钟 == timeOfDay 的分钟(默认 :00)"的时刻 | 只用分钟部分 |
| `daily` | 当天 `timeOfDay`,若 ≤ from 则次日 | |
| `weekdays` | 同 daily,落在周六/日则推到周一 | |
| `weekly` | 锚定创建当天的星期 + `timeOfDay`,每 7 天 | v1 无星期选择器 |

### 5.2 错峰延迟(确定性)

`offsetMs = hash(taskId) % (10 * 60_000)`(0–10 分钟,稳定)。叠加到 `next_run_at`。**用确定性而非真随机**:这样详情页显示的"下次运行"准确且不跳。对应 PRD"随机延迟数分钟"与 Cowork"deterministic delay"。

### 5.3 tick 与错过补偿

```ts
start() {
  this.armAll();                 // boot:为缺 next_run_at 的 enabled 任务补算
  this.tick();                   // 立即跑一次(捕捉重启期间错过的)
  this.timer = setInterval(() => this.tick(), 60_000);
}
tick() {
  const now = Date.now();
  for (const task of this.svc.dueTasks(now)) {   // enabled & next_run_at <= now
    this.fire(task);
    this.svc.advance(task.id, now);              // last_run_at=now; next_run_at=compute(..., now)
  }
}
```

错过补偿天然成立:`next_run_at` 可能远在过去(睡了 3 小时),`computeNextRunAt(from=now)` 算的是"严格晚于 now 的下一次",中间错过的 N 个窗口被一次性跳过,只 fire 当前这一次。

### 5.4 fire(task)

复刻 `runs.ts:66-90` 的发起逻辑:

```ts
const threadId = crypto.randomUUID();
const cwd = task.projectId ? projectWorkingDir(task.projectId) : undefined;  // 默认 ~/.agent-studio
threads.create({ id: threadId, title: task.name, projectId: task.projectId, workingDir: cwd, scheduledTaskId: task.id });
messages.appendUser(threadId, task.prompt);
const runId = crypto.randomUUID();
await store.createRun(runId, threadId);
void runWorker({
  runId, threadId, userMessage:{role:"user",content:task.prompt},
  store, messages, threads, provider, interruptBus, usage,
  abortSignal: new AbortController().signal,
  permissionMode: "ask",                         // 闸门活着,白名单在闸门内放行
  model: task.model ?? undefined,
  autoApproveTools: JSON.parse(task.allowed_tools_json ?? "[]"),  // ← 新增
});
```

在 `server.ts` boot 处实例化 `Scheduler` 并 `start()`;进程退出时 `clearInterval`。

## 6. 权限与安全(白名单模型)

### 6.1 为什么白名单查在 canUseTool 内,而非 SDK `allowedTools`

现状:`allowed_tools_json` → `resolveAllowedTools`(`server.ts:156` → `threads.ts:167`)→ SDK `allowedTools` 选项(`provider.ts:245`)。**SDK allowedTools 里的工具完全跳过 canUseTool**,连 `provider.ts:178` 的工作区 sandbox 一起绕过。

我们要的是:白名单命中 → 免人工审批,但 **cwd sandbox 仍兜底**(白名单"Write"不该允许写到 cwd 之外)。SDK allowedTools 无法表达"仅限 cwd 内",所以白名单必须查在 **sandbox 之后、bus 之前**。

### 6.2 provider 改动

`canUseTool`(`provider.ts:142-211`)闸门顺序变为:

```
1. AskUserQuestion → 始终走表单(不变)
2. checkWorkspaceSandbox → 越界路径直接 deny(不变,永远兜底)
3. permissionMode==="act-without-asking" → allow(不变)
4. ★ isDestructive(toolName,input) → 强制走 bus(删除硬护栏,无视白名单)
5. ★ autoApproveTools.includes(toolName) → allow(白名单命中)
6. bus.requestApproval → 挂起 awaiting_approval(不变)
```

新增 `autoApproveTools` 经由 run context 传入(`runWorker` 多一个可选参数 → `provider.run` ctx)。交互式 `POST /runs` 不传(默认 `[]`),仅 scheduler fire 时传任务白名单。**不改动现有 SDK allowedTools 路径**(交互式会话的"用户手动授权"语义保持不变)。

### 6.3 删除硬护栏 `isDestructive(toolName, input)`

保守谓词,**是 UX 安全网而非安全边界**(真正边界是 cwd sandbox)。v1 命中即强制审批:
- `Bash` 命令匹配危险正则:`rm -rf`、`rmdir`、`mkfs`、`dd `、`git push --force`、`> /` 等
- 未来若新增显式 delete/move 工具,加入此集合

随工具集增长持续扩充,文档化为"已知最佳努力清单"。

### 6.4 挂起 → 通知 → 恢复(几乎全复用)

- HITL 触发时 `interrupt-bus.ts:123` 已把 run 翻 `awaiting_approval` 并挂起等 resume。
- 用户在 app 内点进该会话 → 现成 AskUserQuestion/审批卡渲染 → `POST /runs/:runId/resume`(`runs.ts:140`)→ 续跑。
- **可选(v1 内)**:审批卡加"始终允许该工具(本任务)"勾选 → `PATCH /scheduled/:id` 把工具追加进 `allowed_tools_json`,对应 PRD"Approvals you grant during a run appear here"。
- **边界**:挂起的 run 活在 sidecar 内存(interruptBus deferred),**app 一关即丢**;重启由 `createBunSqliteRunStore.ts:52` + `server.ts:106` 的孤儿逻辑补系统提示。v1 接受。

## 7. "在等你"提示(app 内,无原生通知)

- 前端已轮询 `/conversations/status`(`store.listThreadStatuses()`)。
- 派生"待处理 = status === 'awaiting_approval' 且 conversation.scheduled_task_id != null"的计数。
- 侧边栏 Scheduled nav / 该任务卡片显示徽标;点进即那条挂起会话。
- 完成的 run 以 done/error 状态出现在该任务 run 历史里。

## 8. Sidecar API

新建 `sidecar/src/routes/scheduled.ts`(照 `conversations.ts` 套路),`server.ts` 挂载:

```
GET    /scheduled                列表
POST   /scheduled                创建 → 算 next_run_at
GET    /scheduled/:id            详情
PATCH  /scheduled/:id            改 name/desc/prompt/freq/time/enabled/allowedTools/projectId/model
                                 (freq/time/enabled 变化 → 重算 next_run_at)
DELETE /scheduled/:id            删除
POST   /scheduled/:id/run        Run now:立即 fire 一次 → { threadId, runId }
GET    /scheduled/:id/runs       run 历史:该 task 的 conversations + status
```

## 9. 前端接线

- 新建 `src/lib/data/scheduled.ts`(CRUD/list/runNow/runs,照 `conversations.ts`)+ `src/lib/data/queries.ts` 加 hooks:`useScheduledTasks` / `useScheduledTask(id)` / `useScheduledRuns(id)` / `useCreate|Update|Delete|RunNow` mutations。
- `src/lib/data/types.ts` 加真实 `ScheduledTask` 类型(镜像 `MockScheduledTask` + `id/projectId/model/nextRunAt:number/lastRunAt:number/enabled`)。
- 替换 mock:
  - `ScheduledListView.tsx`:`useScheduledTasks()` 取代 `useState(mock)`;Keep awake toggle 保留为纯 UI(v1 不真实生效,加 tooltip 说明)。
  - `NewScheduledModal.tsx`:Save → `useCreateMutation`。
  - `ScheduledDetailView.tsx`:补 next/last run、run 历史列表(点击 → 进会话)、**Always allowed 区**(增删白名单)、Run now、on/off toggle。
- 待处理徽标:Scheduled nav + 任务卡片读 `/conversations/status` 派生计数。

## 10. 现有可复用清单

| 能力 | 位置 | 说明 |
|---|---|---|
| 无前端也能跑的 fire-and-forget 执行 | `runs.ts:75` `runWorker` | scheduler 直接复用 |
| `awaiting_approval` 完整状态机 | `interrupt-bus.ts:123` / `runLoop.ts:76` | 挂起/恢复无需新建 |
| 重启孤儿 run 重整 | `createBunSqliteRunStore.ts:52,83,202` / `server.ts:106` | 补系统提示 |
| HITL 恢复端点 | `runs.ts:140` `/resume` | 续跑现成 |
| 每会话状态聚合 | `store.listThreadStatuses()` / `/conversations/status` | 待处理徽标数据源 |
| 幂等加列 | `db.ts:129` `ensureColumn` | 加 scheduled_task_id |
| canUseTool 闸门 | `provider.ts:142-211` | 白名单插第 4/5 步 |
| 工作区 sandbox | `provider.ts:178` | 永远兜底路径越界 |

## 11. 已知边界与限制

1. **仅 app 开着时触发** —— sidecar 被 Tauri 拉起、退出 `child.kill()`。与 Cowork 桌面版一致,非缺陷。
2. **挂起的 run 在 app 关闭后丢失** —— 内存态 deferred;重启补系统提示,但 HITL 状态不可续。
3. **删除硬护栏是 UX 安全网,非安全边界** —— 真正边界是 cwd sandbox;正则可被刻意绕过,不作安全保证。
4. **keep-awake toggle 为纯 UI** —— v1 不真实阻止休眠。

## 12. 实施顺序(brainstorm + spec → 直接实施,跳 writing-plans)

1. **sidecar 数据层**:`db.ts` 加表 + `scheduled_task_id` 列;`scheduledTasks.ts`(CRUD + `computeNextRunAt`)+ 单测(频率/DST/边界)。
2. **sidecar 调度器**:`scheduler.ts`(tick + fire),`server.ts` boot 接线;复用 `runWorker`。
3. **sidecar 权限**:`provider.ts` 加 `autoApproveTools` 闸门 + `isDestructive`;`runWorker` 透传。
4. **sidecar API**:`routes/scheduled.ts` + 挂载;run 历史端点。
5. **前端数据层**:`scheduled.ts` + queries hooks + `types.ts`。
6. **前端视图**:替换 3 个 mock 组件 + 详情页各 section + 待处理徽标。

每步 `bun run tsc -b --noEmit` + 相关 `*.test.ts` 通过;最后 `bunx vite build` 验证前端。

## 13. 测试要点

- `computeNextRunAt`:五种频率;**夏令时**春进/秋退;月/周边界;manual→null;时间已过→次日。
- 错过补偿:`next_run_at` 远在过去 → 只 fire 一次,推进到未来。
- tick:due 选取正确(enabled & next_run_at<=now)。
- 权限:白名单命中→allow;未命中→挂起;破坏性即使在白名单内→挂起;sandbox 仍拒 cwd 外。

## 14. V2 / 未来

原生 OS 通知 ・ keep-awake 真实生效 ・ app 关闭后仍触发(OS 级 daemon) ・ 首跑后 prompt 自动改写 ・ `/schedule` 交互式创建 skill ・ 每周星期选择器 ・ 任意 cron 表达式(届时上 `croner`)。

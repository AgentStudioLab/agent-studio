# Files Tab Artifact 检测重构

**Status:** Draft
**Date:** 2026-05-26
**Owner:** jay.yang

## 1. Background

Task 详情页右侧的 Files Tab 用来展示"agent 在本 thread 期间产出或修改的文件"。当前实现有两条数据源：

1. **直接 mutation**：扫所有 assistant 的 `Write` / `Edit` / `MultiEdit` / `NotebookEdit` tool_call，取 `args.file_path`。这条链路可靠。
2. **Bash 间接产物**：sidecar 用 `BashSideEffectsTracker`（`sidecar/src/agui/provider-claude/bash-side-effects.ts`）做 mtime diff —— PreToolUse(Bash) `readdirSync` 递归扫 cwd 拿 mtime 快照，PostToolUse 再扫一次取差集。差集通过 CUSTOM `file.side_effects` 事件挂到对应 ToolCallView 上。

这次踩雷：用户调 `agent-studio:pptx` skill 生成了一份 `.pptx`，但 Files Tab 显示"agent 还没读写文件"，聊天流里那张 "✅ 已创建" 其实是模型用 markdown 文本伪造的，**没有真正的 ArtifactInlineCard**。说明 `sideEffects` 字段根本没传到前端。

链路里几个已知失效点：

- `readdirSync` 全树扫 + Map mtime 对比，timeout 已经从 2s 调到 30s（注释见 `provider.ts:237-242`），大 monorepo 还是可能不够
- `MAX_FILES = 5000` 硬截断
- `SKIP_DIRS` 黑名单维护在 TS 里
- 任何以 `.` 开头的目录被一律跳过
- Pre 阶段扫的是 SDK 传入的 cwd，对 `cd dir && cmd` 这种切目录的命令检测不到 cd 后的目录
- `sideEffects` 仅活在 in-memory state，sidecar 进程重启或前端 fresh load 历史 messages 时丢失

另外这一条经过和用户的对齐，已确认为本次方案的硬约束：

- **不动 Anthropic 官方 skill**（pptx skill 是从官方拷贝）
- **要兼容第三方 Claude Agent SDK skill** —— 不能依赖独家 MCP announce 工具

这两个约束直接排除所有"显式声明"路径。剩下的只能是"提高侧通道精度"。

## 2. Goals

1. 把 Bash 间接产物的检测算法从 mtime 全树扫，换成 **sentinel 锚点 + 单次 Post 扫描 + birthtime 判 created/modified**
2. `sideEffects` 落到 SQLite `tool_calls.side_effects` 列，跨进程重启不丢
3. 加 hardcoded 文件黑名单（`.DS_Store` / `*.pyc` / `*.log` / `*.swp`），避免污染入库
4. 保持兼容：协议、reducer、FilesTab UI、ArtifactInlineCard 全部不动

## 3. Non-Goals

- **不引入 fs.watch / chokidar**。一次性扫已经够用，多一个长期 watcher 不值得
- **不做独立 `agent_artifacts` 表**。保留 tool_calls 关联，复用现有的 messages 接口和 reducer
- **不加缩略图 / size / 摘要等元数据**。卡片维持"路径 + 类型 + 是否新建"三件套
- **不解决用户外部编辑器同时改文件的污染**。这是侧通道方案的固有局限，但本次落表后只 hook 触发才入库，已天然过滤一部分；剩余风险可接受
- **不动 Anthropic 官方 skill 内部，不引入 MCP announce 工具**
- **不为 WebFetch 单独建链路**。WebFetch SDK 工具本身不写本地文件；agent 真要落盘只会通过 Write 或 Bash，自然走现有通道

## 4. Design

### 4.1 检测算法（sidecar）

```ts
// sidecar/src/agui/provider-claude/bash-side-effects.ts

PreToolUse(Bash, tool_use_id, cwd):
  // 写一个 sentinel 文件到系统 tmpdir，作为时间戳锚点。
  // 几乎零开销 —— 一次 writeFile，不扫树。
  sentinelPath = path.join(os.tmpdir(), `agent-studio-${tool_use_id}.sentinel`)
  fs.writeFileSync(sentinelPath, "")
  const stat = fs.statSync(sentinelPath)
  snapshots.set(tool_use_id, { sentinelMtimeMs: stat.mtimeMs, cwd, sentinelPath })

PostToolUse(Bash, tool_use_id):
  const snap = snapshots.get(tool_use_id)
  snapshots.delete(tool_use_id)
  if (!snap) {
    effects.set(tool_use_id, [])  // Pre 没触发，跳过
    return
  }

  // 单次 walk，stat 每个文件，过滤 mtimeMs > sentinelMtimeMs 的
  const changed = await walkAndFilter(snap.cwd, snap.sentinelMtimeMs)
  effects.set(tool_use_id, changed)

  try { fs.unlinkSync(snap.sentinelPath) } catch {}
```

`walkAndFilter` 内部一次 DFS，每个 file 做一次 `fs.stat`，按 mtime 阈值过滤；剩下的文件再用 `birthtime` 判 created vs modified：

```ts
async function walkAndFilter(root, sentinelMs): Promise<SideEffectFile[]> {
  const out: SideEffectFile[] = []
  await walk(root, (entry, fullPath) => {
    if (entry.isDirectory()) {
      // 黑名单目录直接 prune
      if (DENY_DIRS.has(entry.name)) return SKIP
      // 隐藏目录跳过（保留现有策略）
      if (entry.name.startsWith(".") && entry.name.length > 1) return SKIP
      return RECURSE
    }
    if (!entry.isFile()) return SKIP
    // 黑名单文件名（.DS_Store / *.pyc / *.log / *.swp）
    if (matchesAnyDenyPattern(entry.name)) return SKIP

    const s = fs.statSync(fullPath)
    if (s.mtimeMs <= sentinelMs) return SKIP

    // birthtime 在 macOS / Windows / 现代 Linux (statx) 均可用
    // 若 birthtime 不可用（落到 0 或 epoch），fallback 当 modified
    const isCreated = s.birthtimeMs > 0 && s.birthtimeMs >= sentinelMs
    out.push({ path: fullPath, kind: isCreated ? "created" : "modified" })
  })
  return out
}
```

**比当前实现的核心增益：**

| 维度 | 当前 (readdirSync mtime diff) | 新 |
|---|---|---|
| Pre 阶段 | 全树 readdir + statSync N 次 | 单次 writeFile，~0ms |
| Post 阶段 | 全树 readdir + statSync N 次 + Map diff N | 单次 walk + stat N 次 |
| 总 stat 次数 | **2N** | **N** |
| 文件上限 | 5000 (`MAX_FILES`) 截断 | 无（受 timeout 30s 实质约束）|
| cd 切目录 | 检测不到（Pre 扫了 SDK cwd） | 不受影响（仍从 task.cwd 顶层 walk）|
| 内存占用 | 整棵树 Map<path, mtimeMs> 驻留 | 仅 sentinel 路径 |

**`cd dir && cmd` 的处理：** find 也好 walk 也好，都是从 task.cwd 顶层向下，**只要文件最终落在 task.cwd 子树内就能抓到**。命令内部 cd 到了别处不影响。命令把文件写到 task.cwd **之外** —— 那本来 `deriveTouchedFiles` 也会以 `cwdPrefix` 过滤掉，是合理的产品决策（FilesTab 不展示项目外文件）。

**黑名单：**

```ts
const DENY_DIRS: ReadonlySet<string> = new Set([
  ".git", "node_modules", "dist", "build", "target",
  ".next", ".turbo", ".cache", "__pycache__", ".venv", "venv",
])

const DENY_NAME_REGEX = /^\.DS_Store$|\.pyc$|\.log$|\.swp$|~$/
```

保留现有 SKIP_DIRS 集合（除了改名 DENY_DIRS）+ 隐藏目录策略。新增文件名黑名单 `DENY_NAME_REGEX`。后续按需要扩。

**Timeout：** 保留 PostToolUse 30s。理论上 walk + N 次 stat 比当前实现快至少 2 倍，30s 余量足够。

### 4.2 持久化（sidecar）

DB schema 改动：`tool_calls` 表增加 `side_effects` TEXT 列（JSON）。

```ts
// sidecar/src/db.ts → migrate()
ensureColumn(db, "tool_calls", "side_effects", "TEXT");
```

`MessagesService.completeToolCall` 签名扩展，把 `sideEffects` 一并写入：

```ts
completeToolCall(
  id: string,
  payload: {
    result: unknown;
    status: "success" | "error";
    errorMsg?: string;
    sideEffects?: SideEffectFile[];  // NEW
  },
): void {
  this.db.prepare(
    `UPDATE tool_calls SET result = ?, status = ?, error_msg = ?, side_effects = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(payload.result ?? null),
    payload.status,
    payload.errorMsg ?? null,
    payload.sideEffects ? JSON.stringify(payload.sideEffects) : null,
    id,
  )
}
```

**写入时机：** `bridge.ts:424-436` 已经在 tool_result 之后 `tracker.takeEffects()`；现在把这次 take 出来的 effects 同时透出给 `onToolCallResult` 回调（或上层持久化 hook），让 messages service 写表。改动点小，单点。

**读取时机：** `MessagesService.listByThread` 反序列化 `side_effects` 字段挂到 `ToolCallDTO`，沿现有 message API 一并返回前端。

### 4.3 协议与前端（不动）

- **CUSTOM `file.side_effects` 事件协议不变**。bridge 仍在 TOOL_CALL_RESULT 后 emit 一次，给 live 流的 reducer 用。
- **reducer 的 CUSTOM 处理不变**（`src/lib/agui/runtime/reducer.ts:210-228`），仍把 effects 挂到 `toolCall.sideEffects`。
- **historicalMessages 路径** —— reducer 在 `setHistorical` 时本来就读 `toolCall.sideEffects`（如果存在）；只要 messages API 把 DB 里的 side_effects 字段透传到 ToolCallView，历史 thread 也能展示。
- **`deriveTouchedFiles` 不变**（`src/lib/agui/runtime/derivations.ts:155-189`）。它已经支持读 `tool_call.sideEffects`。
- **FilesTab 不变**（`src/features/task/FilesTab.tsx`）。
- **ArtifactInlineCard 渲染 / `mutationToolCallsToArtifacts` 不变**（`src/features/task/ChatStream.tsx:112-146`）。它也已经支持读 sideEffects。

也就是说**前端零改动**。所有改动落在 sidecar：

```
sidecar/src/agui/provider-claude/bash-side-effects.ts   核心算法重写
sidecar/src/agui/provider-claude/bridge.ts              透传 effects 到持久化回调
sidecar/src/db.ts                                       加列
sidecar/src/services/messages.ts                        upsert + read 加字段
sidecar/src/agui/server.ts (or persistor)               把 effects 传给 completeToolCall
```

## 5. 测试策略

1. **`bash-side-effects.test.ts` 重写**
   - 不再 mock fs.readdirSync 内存树。改用 `node:fs.mkdtempSync` 真实写 tmp 目录，里面布置文件 / 子目录 / 隐藏目录 / 黑名单文件
   - case：Pre/Post 之间新增文件 → 出现在 effects 且 kind=created
   - case：Pre 之前已存在的文件，Post 期间修改 → kind=modified
   - case：Pre/Post 间未触碰的文件 → 不出现
   - case：黑名单文件名 / 黑名单目录 → 不出现
   - case：`cd subdir` 后写入 → 仍能抓到（实质上写文件 syscall 不经 hook，只看最终落盘）
   - case：Pre 没触发就 Post（hook 漏触发）→ effects=[]，不抛错
2. **持久化端到端**（新增 `bridge-persistence.test.ts` 或扩 `bridge.test.ts`）
   - 跑一次假 SDK 流：Bash tool_use → tool_result，验证 SQL 写入的 `side_effects` 列非空且 JSON 可解
   - 调 `listByThread`，验证 ToolCallDTO.sideEffects 正确
3. **前端 reducer**（已有 `reducer.test.ts`）
   - `setHistorical` 后 toolCall.sideEffects 正确还原
4. **手动验证**
   - 重现截图场景：tiptap-markdown 项目跑 pptx skill，确认 FilesTab 出现 .pptx，ArtifactInlineCard 也出现
   - 关闭并重开 app，进入同一 thread，确认 FilesTab 仍能看到这个 .pptx

## 6. Rollout / Rollback

- DB 迁移用 `ensureColumn`，列添加可向后兼容（旧版前端读不到没事，新版前端读到 null 也没事）
- 没有 feature flag。bash-side-effects.ts 实现整体替换；保留 takeEffects 接口签名不变以便回滚 git revert 一个 commit 就行
- Rollback 风险：DB 多出来的 side_effects 列对老版本无影响

## 7. 后续工作（不在本次范围）

- **跨 thread 项目级 artifact 历史面板**。本次保留 tool_calls 关联，未来如果想做"这个项目 agent 都生成过哪些 deliverable"，再升到独立 `agent_artifacts` 表
- **缩略图 / size / 摘要元数据**。需要 sidecar 配合本地渲染（pptx → 首页 png 等），成本高，单独立项
- **WebFetch 下载文件追踪**。当前判断 WebFetch 不会直接写盘，将来如果有"WebFetch 缓存到本地"的功能再做
- **MCP server 工具产物追踪**。MCP server 调用的 cwd 可能不在 task.cwd 内，现有协议没覆盖，需要扩 MCP 协议

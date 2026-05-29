# 重新生成对话轮次（Regenerate Turn）设计

- 日期：2026-05-29
- 状态：待 review
- 触发来源：对话详情中 user 气泡下的占位 RotateCcw 按钮（目前无 onClick）

## 目标

让用户在对话详情里对**任意一条历史 user 消息**点击"重新生成"，效果是：

1. **砍掉该 user 消息之后的所有轮次**（对话内容从 DB 删除）；
2. **回滚该轮产生的文件改动**（仅限 Write / Edit / NotebookEdit，见限制）；
3. 用**同一句** prompt 重新跑，产出新的助手回答。

语义是"从这一问重跑"，纯重新生成，不支持编辑后重发。

## 非目标（明确不做）

- **不做编辑后重发**：user 气泡不变成可编辑文本框。以后若要，后端就是本方案 + 前端加一个内联编辑态，是纯增量。
- **不在 assistant 气泡加入口**：只保留 user 气泡一个入口，降低心智。
- **不回滚 Bash 产物**：SDK checkpointing 只追踪 Write/Edit/NotebookEdit，`echo >` / `sed -i` / `python x.py` 写出的文件无法回滚（见下）。
- **不支持老对话的文件回滚**：checkpointing 非追溯，只对本功能上线后产生的轮次有快照。老对话重新生成时只回滚对话、不动文件。
- **不暴露分支历史**：不 fork，旧分支不单独保留也不展示。

## 关键 SDK 事实与约束（已查证）

来源：[File checkpointing](https://code.claude.com/docs/en/agent-sdk/file-checkpointing)、bundled `claude-agent-sdk-reference`（sessions / options / messages / query-object）。

1. **checkpointing 不依赖 git**。SDK 在每次 Write/Edit/NotebookEdit 改文件**前**自建原文件快照（与 session 绑定），不创建 commit、不动用户工作区/git 历史。`rewindFiles` 只还原磁盘文件，**不回滚对话**。
2. **只追踪 Write/Edit/NotebookEdit**。Bash 命令产生/修改的文件不在追踪范围。→ 本 app 大量经 Bash 产文件（见 `bash-side-effects.ts`），所以文件回滚是**部分能力**，UI 必须诚实说明。
3. **非追溯**：`enableFileCheckpointing` 默认 `false`，只能回滚开启之后产生的快照。
4. **要拿到 user 消息 uuid 必须加 `extraArgs: { 'replay-user-messages': null }`**。开启后 SDK 把 user 消息**带 uuid** 回放进 stream（单 prompt 模式同样适用）。这是我们落库 `sdk_uuid` 的来源。
5. **`rewindFiles` 必须在活的 query 上调**，不能在原 stream 结束后调（否则报 `ProcessTransport is not ready`）。正确姿势：`resume` + **空 prompt** 开一个 query，在第一条消息上调 `rewindFiles(uuid)` 然后 break、close。
6. **checkpoints 与创建它的 session 绑定**。→ 这是"不 fork"的核心理由：fork 出新 session 后旧快照不保证可用。
7. `resumeSessionAt: <uuid>` 把会话"恢复到该消息（含）为止"；不传 `forkSession` 则在**同一 session_id** 上续写。`SDKAssistantMessage.uuid` 必有；`SDKUserMessage.uuid?` 仅在开了 replay-user-messages 时出现。

## ⚠️ 必须先做的 Spike（验证后再铺全流程）

以下 SDK 交互文档没说死，**实现前先用一个最小脚本验证**（按 claude-agent-sdk-reference skill 要求，不确定的交互先验真）：

- **S1**：单 prompt 模式 + `replay-user-messages`，能否稳定从 stream 拿到本轮 user 消息的 uuid（区分 `isReplay`、排除 tool_result user 消息）。
- **S2**：`resumeSessionAt(A_{N-1}.uuid)` **不 fork** 时，是否正确把活动上下文截断到该点、再续写（旧 tail 不再进上下文），且 session_id 不变。
- **S3**：两段式时序——先 `resume + 空prompt + rewindFiles(U_N.uuid)` 回滚文件、close，再 `resume + resumeSessionAt(A_{N-1}) + 重发 U_N` 续跑，文件与对话状态都正确。
- **S4**：`rewindFiles` 对老对话（无快照）返回 `RewindFilesResult.canRewind=false`，能据此安全跳过。

若 S2 证明 resumeSessionAt 不 fork 无法正确截断，则**回退到 fork 方案**并接受"文件回滚只在 fork 前的 session 上做、fork 后新分支重新积累快照"。

## 数据模型变更

`messages` 表加一列：

```sql
ALTER TABLE messages ADD COLUMN sdk_uuid TEXT;  -- SDK 侧消息 uuid，nullable
```

- assistant 行：来自 bridge 的 `am.uuid`（必有）。供 `resumeSessionAt` 锚点（第 N-1 轮最后一条 assistant）。
- user 行：来自开启 replay-user-messages 后 stream 里本轮 user 消息的 uuid。供 `rewindFiles` 的 checkpoint。
- 老数据该列为 NULL → 视为"无 sdk_uuid"，文件回滚跳过、对话回滚降级（见边界）。

`MessageService` 新增：

- `getById(id): MessageRow | undefined`
- `deleteFromMessage(threadId, messageId)`：删除该 thread 中目标消息**及其之后**的所有 `messages` 行与关联 `tool_calls`（按 created_at；tool_calls 经 FK cascade 或显式删）。
- 给 `appendAssistant` / 落 user uuid 的写入路径补 `sdk_uuid`。

## 全局 query option 变更（provider.ts）

`runTurn` 的 sdkQuery options **始终**加：

```ts
enableFileCheckpointing: true,
extraArgs: { "replay-user-messages": null },
```

注意：开启 replay-user-messages 后，bridge 的 `m.type === "user"` 分支会多收到"纯文本 user 消息"事件（现有逻辑只处理 tool_result 块，纯文本消息走到循环里是 no-op，安全）。新增的只是 uuid 捕获。

## bridge.ts 变更

- 新增可选回调 `onUserMessageId(uuid: string)`：当遇到**非 replay、非 tool_result** 的 user 消息（即本轮真实 prompt）且带 uuid 时触发一次。
- `onMessageEnd` 的 payload 增加 `sdkUuid`（来自 `am.uuid`），落到 assistant 行。

## 后端流程

### 新接口

`POST /threads/:threadId/regenerate`，body `{ fromMessageId: string }`（要重跑的那条 user 消息的 DB id）。返回 `202 + { runId }`，随后前端按现有 `/runs/:runId/events` SSE 消费。

### 处理步骤（regenerate 路由内）

1. 校验：`fromMessageId` 必须存在、role 为 user、属于该 thread。
2. 定位第 N 轮 user 消息 `U_N`、它的文本、它的 `sdk_uuid`；以及第 N-1 轮**最后一条 assistant** 的 `sdk_uuid`（记 `resumeAtUuid`，N=1 则为 null）。
3. **文件回滚**（仅当 `U_N.sdk_uuid` 存在且 checkpointing 有快照）：
   - 调新 helper `rewindThreadFiles(threadId, cwd, checkpointUuid)`：`resume + 空prompt` 开 query → 第一条消息上 `await q.rewindFiles(checkpointUuid)` → break/close。
   - `canRewind=false`（老对话/无快照）→ 跳过，记一条提示（不阻断）。
4. **截断 DB**：`messages.deleteFromMessage(threadId, U_N.id)`（删 U_N 及之后所有）。
5. **跑重生成轮**：复用 `runWorker` 路径（与 `POST /runs` 同），但带新字段：
   - runWorker 重新 `appendUser(threadId, U_N.content)`（产生新 user 行，bridge 回捕新 sdk_uuid）。
   - 经 RunContext 传 `resumeSessionAt: resumeAtUuid`（不 fork）。
6. 旧 runs/events 记录可不清理（聊天历史从 messages 表渲染，stale run 不会显示）。如需可作为二期清理。

### provider / RunContext 变更

- `RunContext` 增加可选 `resumeSessionAt?: string`。
- `runTurn`：若 `ctx.resumeSessionAt` 存在，options 里加 `resumeSessionAt`（仍用现有 `getResumeSessionId` 拿 `resume` 的 sessionId；不 fork，所以 session_id 不变，无需改 tag 逻辑）。

## 前端流程

- `UserMessage.tsx`：RotateCcw 接 `onClick`。
  - 计算"该轮之后是否还有内容"（父组件传入 turn 在列表中的位置 / 是否末轮）。
  - 若有后续内容或可能有文件改动 → 弹 `AlertDialog`（复用现有破坏性弹窗样式），文案写明"将删除其后 N 轮对话，并回滚本轮通过编辑产生的文件改动（不含脚本/命令生成的文件）"。
  - 末轮且无改动 → 可一键直跑。
- 调用新增 data 层函数（`src/lib/data/conversations.ts` 风格）`regenerateFromMessage(threadId, messageId)` → `fetchSidecar` POST，拿到 `runId`，接现有 run/SSE 消费链路。
- 成功后：失效该会话 messages 查询（截断后的历史）+ 跟随新 run 流式渲染。

## 边界与降级

- **第一轮（N=1）**：无 `resumeAtUuid` → 不 resume，等于全新 query 重跑；文件回滚到 U_1 checkpoint（若有）。
- **老对话 / sdk_uuid 为 NULL**：
  - 文件回滚：跳过（无快照）。
  - 对话回滚（resumeSessionAt 无锚点 uuid）：降级为"仅 DB 截断 + 普通 resume 续跑"——会丢失"严格回到 N-1 上下文"的精度（SDK 上下文可能仍含被删轮次）。UI 对老对话可提示能力受限。
- **rewindFiles 报错**：记 warn，不阻断对话重生成（文件保持现状）。
- **abort/并发**：重生成本质是一个新 run，沿用现有 aborter / interruptBus；进行中再次触发按现有 run 互斥处理。

## 验证计划

- **Spike 脚本**（sidecar 内一次性）：跑通 S1–S4，确认不 fork 路径成立。
- 后端：`bunx tsc --noEmit` + `bun test`（新增 regenerate 路由 + MessageService.deleteFromMessage 的单测）。
- 前端：`bunx tsc -b --noEmit` + `bunx vite build`。
- 手测（`bun run tauri:dev` 重编 sidecar）：
  1. 多轮对话，重生成中间某轮 → 其后轮次消失、得到新回答。
  2. 该轮经 Edit 改过的文件被还原；经 Bash 生成的文件**未**还原（符合说明）。
  3. 老对话重生成 → 对话截断生效、文件不动、无报错。

## 开放风险

- Spike S2 结果决定 fork/不 fork；不 fork 不成立则回退 fork（spec 第 "Spike" 节已给回退口径）。
- `replay-user-messages` 是否影响现有 usage/审计 hook 的事件计数（多了 user 回放事件）——spike 时一并观察。

# 远程 IM 连接实施计划

> **面向 agentic workers：** 必须使用子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 构建 sidecar 原生的远程 IM 任务子系统，自动化验收以 fake channel 端到端为准；微信作为 experimental adapter，参考 AionUI 实现做手工 smoke，不承诺可稳定自动化 E2E。

**架构：** 新增 `sidecar/src/channels/` 领域，负责通道连接、session、消息聚合、remote task、输出文件协议和插件生命周期。fake channel 是首个自动化可验收通道，用来证明 `ChannelManager -> RemoteTaskAggregator -> RemoteTaskService -> runWorker -> completion -> plugin.send` 主链可恢复、可测试；微信插件复用 `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin` 的 QR、getupdates、sendmessage、CDN/AES 媒体逻辑，但只进入手工 smoke checklist。AGUI provider 不感知任何 IM 平台。

**技术栈：** Bun + Hono + bun:sqlite sidecar、React 19 + TypeScript + TanStack Query 前端、Bun 测试运行器、现有 AGUI 事件溯源 run engine。

---

## 重要边界

- 自动化 E2E 只使用 fake channel。fake channel 必须覆盖文本输入、文件输入、run 完成、摘要回发和输出文件回发。
- 微信不作为 CI 或自动化端到端验收条件。微信接入只要求迁移 AionUI 中已经验证过的协议能力，并提供手工 smoke checklist。
- 首版只支持 `auto_execute`。`interactive_approval` 在 Settings UI 中显示为未支持或不可选。远程用户不在 Agent Works UI 内，未设计微信内审批协议前不能让 run 停在 `awaiting_approval`。
- remote task 必须持久化 `chat_id`、`sender_id`、`context_token`、`run_id`、`connection_id`、`reply_state`。sidecar 重启后允许模型执行被标记失败，但不能让远程任务永久卡在 running。
- 回发文件只能来自当前 remote task 的 `output/`。协议块从用户可见摘要中移除。
- 不改 AGUI provider 抽象，不让 `runLoop` 感知微信或 fake channel。

---

## AionUI 微信参考实现

执行微信相关任务前先读取这些文件：

- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinLogin.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinMonitor.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinPlugin.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinAdapter.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinTyping.ts`

迁移时保留的协议事实：

- QR 登录使用 `ilink/bot/get_bot_qrcode` 和 `ilink/bot/get_qrcode_status`。
- 消息轮询使用 `ilink/bot/getupdates`，并持久化 `get_updates_buf`。
- 文本发送使用 `ilink/bot/sendmessage`。
- 媒体发送使用 `ilink/bot/getuploadurl`、微信 CDN 上传、AES-128-ECB 和 media `sendmessage`。
- 附件下载使用微信 CDN `download?encrypted_query_param=...`，并按 AES key 解密。
- 每条入站消息的 `context_token` 必须保存到 remote task，后续文本和媒体回发都要带上。

---

## 文件结构

创建后端通道领域：

- `sidecar/src/channels/core/ChannelTypes.ts`：共享通道、连接、session、message、outgoing file、reply state 类型。
- `sidecar/src/channels/core/ChannelConnectionService.ts`：`channel_connections` 增删改查。
- `sidecar/src/channels/core/ChannelSessionService.ts`：基于 `connectionId + chatId + senderId` 的 session 查询、创建、active task 更新。
- `sidecar/src/channels/core/PluginRegistry.ts`：插件注册与查找。
- `sidecar/src/channels/core/ChannelManager.ts`：插件生命周期、入站消息分发、pending 聚合、completion 回发。
- `sidecar/src/channels/plugins/fake/FakeChannelPlugin.ts`：测试用 fake channel，可注入入站消息并记录出站消息。
- `sidecar/src/channels/plugins/weixin/WeixinLogin.ts`：experimental QR 登录，参考 AionUI。
- `sidecar/src/channels/plugins/weixin/WeixinMonitor.ts`：experimental getupdates、附件下载、sendmessage、媒体上传，参考 AionUI。
- `sidecar/src/channels/plugins/weixin/WeixinPlugin.ts`：experimental 微信插件适配到统一 plugin 接口。
- `sidecar/src/channels/plugins/weixin/WeixinAdapter.ts`：微信原生消息到统一入站消息。
- `sidecar/src/channels/tasks/RemoteSendProtocol.ts`：解析 `[AGENT_WORKS_REMOTE_SEND]`，校验 `output/` 文件。
- `sidecar/src/channels/tasks/RemoteTaskAggregator.ts`：30 秒文本/文件聚合，同 session 并发保护。
- `sidecar/src/channels/tasks/RemoteTaskService.ts`：创建任务目录、conversation、run，记录完成状态和补偿。
- `sidecar/src/channels/routes/channelConnections.ts`：连接列表、启停、更新、fake test trigger、微信 QR 状态。
- `sidecar/src/channels/routes/remoteTasks.ts`：近期 remote tasks 状态。

修改现有后端：

- `sidecar/src/db.ts`：新增 `channel_connections`、`channel_sessions`、`remote_tasks`。
- `sidecar/src/agent/runWorker.ts`：新增内部 `appendContextExtra` 与 `onTerminalResult`。
- `sidecar/src/routes/runs.ts`：保持公开 `/runs` 不接收 `appendContextExtra` 或 `onTerminalResult`。
- `sidecar/src/server.ts`：实例化 channel services、registry、manager、routes；启动 enabled connections；启动时执行 remote task 补偿。

创建前端：

- `src/lib/data/channel-connections.ts`
- `src/lib/data/channel-connections-queries.ts`
- `src/features/settings/sections/RemoteConnectionsSection.tsx`
- `src/features/settings/sections/RemoteConnectionsSection.test.tsx`

修改前端：

- `src/features/settings/SettingsLayout.tsx`
- `src/features/settings/SettingsLayout.test.tsx`
- `src/app/RouterView.tsx`
- `src/i18n/locales/en/settings.json`
- `src/i18n/locales/zh/settings.json`

---

## 任务 1：DB Schema 与核心类型

**文件：**
- 修改：`sidecar/src/db.ts`
- 创建：`sidecar/src/channels/core/ChannelTypes.ts`
- 创建：`sidecar/src/channels/core/ChannelConnectionService.ts`
- 创建：`sidecar/src/channels/core/ChannelSessionService.ts`
- 创建：`sidecar/src/channels/core/ChannelConnectionService.test.ts`
- 创建：`sidecar/src/channels/core/ChannelSessionService.test.ts`

- [ ] **步骤 1：编写失败测试**

覆盖以下行为：

- 创建 fake 和 weixin connection。
- credentials 不从列表 API 返回给前端，但 service 内部可读。
- `permissionStrategy` 只接受 `auto_execute`。
- session 按 `connectionId + chatId + senderId` 复用。
- session 可以设置和清除 `activeTaskId`。

运行：

```bash
cd sidecar && bun test src/channels/core/ChannelConnectionService.test.ts src/channels/core/ChannelSessionService.test.ts
```

预期：FAIL，核心文件不存在。

- [ ] **步骤 2：新增 DB schema**

在 `sidecar/src/db.ts` 的 `SCHEMA` 中新增：

```sql
CREATE TABLE IF NOT EXISTS channel_connections (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  name              TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  credentials_json  TEXT,
  config_json       TEXT NOT NULL,
  last_connected_at INTEGER,
  error_msg         TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_connections_type ON channel_connections (type);
CREATE INDEX IF NOT EXISTS idx_channel_connections_enabled ON channel_connections (enabled);

CREATE TABLE IF NOT EXISTS channel_sessions (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  chat_id         TEXT NOT NULL,
  sender_id       TEXT NOT NULL,
  display_name    TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  active_task_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_sessions_identity
  ON channel_sessions (connection_id, chat_id, sender_id);

CREATE TABLE IF NOT EXISTS remote_tasks (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES channel_sessions(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id            TEXT,
  channel_type      TEXT NOT NULL,
  chat_id           TEXT NOT NULL,
  sender_id         TEXT NOT NULL,
  context_token     TEXT,
  status            TEXT NOT NULL,
  reply_state       TEXT NOT NULL DEFAULT 'pending',
  instruction_text  TEXT,
  input_dir         TEXT NOT NULL,
  output_dir        TEXT NOT NULL,
  result_summary    TEXT,
  result_files_json TEXT,
  error_msg         TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_session ON remote_tasks (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_run ON remote_tasks (run_id);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_status ON remote_tasks (status);
CREATE INDEX IF NOT EXISTS idx_remote_tasks_reply_state ON remote_tasks (reply_state);
```

在 `migrate(db)` 中为这些列添加 `ensureColumn`，保证旧 DB 可升级。

- [ ] **步骤 3：实现类型和 services**

类型要求：

```ts
export type ChannelType = "fake" | "weixin" | "dingtalk" | "lark" | "qq" | "wecom" | "telegram" | "discord";
export type ChannelConnectionStatus = "stopped" | "waiting_qr" | "scanned" | "running" | "error";
export type ChannelPermissionStrategy = "auto_execute";
export type RemoteTaskStatus = "awaiting_file" | "awaiting_instruction" | "running" | "completed" | "failed";
export type RemoteTaskReplyState = "pending" | "sent" | "failed" | "manual_check";
```

`ChannelConnectionService` 必须提供：

- `create`
- `get`
- `list`
- `listEnabled`
- `update`
- `updateStatus`

`ChannelSessionService` 必须提供：

- `find(connectionId, chatId, senderId)`
- `getOrCreate`
- `setActiveTask`
- `clearActiveTask`

- [ ] **步骤 4：运行测试**

```bash
cd sidecar && bun test src/channels/core/ChannelConnectionService.test.ts src/channels/core/ChannelSessionService.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add sidecar/src/db.ts sidecar/src/channels/core
git commit -m "feat(remote-im): add channel persistence"
```

---

## 任务 2：远程发送协议

**文件：**
- 创建：`sidecar/src/channels/tasks/RemoteSendProtocol.ts`
- 创建：`sidecar/src/channels/tasks/RemoteSendProtocol.test.ts`

- [ ] **步骤 1：编写失败测试**

覆盖以下行为：

- 从 assistant 文本中解析多个 `[AGENT_WORKS_REMOTE_SEND]...[/AGENT_WORKS_REMOTE_SEND]` 块。
- malformed block 留在 visible text，不生成发送 action。
- 相对路径必须解析到 workspace root 下。
- 最终文件必须在当前 task `outputDir` 真实路径内。
- symlink 指向 `outputDir` 外必须拒绝。
- 缺失文件、目录、超过 200MB 文件必须拒绝。

运行：

```bash
cd sidecar && bun test src/channels/tasks/RemoteSendProtocol.test.ts
```

预期：FAIL，文件不存在。

- [ ] **步骤 2：实现协议解析器**

实现导出：

```ts
export type RemoteSendType = "file" | "image";
export type RemoteSendRejectReason = "not_found" | "outside_output" | "not_file" | "too_large";

export interface RemoteSendAction {
  type: RemoteSendType;
  path: string;
  fileName?: string;
  caption?: string;
}

export function parseRemoteSendProtocol(content: string): {
  visibleText: string;
  actions: RemoteSendAction[];
}

export function resolveRemoteSendProtocol(input: {
  content: string;
  workspaceRoot: string;
  outputDir: string;
}): {
  visibleText: string;
  files: Array<{ type: RemoteSendType; path: string; fileName?: string; caption?: string }>;
  rejected: Array<RemoteSendAction & { reason: RemoteSendRejectReason }>;
}
```

- [ ] **步骤 3：运行测试**

```bash
cd sidecar && bun test src/channels/tasks/RemoteSendProtocol.test.ts
```

预期：PASS。

- [ ] **步骤 4：提交**

```bash
git add sidecar/src/channels/tasks/RemoteSendProtocol.ts sidecar/src/channels/tasks/RemoteSendProtocol.test.ts
git commit -m "feat(remote-im): add remote send protocol"
```

---

## 任务 3：Aggregator 与 fake channel 插件

**文件：**
- 创建：`sidecar/src/channels/tasks/RemoteTaskAggregator.ts`
- 创建：`sidecar/src/channels/tasks/RemoteTaskAggregator.test.ts`
- 创建：`sidecar/src/channels/core/PluginRegistry.ts`
- 创建：`sidecar/src/channels/plugins/fake/FakeChannelPlugin.ts`
- 创建：`sidecar/src/channels/plugins/fake/FakeChannelPlugin.test.ts`

- [ ] **步骤 1：编写 aggregator 失败测试**

覆盖：

- 先文本后文件，立即 ready。
- 先文件后文本，立即 ready。
- 只有文本 30 秒后产出 `ask_for_file`。
- 只有文件 30 秒后产出 `ask_for_instruction`。
- session 有 active task 时返回 busy。
- ready 结果必须携带 `contextToken`。

运行：

```bash
cd sidecar && bun test src/channels/tasks/RemoteTaskAggregator.test.ts
```

预期：FAIL。

- [ ] **步骤 2：实现 aggregator**

统一入站消息类型包含：

```ts
export interface UnifiedIncomingMessage {
  id: string;
  connectionId: string;
  channelType: ChannelType;
  chatId: string;
  senderId: string;
  displayName?: string;
  text?: string;
  attachments: UnifiedIncomingAttachment[];
  contextToken?: string;
  timestamp: number;
  raw?: unknown;
}
```

`RemoteTaskAggregator` 输出：

```ts
type AggregatorResult =
  | { type: "ignored" }
  | { type: "wait_for_file" }
  | { type: "wait_for_instruction" }
  | { type: "busy"; text: string }
  | {
      type: "ready";
      instructionText: string;
      attachments: UnifiedIncomingAttachment[];
      contextToken?: string;
    };
```

- [ ] **步骤 3：编写 fake plugin 失败测试**

Fake plugin 必须支持：

- `emitIncoming(message)` 触发注册的 handler。
- `send(connectionId, outgoing)` 记录到 `sentMessages`。
- `clear()` 清空记录。

运行：

```bash
cd sidecar && bun test src/channels/plugins/fake/FakeChannelPlugin.test.ts
```

预期：FAIL。

- [ ] **步骤 4：实现 registry 和 fake plugin**

`ChannelPlugin` 接口：

```ts
export interface ChannelPlugin {
  readonly type: ChannelType;
  start(connection: ChannelConnection): Promise<void>;
  stop(connectionId: string): Promise<void>;
  send(connectionId: string, message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string }): Promise<void>;
  onMessage?(handler: (message: UnifiedIncomingMessage) => Promise<void>): void;
}
```

- [ ] **步骤 5：运行测试**

```bash
cd sidecar && bun test src/channels/tasks/RemoteTaskAggregator.test.ts src/channels/plugins/fake/FakeChannelPlugin.test.ts
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add sidecar/src/channels/tasks/RemoteTaskAggregator.ts sidecar/src/channels/tasks/RemoteTaskAggregator.test.ts sidecar/src/channels/core/PluginRegistry.ts sidecar/src/channels/plugins/fake
git commit -m "feat(remote-im): add fake channel aggregation"
```

---

## 任务 4：RemoteTaskService 与 runWorker completion

**文件：**
- 修改：`sidecar/src/agent/runWorker.ts`
- 修改：`sidecar/src/routes/runs.ts`
- 创建：`sidecar/src/channels/tasks/RemoteTaskService.ts`
- 创建：`sidecar/src/channels/tasks/RemoteTaskService.test.ts`

- [ ] **步骤 1：编写 runWorker completion 失败测试**

在 `sidecar/src/agent/runWorker.test.ts` 中新增测试：

- `appendContextExtra` 被拼入 provider `appendContext`。
- `onTerminalResult` 在 run terminal 后被调用。
- `onTerminalResult` 收到 terminal status、最终 assistant text、error message。
- 公开 route body 即使带 `appendContextExtra` 也不会传给 runWorker。

运行：

```bash
cd sidecar && bun test src/agent/runWorker.test.ts src/routes/runs.test.ts
```

预期：FAIL。

- [ ] **步骤 2：扩展 runWorker 内部输入**

`RunWorkerInput` 新增：

```ts
appendContextExtra?: string;
onTerminalResult?: (result: {
  status: "completed" | "error" | "cancelled" | "awaiting_approval";
  assistantText: string;
  errorMsg?: string;
}) => Promise<void>;
```

实现要求：

- `appendContextExtra` 只在 `runWorker` 内部使用。
- `/runs`、`/threads/:id/regenerate` 不从公开 request body 读取它。
- terminal callback 在 buffer flush 后调用，避免 completion 读取不到 assistant。
- `onTerminalResult` 抛错时不能破坏 run terminal 状态；错误由 remote task 记录。

- [ ] **步骤 3：编写 RemoteTaskService 失败测试**

覆盖：

- 创建 task 时复制附件到 `remote-tasks/<taskId>/input/`，创建 `output/`。
- 创建或复用 conversation 和 session。
- 创建 run row 并调用注入的 `startRun`。
- run completed 后解析 `[AGENT_WORKS_REMOTE_SEND]`，更新 `remote_tasks` 为 completed。
- run error 后更新 failed。
- 启动补偿：running task 对应 run 已 completed 时补发；run 已 error 时 failed。

运行：

```bash
cd sidecar && bun test src/channels/tasks/RemoteTaskService.test.ts
```

预期：FAIL。

- [ ] **步骤 4：实现 RemoteTaskService**

服务依赖中不要通过其他 service 偷拿 DB。构造函数显式接收 `db`：

```ts
constructor(private deps: {
  db: Database;
  connections: ChannelConnectionService;
  sessions: ChannelSessionService;
  threads: ThreadService;
  messages: MessageService;
  store: RunEventStore;
  startRun: (input: RemoteTaskRunInput) => Promise<void>;
  sendResult: (input: RemoteTaskSendInput) => Promise<void>;
}) {}
```

`RemoteTaskRunInput` 至少包含：

```ts
{
  runId: string;
  threadId: string;
  prompt: string;
  appendContextExtra: string;
  permissionMode: "act-without-asking";
  onTerminalResult: RunWorkerInput["onTerminalResult"];
}
```

`RemoteTaskSendInput` 至少包含：

```ts
{
  taskId: string;
  connectionId: string;
  channelType: ChannelType;
  chatId: string;
  contextToken?: string;
  text: string;
  files: Array<{ type: "file" | "image"; path: string; fileName?: string; caption?: string }>;
}
```

- [ ] **步骤 5：运行测试**

```bash
cd sidecar && bun test src/agent/runWorker.test.ts src/routes/runs.test.ts src/channels/tasks/RemoteTaskService.test.ts
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add sidecar/src/agent/runWorker.ts sidecar/src/routes/runs.ts sidecar/src/channels/tasks/RemoteTaskService.ts sidecar/src/channels/tasks/RemoteTaskService.test.ts
git commit -m "feat(remote-im): run remote tasks to completion"
```

---

## 任务 5：ChannelManager、routes 与 fake 自动化 E2E

**文件：**
- 创建：`sidecar/src/channels/core/ChannelManager.ts`
- 创建：`sidecar/src/channels/core/ChannelManager.test.ts`
- 创建：`sidecar/src/channels/routes/channelConnections.ts`
- 创建：`sidecar/src/channels/routes/channelConnections.test.ts`
- 创建：`sidecar/src/channels/routes/remoteTasks.ts`
- 创建：`sidecar/src/channels/e2e/FakeRemoteTaskE2E.test.ts`
- 修改：`sidecar/src/server.ts`

- [ ] **步骤 1：编写 manager 失败测试**

覆盖：

- enabled connection 启动 plugin 并更新 status。
- plugin 入站消息进入 aggregator。
- ready aggregate 调用 `RemoteTaskService.createReadyTask`。
- busy 结果通过 plugin.send 回发。
- completion 结果通过 plugin.send 回发文本和文件。

运行：

```bash
cd sidecar && bun test src/channels/core/ChannelManager.test.ts
```

预期：FAIL。

- [ ] **步骤 2：实现 ChannelManager**

`ChannelManager` 负责：

- `startEnabled()`
- `start(connectionId)`
- `stop(connectionId)`
- `attachPluginHandlers()`
- `sendRemoteTaskResult(input)`
- `recoverRemoteTasksOnBoot()`

`sendRemoteTaskResult` 根据 `channelType` 找 plugin，并传入 `chatId`、`contextToken`、`text`、`files`。

- [ ] **步骤 3：编写 routes 失败测试**

覆盖：

- `GET /channels/connections`
- `PATCH /channels/connections/:id`
- `POST /channels/connections/:id/enable`
- `POST /channels/connections/:id/disable`
- `POST /channels/fake/:id/incoming`，测试触发 fake 入站消息。
- `GET /channels/remote-tasks/recent`

运行：

```bash
cd sidecar && bun test src/channels/routes/channelConnections.test.ts
```

预期：FAIL。

- [ ] **步骤 4：实现 routes**

fake incoming route 只在 sidecar 内部 bearer auth 后可用，不暴露额外鉴权例外。body：

```ts
{
  chatId: string;
  senderId: string;
  text?: string;
  attachments?: Array<{ type: "file" | "image"; path: string; name: string }>;
}
```

- [ ] **步骤 5：编写 fake E2E 失败测试**

`FakeRemoteTaskE2E.test.ts` 使用 fake provider 或 stubbed `startRun`，证明：

1. fake channel 入站文本 + 文件。
2. remote task 创建 run。
3. terminal assistant text 包含 `[AGENT_WORKS_REMOTE_SEND]`。
4. output 文件解析成功。
5. fake plugin 收到摘要和文件。
6. `remote_tasks.reply_state = 'sent'`。

运行：

```bash
cd sidecar && bun test src/channels/e2e/FakeRemoteTaskE2E.test.ts
```

预期：FAIL。

- [ ] **步骤 6：连接 server**

在 `sidecar/src/server.ts` 中：

- 创建 `ChannelConnectionService`
- 创建 `ChannelSessionService`
- 创建 `PluginRegistry`
- 注册 `FakeChannelPlugin`
- 注册 experimental `WeixinPlugin`
- 创建 `RemoteTaskService`
- 创建 `ChannelManager`
- mount channel routes
- boot 后调用 `channelManager.recoverRemoteTasksOnBoot()`
- boot 后调用 `channelManager.startEnabled()`

- [ ] **步骤 7：运行测试**

```bash
cd sidecar && bun test src/channels/core/ChannelManager.test.ts src/channels/routes/channelConnections.test.ts src/channels/e2e/FakeRemoteTaskE2E.test.ts
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add sidecar/src/server.ts sidecar/src/channels/core/ChannelManager.ts sidecar/src/channels/core/ChannelManager.test.ts sidecar/src/channels/routes sidecar/src/channels/e2e
git commit -m "feat(remote-im): add fake channel e2e"
```

---

## 任务 6：experimental 微信插件迁移

**文件：**
- 创建：`sidecar/src/channels/plugins/weixin/WeixinLogin.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinLogin.test.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinAdapter.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinMonitor.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinMonitor.test.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinPlugin.ts`
- 创建：`sidecar/src/channels/plugins/weixin/WeixinTyping.ts`
- 修改：`sidecar/src/channels/routes/channelConnections.ts`
- 修改：`sidecar/src/server.ts`

- [ ] **步骤 1：复制前先阅读 AionUI 文件**

运行：

```bash
sed -n '1,220p' /Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinLogin.ts
sed -n '1,780p' /Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinMonitor.ts
sed -n '1,260p' /Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinPlugin.ts
sed -n '1,180p' /Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinAdapter.ts
sed -n '1,340p' /Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin/WeixinTyping.ts
```

预期：确认 AionUI 参考实现仍存在。

- [ ] **步骤 2：编写 QR 登录测试**

覆盖：

- QR status `wait` 后继续轮询。
- `scaned` 触发 scanned callback。
- `confirmed` 返回 `accountId`、`botToken`、`baseUrl`。
- `expired` 最多重试 3 次。

运行：

```bash
cd sidecar && bun test src/channels/plugins/weixin/WeixinLogin.test.ts
```

预期：FAIL。

- [ ] **步骤 3：迁移 WeixinLogin**

从 AionUI `WeixinLogin.ts` 迁移，适配 sidecar import 风格。保持：

- `iLink-App-ClientVersion: 1`
- `POLL_TIMEOUT_MS = 35_000`
- `REQUEST_TIMEOUT_MS = 15_000`
- `MAX_QR_RETRIES = 3`

- [ ] **步骤 4：编写 monitor 协议单元测试**

使用 mock fetch 覆盖：

- `getupdates` 请求 headers 包含 `AuthorizationType`、`Authorization`、`X-WECHAT-UIN`。
- `get_updates_buf` 被保存并用于下一次请求。
- text item 转换为 unified incoming。
- image/file item 下载后生成 attachment。
- outgoing file 使用 `getuploadurl`、CDN upload、media `sendmessage`。

运行：

```bash
cd sidecar && bun test src/channels/plugins/weixin/WeixinMonitor.test.ts
```

预期：FAIL。

- [ ] **步骤 5：迁移 WeixinMonitor、WeixinTyping、WeixinAdapter、WeixinPlugin**

适配点：

- AionUI 的 `agent.chat` 改成 `onMessage` handler，不在 monitor 内等待业务 response。
- 入站消息必须携带 `contextToken`。
- `WeixinPlugin.send` 调用 monitor 导出的 text/media send 能力，带上 `contextToken`。
- 下载附件目录使用 sidecar DB 旁的数据目录。
- 日志前缀使用 `[channels:weixin]`。

- [ ] **步骤 6：新增微信 login routes**

新增：

- `POST /channels/weixin/login/start`
- `GET /channels/weixin/login/:id/status`

登录成功后创建 disabled connection。用户必须手动 enable；避免扫码成功后立即启动实验性轮询。

- [ ] **步骤 7：运行微信单元测试**

```bash
cd sidecar && bun test src/channels/plugins/weixin/WeixinLogin.test.ts src/channels/plugins/weixin/WeixinMonitor.test.ts src/channels/routes/channelConnections.test.ts
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add sidecar/src/channels/plugins/weixin sidecar/src/channels/routes/channelConnections.ts sidecar/src/server.ts
git commit -m "feat(remote-im): add experimental weixin adapter"
```

---

## 任务 7：前端数据层与 Settings UI

**文件：**
- 创建：`src/lib/data/channel-connections.ts`
- 创建：`src/lib/data/channel-connections-queries.ts`
- 创建：`src/lib/data/channel-connections.test.ts`
- 创建：`src/features/settings/sections/RemoteConnectionsSection.tsx`
- 创建：`src/features/settings/sections/RemoteConnectionsSection.test.tsx`
- 修改：`src/features/settings/SettingsLayout.tsx`
- 修改：`src/features/settings/SettingsLayout.test.tsx`
- 修改：`src/app/RouterView.tsx`
- 修改：`src/i18n/locales/en/settings.json`
- 修改：`src/i18n/locales/zh/settings.json`

- [ ] **步骤 1：编写 data client 测试**

覆盖：

- list channel connections。
- patch connection config。
- enable / disable。
- start weixin login。
- get weixin login status。
- fake incoming trigger 仅用于开发/测试入口。

运行：

```bash
bun test src/lib/data/channel-connections.test.ts
```

预期：FAIL。

- [ ] **步骤 2：实现 data client 和 query hooks**

导出：

- `listChannelConnections`
- `updateChannelConnection`
- `enableChannelConnection`
- `disableChannelConnection`
- `startWeixinLogin`
- `getWeixinLoginStatus`
- `sendFakeChannelIncoming`
- `useChannelConnections`
- `useChannelConnectionActions`
- `useWeixinLogin`

- [ ] **步骤 3：编写 Settings UI 测试**

覆盖：

- nav 出现 Remote Connections。
- 空状态显示说明。
- fake connection 显示 running。
- weixin connection 显示 experimental 标识。
- `interactive_approval` 不可选。
- QR 登录 status 能显示 waiting/scanned/confirmed/error。

运行：

```bash
bun test src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/RemoteConnectionsSection.test.tsx
```

预期：FAIL。

- [ ] **步骤 4：实现 Settings UI**

UI 文案要求：

- 英文：`Experimental WeChat adapter requires manual smoke testing. Automated E2E uses Fake Channel.`
- 中文：`微信适配器为实验性能力，需要手工 smoke；自动化端到端使用 Fake Channel。`

不要在 UI 中承诺“微信端到端稳定可用”。

- [ ] **步骤 5：运行前端测试**

```bash
bun test src/lib/data/channel-connections.test.ts src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/RemoteConnectionsSection.test.tsx
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add src/lib/data/channel-connections.ts src/lib/data/channel-connections-queries.ts src/lib/data/channel-connections.test.ts src/app/RouterView.tsx src/features/settings/SettingsLayout.tsx src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/RemoteConnectionsSection.tsx src/features/settings/sections/RemoteConnectionsSection.test.tsx src/i18n/locales/en/settings.json src/i18n/locales/zh/settings.json
git commit -m "feat(remote-im): add remote connections settings"
```

---

## 任务 8：验证与手工 smoke

**文件：**
- 创建：`docs/superpowers/manual-smoke/2026-06-05-weixin-remote-im-smoke.md`
- 仅在验证发现问题时修改代码文件。

- [ ] **步骤 1：运行后端 channel 测试**

```bash
cd sidecar && bun test src/channels
```

预期：PASS。

- [ ] **步骤 2：运行 run 相关回归测试**

```bash
cd sidecar && bun test src/agent/runWorker.test.ts src/routes/runs.test.ts src/db.test.ts
```

预期：PASS。

- [ ] **步骤 3：运行前端测试**

```bash
bun test src/lib/data/channel-connections.test.ts src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/RemoteConnectionsSection.test.tsx
```

预期：PASS。

- [ ] **步骤 4：运行 type checks**

```bash
bunx tsc --noEmit -p tsconfig.app.json
cd sidecar && bunx tsc --noEmit
```

预期：PASS。

- [ ] **步骤 5：运行生产构建 smoke**

```bash
bun run build
```

预期：PASS。

- [ ] **步骤 6：创建微信手工 smoke checklist**

创建 `docs/superpowers/manual-smoke/2026-06-05-weixin-remote-im-smoke.md`，内容必须包含：

```markdown
# 微信远程 IM 手工 Smoke Checklist

## 前置条件

- 已有可扫码的微信账号。
- Agent Works sidecar 已启动。
- Settings > Remote Connections 能看到 WeChat experimental adapter。
- 本 smoke 不作为 CI 阻断条件。

## 检查项

- [ ] 扫码登录返回 confirmed，生成 connection。
- [ ] 手动 enable connection 后状态变为 running。
- [ ] 微信发送纯文本，sidecar 日志出现 getupdates 入站消息。
- [ ] 微信发送文件或图片，sidecar 下载到数据目录，日志显示 attachment path。
- [ ] fake channel 自动化 E2E 已通过。
- [ ] 微信发送文件和说明后，如果 run 成功，微信收到摘要。
- [ ] 如果 output 文件回发失败，remote_tasks.reply_state 变为 failed 或 manual_check，并记录 error_msg。
- [ ] disable connection 后轮询停止。

## 失败记录

记录失败时间、日志片段、connection id、remote task id、是否可复现。
```

- [ ] **步骤 7：提交验证修复和 smoke 文档**

如果需要修复：

```bash
git add sidecar/src/channels sidecar/src/agent/runWorker.ts sidecar/src/routes/runs.ts sidecar/src/server.ts src/lib/data/channel-connections.ts src/lib/data/channel-connections-queries.ts src/features/settings src/app/RouterView.tsx src/i18n/locales/en/settings.json src/i18n/locales/zh/settings.json docs/superpowers/manual-smoke/2026-06-05-weixin-remote-im-smoke.md
git commit -m "fix(remote-im): resolve remote channel verification issues"
```

如果没有代码修复，只提交 smoke 文档：

```bash
git add docs/superpowers/manual-smoke/2026-06-05-weixin-remote-im-smoke.md
git commit -m "docs(remote-im): add weixin manual smoke checklist"
```

---

## 自检清单

- 规格覆盖：
  - fake channel 自动化 E2E：任务 3、任务 5、任务 8。
  - 通道抽象：任务 1、任务 3、任务 5。
  - Session conversation 复用：任务 1、任务 4。
  - 30 秒文本/文件聚合：任务 3、任务 5。
  - run completion 回调：任务 4。
  - 重启补偿：任务 4、任务 5。
  - 仅 output 文件回发：任务 2、任务 4、任务 5。
  - 微信 experimental adapter：任务 6、任务 8。
  - Settings UI：任务 7。
- Placeholder 扫描：本计划不允许存在 `TBD`、`TODO`、未解决决策或未命名文件。
- 不再承诺真实微信自动化 E2E；微信只作为 experimental adapter 和手工 smoke。
- 类型一致性：
  - `ChannelConnection.config.defaultAgentId` 映射到 `ThreadService.create({ agentWorkspaceId })`。
  - `ChannelConnection.config.defaultWorkspace` 映射到 `ThreadService.create({ workingDir })` 和 remote task directories。
  - `RemoteTask.contextToken` 来自入站消息，用于微信 sendmessage。
  - `RemoteTask.replyState` 表示回发状态，不替代 run status。
  - `RemoteSendProtocol` 返回 `{ visibleText, files, rejected }`。

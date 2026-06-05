# 远程 IM 连接设计

日期：2026-06-05

## 目标

在 Agent Works 的设置页增加“远程连接”能力，第一版支持微信扫码连接，让用户可以通过微信给 Agent 发送文件或图片与修改说明，Agent 处理后把摘要和结果文件回发到同一微信会话。

首版要同时满足两个方向：

- 微信能够真实跑通：扫码连接、接收入站文件/图片、聚合说明、启动 Agent run、回发结果。
- 架构不能被微信绑死：后续可以扩展钉钉、飞书、QQ、企业微信、Telegram、Discord 等通道。

## 非目标

- 不做联系人审批、白名单、配对码。MVP 阶段，所有给已连接微信 Bot 发消息的人都可以触发任务。
- 不支持同一微信会话并行多个文件任务。
- 不支持语音、音频、视频入站。
- 不做独立 Inbox 页面。远程会话直接出现在首页对话列表中。
- 不把 AionUI 的 Electron process 层直接复制到 Agent Works。
- 不改 AGUI provider 抽象，也不让 `runLoop` 感知微信。

## 参考实现

参考 AionUI 的 Channels 实现：

- `/Users/wisen/project/personal/agent-studio/src/process/channels/ARCHITECTURE.md`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/core/SessionManager.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/gateway/ActionExecutor.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/utils/channelSendProtocol.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/resources/skills/weixin-file-send/SKILL.md`

可复用的设计思想：

- 平台插件把原生消息转换为统一入站消息。
- 发送层使用统一出站消息，再由平台插件转换成原生 API。
- session 按 IM 会话隔离。
- 微信通过扫码得到 `accountId`、`botToken`、`baseUrl`。
- 文件回发由 Agent 显式输出协议块，发送层再做路径、文件类型、大小过滤。
- 协议说明通过 skill 注入，而不是每条消息都重复完整 prompt。

需要调整的点：

- Agent Works 是 Tauri + Bun sidecar + Hono + SQLite + AGUI event-sourced run，不采用 AionUI 的 Electron process / workerTaskManager / conversationService 结构。
- 微信文件和文本可能分成两条消息到达，需要新增 30 秒双向聚合和追问状态机。
- 微信默认自动执行，但回发文件必须严格限制在当前远程任务 `output/`。

## 推荐方案

采用“sidecar 内建轻量 Channels 子系统”。

新增 `sidecar/src/channels/` 领域目录，把通道生命周期、平台插件、远程任务聚合、结果回发协议集中在 sidecar 内。前端设置页只负责连接配置、扫码状态、默认 Agent、默认工作区和状态展示。

建议目录：

```text
sidecar/src/channels/
  core/
    ChannelManager.ts
    PluginRegistry.ts
    ChannelTypes.ts
  plugins/
    weixin/
      WeixinLogin.ts
      WeixinMonitor.ts
      WeixinPlugin.ts
      WeixinAdapter.ts
  tasks/
    RemoteTaskAggregator.ts
    RemoteTaskService.ts
    RemoteSendProtocol.ts
  routes/
    channelConnections.ts
    remoteTasks.ts
```

模块边界：

- `channels/plugins/weixin` 只处理微信协议、扫码、轮询、附件下载、媒体上传和消息发送。
- `RemoteTaskAggregator` 只负责文本/文件聚合、30 秒追问和同 session 并发控制。
- `RemoteTaskService` 负责 DB 状态、任务目录、session conversation 绑定和 run 创建。
- `RemoteSendProtocol` 是唯一决定哪些文件可回发的模块。
- AGUI provider、`runWorker`、`runLoop` 不直接感知微信。

核心数据流：

```text
微信扫码连接
  -> 保存 connection(accountId/botToken/baseUrl/defaultAgent/defaultWorkspace)
  -> ChannelManager 启动 WeixinPlugin
  -> WeixinMonitor 收到文本/文件
  -> WeixinAdapter 归一化入站消息
  -> RemoteTaskAggregator 聚合文本 + 文件
  -> RemoteTaskService 落盘 input/output 并创建或复用 session conversation
  -> runWorker 启动 Agent run
  -> run 结束后 RemoteSendProtocol 解析结果文件
  -> WeixinPlugin 回发摘要 + output 文件
```

## 数据模型

新增 SQLite 表。

```text
channel_connections
  id                  TEXT PRIMARY KEY
  type                TEXT NOT NULL
  name                TEXT NOT NULL
  enabled             INTEGER NOT NULL DEFAULT 0
  status              TEXT NOT NULL
  credentials_json    TEXT
  config_json         TEXT NOT NULL
  last_connected_at   INTEGER
  error_msg           TEXT
  created_at          INTEGER NOT NULL
  updated_at          INTEGER NOT NULL

channel_sessions
  id                  TEXT PRIMARY KEY
  connection_id       TEXT NOT NULL
  channel_type        TEXT NOT NULL
  chat_id             TEXT NOT NULL
  sender_id           TEXT NOT NULL
  display_name        TEXT
  conversation_id     TEXT NOT NULL
  active_task_id      TEXT
  created_at          INTEGER NOT NULL
  updated_at          INTEGER NOT NULL

remote_tasks
  id                  TEXT PRIMARY KEY
  session_id          TEXT NOT NULL
  connection_id       TEXT NOT NULL
  conversation_id     TEXT NOT NULL
  run_id              TEXT
  status              TEXT NOT NULL
  instruction_text    TEXT
  input_dir           TEXT NOT NULL
  output_dir          TEXT NOT NULL
  result_summary      TEXT
  result_files_json   TEXT
  error_msg           TEXT
  created_at          INTEGER NOT NULL
  updated_at          INTEGER NOT NULL
```

`channel_connections.config_json` 首版包含：

- `defaultAgentId`
- `defaultWorkspace`
- `permissionStrategy`: 微信默认为 `auto_execute`

`remote_tasks.status`：

- `awaiting_file`
- `awaiting_instruction`
- `ready`
- `running`
- `completed`
- `failed`

## Session 与 Conversation

一个微信会话对应一个 Agent Works conversation/session。后续同一微信会话的文字、文件、追问和结果都追加到同一个首页对话。

session key 使用：

```text
connectionId + chatId + senderId
```

当收到第一条有效入站消息时：

1. 查找 `channel_sessions`。
2. 没有则创建 conversation，标题建议为 `微信 · <displayName>`。
3. 保存 `channel_sessions.conversation_id`。
4. 后续远程任务复用该 conversation。

同一 session 一次只允许一个 `active_task_id`。已有 `running` 任务时，微信端提示：

```text
当前会话已有一个文件任务正在处理中，请等待完成后再发送新的文件任务。
```

## 任务目录

远程任务目录落在连接绑定的默认工作区下：

```text
<defaultWorkspace>/remote-tasks/<taskId>/
  input/
  output/
```

规则：

- 入站普通文件和图片保存到 `input/`。
- Agent 可以在绑定默认工作区内处理任务。
- 要回发给微信的最终文件必须保存到当前任务 `output/`。
- 发送层只允许当前任务 `output/` 下的普通文件被回发。
- 不允许扫描整个工作区推断结果文件。

## 文本与文件聚合

微信文本和文件可能分条到达。聚合器必须支持两个顺序。

```text
收到文本
  -> 没有 pending 文件：awaiting_file，30 秒后追问“请继续发送要处理的文件”
  -> 已有 pending 文件：ready -> running

收到文件/图片
  -> 没有 pending 文本：awaiting_instruction，30 秒后追问“已收到文件，请发送修改要求”
  -> 已有 pending 文本：ready -> running
```

追问后保留 pending 状态，等待同一 session 的后续消息。聚合成功后，状态进入 `ready`，随后由 `RemoteTaskService` 创建 run 并置为 `running`。

首版入站媒体类型：

- 普通文件
- 图片

语音、音频、视频不进入 MVP。

## 微信扫码与连接 API

设置页新增“远程连接”导航项。页面只负责连接配置和状态。

扫码流程：

```text
POST /channels/weixin/login/start
  -> sidecar 调用 WeixinLogin 获取二维码
  -> 前端显示二维码
  -> sidecar 轮询 waiting / scanned / confirmed / expired / error
  -> confirmed 后保存 channel_connections
  -> ChannelManager 启动 WeixinPlugin
```

建议路由：

- `GET /channels/connections`
- `POST /channels/weixin/login/start`
- `GET /channels/weixin/login/:id/status`
- `POST /channels/connections/:id/enable`
- `POST /channels/connections/:id/disable`
- `PATCH /channels/connections/:id`
- `GET /channels/remote-tasks/recent`

连接状态：

- `stopped`
- `waiting_qr`
- `scanned`
- `running`
- `error`

如果微信 API 没有可靠 test endpoint，“测试连接”展示最近轮询成功时间，不重新扫码。

## 设置页 UI

Settings 新增 `远程连接` nav item。

页面内容：

```text
Settings / Remote Connections

[连接列表]
- 微信 Bot
  状态：未连接 / 等待扫码 / 已连接 / 运行中 / 错误
  默认 Agent：xxx
  默认工作区：xxx
  权限策略：微信默认自动执行
  最近活动：xx 分钟前收到任务

[操作]
- 添加微信连接
- 重新扫码
- 启用 / 停用
- 测试连接
- 修改默认 Agent
- 修改默认工作区
```

UI 约束：

- 设置页不显示完整任务执行过程。
- 远程会话在首页对话列表可见。
- 远程连接页可以显示最近任务入口和最近活动摘要。
- `defaultAgentId` 和 `defaultWorkspace` 必填。

## Agent run 输入

聚合完成后，`RemoteTaskService` 构造普通用户消息进入现有 run 系统。

示例：

```text
这是一个来自远程 IM 通道的文件处理任务。

来源：
- 通道：微信
- 会话：张三
- 任务 ID：rt_...

用户要求：
<微信文本说明>

输入文件：
- remote-tasks/<taskId>/input/contract.docx
- remote-tasks/<taskId>/input/logo.png

工作约束：
- 你可以在当前工作区处理任务。
- 本任务的输入文件位于：remote-tasks/<taskId>/input/
- 需要回发给用户的最终文件必须保存到：remote-tasks/<taskId>/output/
- 不要把临时文件、草稿文件或无关文件放入 output。
- 最终回答需要包含简短处理摘要。
- 如果需要回发文件，请使用以下协议块声明结果文件：
  [AGENT_WORKS_REMOTE_SEND]{"path":"remote-tasks/<taskId>/output/result.docx","type":"file"}[/AGENT_WORKS_REMOTE_SEND]
```

## 回发协议

采用 Agent Works 自己的显式协议块：

```text
[AGENT_WORKS_REMOTE_SEND]{"path":"remote-tasks/<taskId>/output/result.docx","type":"file"}[/AGENT_WORKS_REMOTE_SEND]
```

支持多段协议块。JSON 字段：

- `path`: 必填，绝对路径或相对当前工作区路径。
- `type`: 必填，`file` 或 `image`。
- `fileName`: 可选。

解析规则：

- 协议块从微信可见摘要中剔除。
- `path` 必须 realpath 校验在当前 task 的 `output/` 下。
- 文件必须存在。
- 必须是普通文件，不允许目录。
- 文件大小上限沿用 AionUI 思路，首版使用 200 MB。

失败提示：

- run 成功但没有合法协议块：
  ```text
  任务已完成，但没有找到可回发的结果文件。请在 Agent Works 中查看该对话。
  ```
- 协议块文件不存在：
  ```text
  任务已完成，但结果文件不存在，暂无法回发。请在 Agent Works 中查看该对话。
  ```
- 协议块路径不在当前任务 `output/` 下：
  ```text
  任务已完成，但结果文件不在允许回发的 output 目录中，已阻止回发。请在 Agent Works 中查看该对话。
  ```
- 文件超限：
  ```text
  任务已完成，但结果文件超过微信回发大小限制，暂无法回发。请在 Agent Works 中查看该对话。
  ```
- run 失败：
  ```text
  文件任务处理失败：<error summary>
  ```

## Skill 注入

参考 AionUI `weixin-file-send`。

Agent Works 提供 `remote-im-file-send` skill 或等价 system append，用于说明 `[AGENT_WORKS_REMOTE_SEND]` 协议。每次任务的动态信息由本次用户消息提供，不在每条普通 IM 消息中重复完整协议说明。

首版建议以 sidecar append 注入实现，待 Agent Workspace 的技能选择体系需要展示时，再注册为可见 skill。

## 权限策略

权限策略按通道定义，不全局一刀切。

- 微信属于低交互通道，MVP 默认 `auto_execute`。
- 飞书、钉钉、Discord、Telegram 等交互能力强的通道，后续可以把审批转换成卡片、按钮、命令或 inline action。
- 每个连接未来可覆盖默认策略。

微信自动执行的安全下限：

- Agent 可在绑定默认工作区处理任务。
- 回发文件只允许当前 remote task 的 `output/`。
- 非 `output/` 文件不会自动发送到微信。

## 错误处理

- 微信 monitor 失败：连接状态置为 `error`，记录 `error_msg`，设置页展示。
- 扫码过期：登录状态置为 `expired`，前端允许重新扫码。
- 只有文本或只有文件：30 秒后通过微信追问，并保留 pending 状态。
- 已有运行任务：提示等待，不启动第二个 run。
- run 失败：`remote_tasks.status = failed`，微信回发失败摘要。
- 回发失败：记录 `remote_tasks.error_msg`，微信尽量回发文本错误说明。

## 测试

协议与状态机单测：

- `RemoteTaskAggregator`：
  - 先文本后文件，进入 `running`。
  - 先文件后文本，进入 `running`。
  - 只文本 30 秒后追问。
  - 只文件 30 秒后追问。
  - 同一 session 已有 `running` 任务时拒绝新任务或提示等待。
- `RemoteSendProtocol`：
  - 正确解析多个 `[AGENT_WORKS_REMOTE_SEND]`。
  - 剔除协议块，只保留摘要。
  - 拒绝 `output/` 外路径。
  - 拒绝不存在、目录、超限文件。

sidecar 路由测试：

- `GET /channels/connections` 返回连接列表和状态。
- `POST /channels/weixin/login/start` 创建扫码登录状态。
- 连接 `confirmed` 后写入 `channel_connections`。
- enable / disable 能驱动 `ChannelManager` 启停插件。
- `GET /channels/remote-tasks/recent` 返回最近活动摘要。

run 集成测试：

- 模拟微信入站文件 + 文本后，创建或复用 `channel_sessions.conversation_id`。
- 创建 `remote_tasks`，落盘 `input/` 和 `output/`。
- 调用现有 `runWorker` 启动 run。
- run 完成后解析结果并调用插件回发摘要 + 文件。
- run 失败时回发失败说明。

前端测试：

- 设置页新增 `远程连接` nav。
- 未连接、扫码中、已连接、错误状态渲染。
- 默认 Agent、默认工作区配置校验。
- 连接启停、重新扫码、测试连接按钮状态。
- 首页对话列表能显示微信 session conversation。

## 验收标准

- 微信扫码成功后，设置页显示 `running`。
- 用户在微信里“先发文件再发说明”和“先发说明再发文件”都能触发任务。
- 缺少另一半时 30 秒后微信追问。
- 首页对话列表出现或复用对应微信 session。
- Agent 完成后微信收到摘要和 `output/` 中声明的文件。
- 非 `output/` 文件不会被回发。
- 同一微信会话同一时间不会启动两个并行文件任务。

## 实施顺序建议

1. DB schema + channel service 基础类型。
2. `RemoteSendProtocol` 和 `RemoteTaskAggregator` 纯函数测试。
3. `ChannelManager` + 连接 CRUD 路由。
4. 微信扫码登录与状态轮询。
5. 微信 monitor / adapter / plugin。
6. `RemoteTaskService` 接入 conversation 和 runWorker。
7. 设置页 `远程连接` UI。
8. 首页对话列表 source metadata 展示优化。
9. 集成测试与微信端人工验收。

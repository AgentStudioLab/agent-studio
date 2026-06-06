# 远程 IM 连接需求对齐记录

> 本文档用于实时记录当前对话中已经确认的需求、参考实现结论和已收口细节。它不是最终架构设计文档，也不是实现计划；后续需求变更需要同步更新本文档。

## 背景

Agent Works 需要在设置页增加远程连接能力，先支持微信，后续扩展钉钉、飞书、QQ、企业微信、Telegram、Discord 等 IM 通道。

核心目标不是普通聊天入口，而是远程文件任务入口：用户通过 IM 发送文件和修改要求给 Agent，Agent 修改后再通过同一 IM 会话回发结果。

## 已确认需求

### 通道与连接

- 第一版支持微信。
- 需要先设计通道抽象，微信只是首个插件；后续通道不能被微信实现绑死。
- 微信连接通过扫码绑定。
- 微信扫码流程可参考 AionUI 的 iLink Bot 登录模型：获取二维码、轮询扫码状态、确认后得到 `accountId`、`botToken`、`baseUrl`。
- MVP 先只绑定一个微信 Bot 连接。
- MVP 阶段，所有给该 Bot 发消息的人都可以触发任务；暂不做联系人审批、白名单、配对码。

### Agent 与工作区绑定

- 每个远程连接绑定一个默认 Agent 和默认工作区。
- 微信入站文件任务默认进入该连接绑定的 Agent/session。
- 远程任务在 App 首页对话列表中可见。
- 简化采用 AionUI 的 session 思路：一个微信会话对应一个 Agent Works conversation/session。
- 同一微信会话后续文字、文件、追问、结果都追加到同一个 session。
- 不按每个文件任务新建 conversation。

### 文本与文件聚合

- 微信文本和文件不是同一条消息，需要支持分条到达后的聚合。
- 微信第一版入站媒体类型只支持普通文件和图片。
- 普通文件覆盖文档、PPT、Excel、PDF 等文件类输入；图片按图片附件处理。
- 语音、音频、视频等类型不进入 MVP，后续作为通道能力扩展。
- 支持两种顺序：
  - 先发文件，再发文字说明。
  - 先发文字说明，再发文件。
- 聚合 key 使用同一连接、同一微信会话、同一发送方的组合。
- 聚合等待时间为 30 秒。
- 如果只收到文件，立即作为附件远程 IM 请求启动 Agent run，由模型判断是否需要追问说明。
- 如果只收到文字说明，立即作为普通远程 IM 请求启动 Agent run；不得默认追问文件。
- 追问后继续保留 pending 状态，等待同一 session 的后续消息。
- 聚合成功后在该 session 对应的 Agent Works conversation 中启动 run。

### 并发与任务状态

- 同一微信会话一次只允许一个进行中的远程文件任务。
- 如果该 session 已有进行中任务，后续新任务需要提示等待或进入后续排队设计；MVP 先避免并行任务归属混乱。

### 结果输出与回发

- Agent 必须把要回发的结果文件放到指定 `output/` 目录。
- Agent 最终回复需要明确声明结果文件清单。
- 发送层只允许回发 `output/` 下的结果文件。
- 不通过扫描整个工作区来推断要回发哪些文件。
- 回发结果文件声明采用显式文本协议块，参考 AionUI 的 `[AGENTSTUDIO_CHANNEL_SEND]` 思路，但使用 Agent Works 自己的协议名。
- 协议示例：

```text
[AGENT_WORKS_REMOTE_SEND]{"path":"output/result.docx","type":"file"}[/AGENT_WORKS_REMOTE_SEND]
```

- 发送层解析协议块后仍需要做路径过滤：只允许当前远程任务 `output/` 下的普通文件。
- 任务完成后，微信端需要回发简短处理摘要和结果文件。
- 摘要用于说明处理结果、部分成功、失败原因或后续建议；文件按协议块解析结果回发。

### 权限策略

- 权限策略需要按通道设计，而不是全局一刀切。
- 微信这类低交互通道默认自动执行，避免远程任务卡在本地审批。
- 飞书、钉钉、Discord、Telegram 等交互能力较强的通道，后续可把审批转换成卡片、按钮、命令或 inline actions。
- 每个连接未来可以覆盖通道默认策略。
- 微信 MVP 采用“自动执行 + 严格回发白名单”：
  - Agent 可在绑定 Agent 的默认工作区中处理任务。
  - 每个远程任务仍需要独立 `input/` 和 `output/`。
  - 只有当前远程任务 `output/` 下的文件允许回发微信。
  - 不允许把默认工作区内的任意文件自动回发给微信。

## AionUI 参考结论

参考路径：

- `/Users/wisen/project/personal/agent-studio/src/process/channels/ARCHITECTURE.md`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/plugins/weixin`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/core/SessionManager.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/gateway/ActionExecutor.ts`
- `/Users/wisen/project/personal/agent-studio/src/process/channels/utils/channelSendProtocol.ts`

### 可借鉴点

- 分层清晰：
  - `ChannelManager` 负责整体生命周期。
  - `PluginManager` 负责插件启停和状态。
  - `SessionManager` 负责按 IM 会话隔离 session。
  - `ActionExecutor` 负责入站消息路由到 Agent。
  - 平台插件负责原生协议和统一消息协议互转。
- 统一消息协议：插件把平台消息转换为 `IUnifiedIncomingMessage`，回复通过 `IUnifiedOutgoingMessage`。
- 微信扫码连接：`WeixinLogin.ts` 通过 iLink Bot API 获取二维码并轮询确认状态。
- 微信 monitor：`WeixinMonitor.ts` 负责拉取消息、下载附件、上传回发媒体。
- 微信 adapter：`WeixinAdapter.ts` 会把附件本地路径拼入文本，让 Agent 能读取文件。
- session 模型：`SessionManager` 使用 `userId + chatId` 做会话隔离；`ActionExecutor` 按 `source + chatId + agent type + backend` 查找或创建 conversation。
- 回发文件限制：`channelSendProtocol.ts` 解析 Agent 输出里的 `[AGENTSTUDIO_CHANNEL_SEND]` 协议块，并限制可发送文件：
  - 必须在 conversation workspace 内，或在受管理的临时目录、配置临时目录、微信上传目录内。
  - 必须存在。
  - 必须是文件，不允许目录。
  - 文件大小上限为 200 MB。
  - 不符合条件时拒绝回发，并返回具体原因。
- prompt / skill 处理：
  - AionUI 没有在每条微信消息里拼接完整回发协议说明。
  - `buildChannelConversationExtra()` 会对微信会话自动设置 `enabledSkills: ['weixin-file-send']`。
  - `weixin-file-send/SKILL.md` 说明 Agent 什么时候应该回发文件，以及如何输出 `[AGENTSTUDIO_CHANNEL_SEND]` 协议块。
  - Agent 初始化 / conversation 创建流程会加载 `enabledSkills`，让协议说明作为 skill 能力进入会话上下文。

### 需要调整的点

- AionUI 更偏“远程聊天助手”，同一 IM 会话复用 conversation 是合理的。
- Agent Works 当前目标是“远程文件修改任务”，仍复用 session，但需要额外的 `remoteTask` 状态来管理文件聚合、`input/`、`output/` 和回发结果。
- AionUI 的微信请求里可能已经带有 `text + attachments`；Agent Works 需要显式支持微信文本和文件分条到达后的 30 秒聚合和追问。
- AionUI channel 会话使用 `yoloMode` 自动审批；Agent Works 需要抽象为按通道交互能力决定默认权限策略。
- Agent Works 可以参考 AionUI 的 skill 注入模式，为远程 IM 文件任务提供 `remote-im-file-send` 或同等 system append，而不是在每条普通消息中重复完整协议说明。

## 架构方案选择

已确认采用“轻量内建 Channels 子系统”：

- 在 Agent Works `sidecar` 内建设通道核心能力，而不是直接复制 AionUI Electron process 层。
- 参考 AionUI 的分层和微信插件经验，但适配 Agent Works 当前 Tauri + Bun sidecar + Hono + SQLite + AGUI run engine 架构。
- 计划新增 `sidecar/src/channels/` 领域目录，承载通道管理、插件注册、微信插件、远程任务聚合、结果回发等能力。
- 设置页新增“远程连接”入口，负责微信扫码连接、默认 Agent、默认工作区、状态检查和最近活动摘要。
- 远程任务最终通过现有 `runWorker` / AGUI event-sourced run 进入 Agent Works 对话系统。

## 已确认架构边界

建议新增 sidecar 内建 `channels` 领域：

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

模块职责：

- `channels/plugins/weixin` 只处理微信协议，不知道 Agent run 细节。
- `RemoteTaskAggregator` 负责同一微信 session 内文本和文件的 30 秒聚合、追问和并发控制。
- `RemoteTaskService` 负责 remote task DB 状态、`input/` / `output/` 目录、conversation/session 绑定和 run 创建。
- `RemoteSendProtocol` 负责解析 `[AGENT_WORKS_REMOTE_SEND]` 协议块，并执行 output 白名单过滤。
- AGUI provider、`runLoop`、`runWorker` 不直接感知微信，只处理普通 conversation run。

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

## 已确认数据模型与状态机

建议新增独立 channel / remote task 数据模型，通过 `conversation_id` 和 `run_id` 接入现有对话与 AGUI run。

```text
channel_connections
  id
  type
  name
  enabled
  status
  credentials_json
  config_json
  last_connected_at
  created_at
  updated_at

channel_sessions
  id
  connection_id
  channel_type
  chat_id
  sender_id
  display_name
  conversation_id
  active_task_id
  created_at
  updated_at

remote_tasks
  id
  session_id
  connection_id
  conversation_id
  run_id
  status
  instruction_text
  input_dir
  output_dir
  result_summary
  result_files_json
  error_msg
  created_at
  updated_at
```

`remote_tasks.status` 状态：

- `awaiting_file`
- `awaiting_instruction`
- `ready`
- `running`
- `completed`
- `failed`

聚合状态机：

```text
收到文本
  -> 没有 pending 文件：ready -> running（普通远程 IM 请求）
  -> 已有 pending 文件：ready -> running

收到文件/图片
  -> 没有 pending 文本：ready -> running（附件远程 IM 请求）
  -> 已有 pending 文本：ready -> running

running
  -> run completed + 协议解析成功：completed -> 回发摘要 + 文件
  -> run error / 协议解析失败 / 文件不合法：failed -> 回发失败说明
```

同一 `channel_sessions` 一次只允许一个 `active_task_id`。conversation 复用 session 的 `conversation_id`，所以首页对话列表显示长期 IM 会话，remote task 作为会话内任务记录。

## 已确认微信扫码与设置页 UI

设置页新增 `远程连接` 导航项。该页面只负责连接配置和状态，不承载任务执行详情。

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

微信扫码流程：

```text
点击“添加微信连接”
  -> POST /channels/weixin/login/start
  -> sidecar 调用 WeixinLogin 获取二维码
  -> 前端显示二维码
  -> sidecar 轮询状态：waiting / scanned / confirmed / expired / error
  -> confirmed 后保存 channel_connections
  -> ChannelManager 启动 WeixinPlugin
  -> UI 显示 running
```

连接配置：

- `name`：用户可改，默认 `微信连接`。
- `defaultAgentId`：必填，决定远程任务使用哪个 Agent。
- `defaultWorkspace`：必填，决定 Agent 的工作目录。
- `permissionStrategy`：微信默认 `auto_execute`，首版可以只展示，不开放复杂编辑。
- `enabled`：是否随 sidecar 启动自动启用。
- `status`：由 sidecar 运行时写入。

状态检查：

- 设置页通过 `GET /channels/connections` 展示连接状态。
- 微信插件启动失败时写入 `error` 和 `error_msg`。
- `测试连接` 不重新扫码，只验证凭据可用性；如果微信 API 不提供可靠 test，就展示最近轮询成功时间。

## 已确认 Agent run 输入与回发协议

聚合器拿到“说明 + 文件/图片”后，`RemoteTaskService` 构造普通用户消息进入现有 run 系统。输入需要包含固定结构，减少模型猜测。

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
- input/contract.docx
- input/logo.png

工作约束：
- 你可以在当前工作区处理任务。
- 本任务的输入文件位于：remote-tasks/<taskId>/input/
- 需要回发给用户的最终文件必须保存到：remote-tasks/<taskId>/output/
- 不要把临时文件、草稿文件或无关文件放入 output。
- 最终回答需要包含简短处理摘要。
- 如果需要回发文件，请使用以下协议块声明结果文件：
  [AGENT_WORKS_REMOTE_SEND]{"path":"remote-tasks/<taskId>/output/result.docx","type":"file"}[/AGENT_WORKS_REMOTE_SEND]
```

协议解析规则：

- 支持多段 `[AGENT_WORKS_REMOTE_SEND]...[/AGENT_WORKS_REMOTE_SEND]`。
- JSON 字段首版包括：
  - `path`
  - `type`: `file | image`
  - `fileName` 可选
- `path` 可以是绝对路径，也可以是相对当前工作区路径。
- 必须 realpath 校验在当前 task 的 `output/` 下。
- 文件必须存在、是普通文件、大小不超过上限。
- 协议块从微信可见摘要里剔除，只保留摘要文字和回发文件。

失败行为：

- run 成功但没有合法协议块：微信回发“任务已完成，但没有找到可回发的结果文件”，并保留 App 内对话供用户查看。
- 协议块文件不存在、越界或超限：微信回发摘要和错误说明，不回发非法文件。
- run 失败：微信回发失败原因摘要。

prompt / skill 注入方式：

- 参考 AionUI `weixin-file-send` skill 模式。
- Agent Works 可提供 `remote-im-file-send` skill 或等价 system append，说明 `[AGENT_WORKS_REMOTE_SEND]` 协议。
- 每次任务的动态信息（`taskId`、`input/`、`output/`、用户说明、文件清单）由本次 run 用户消息传入。
- 不在每条普通 IM 消息中重复完整协议说明。

## 已确认测试与验收范围

首版测试覆盖四层。

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

验收标准：

- 微信扫码成功后，设置页显示 `running`。
- 用户在微信里“先发文件再发说明”和“先发说明再发文件”都能触发任务。
- 缺少另一半时 30 秒后微信追问。
- 首页对话列表出现或复用对应微信 session。
- Agent 完成后微信收到摘要和 `output/` 中声明的文件。
- 非 `output/` 文件不会被回发。
- 同一微信会话同一时间不会启动两个并行文件任务。

## 已收口细节

以下细节已在正式设计文档 `docs/superpowers/specs/2026-06-05-remote-im-connections-design.md` 中收口：

- 远程任务目录落在连接绑定的默认工作区下：`<defaultWorkspace>/remote-tasks/<taskId>/input/` 和 `<defaultWorkspace>/remote-tasks/<taskId>/output/`。
- 协议块解析失败、文件不存在、路径不在 `output/` 下、文件超限、run 失败时，微信端使用固定中文错误提示，并保留 App 内对话作为可追溯入口。

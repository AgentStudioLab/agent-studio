# Claude Code Router 统一 Agent Runtime 设计

日期：2026-06-21

## 目标

把 Agent Studio 的 agent run 收敛到一条运行时链路：所有对话、Agent 工作区、远程任务、定时任务都通过 `@anthropic-ai/claude-agent-sdk` 执行。用户配置 OpenAI-compatible 模型后，不再走当前能力较弱的 `provider-openai` text streaming runtime，而是经由 Agent Studio 托管的 Claude Code Router（下文简称 CCR）转换为 Anthropic / Claude Code 兼容协议。

核心目标：

- OpenAI-compatible 模型获得与 Anthropic 模型一致的产品体验：tools、HITL 审批、session resume、regenerate、file checkpoint、agent context、usage 归档尽量复用同一条 Claude SDK 链路。
- 用户继续在设置页配置 provider、API key、base URL、模型；不要求用户理解或手动维护 CCR 配置。
- `provider-openai` 不再作为长期 runtime 存在。PoC 验收通过后删除 `sidecar/src/agui/provider-openai/*` 和 factory 中的 OpenAI runtime 分支。
- 为后续图片输入和语音转写保留模型能力配置，但不把语音识别强行塞进 CCR。

## 非目标

- 不在第一阶段实现完整图片上传 UI 和多模态 run 协议；本设计只定义能力边界与迁移位置。
- 不把 LiteLLM 作为内置网关。LiteLLM 是 Python 服务，适合作为外部企业网关或协议参考，不适合作为 Tauri 桌面端默认 sidecar 依赖。
- 不把 Bifrost 作为首选落地方案。Bifrost 更像通用 AI gateway，Go 二进制可分发性较好，但相对 Agent Studio 当前需求偏重。
- 不依赖用户全局 `~/.claude-code-router/config.json`。Agent Studio 必须管理自己的私有 CCR 运行目录和配置，避免污染用户命令行环境。
- 不通过“修改 CCR 全局 default model + restart”实现单次 run 的模型选择。run 级 provider/model 路由必须无需重启。
- 不承诺所有 OpenAI-compatible 模型都能等价支持 Claude Code tool use。模型本身能力不足时，UI 只能如实展示能力和错误。

## 当前问题

当前 provider runtime 拆成两条：

```text
Anthropic / Anthropic-compatible
  -> sidecar/src/agui/provider-claude
  -> @anthropic-ai/claude-agent-sdk
  -> tools / HITL / session / checkpoint / file rewind

OpenAI-compatible
  -> sidecar/src/agui/provider-openai
  -> ai SDK streamText(prompt: string)
  -> text streaming only
```

这导致用户选择 OpenAI-compatible 模型后，体验天然比 Anthropic 少一截：

- 没有 Claude Agent SDK 的内建工具协议。
- 没有同一套 HITL 审批暂停和恢复。
- 没有 file checkpoint / rewind。
- 没有 Claude Code session resume 语义。
- 没有完整的 SDK usage、permission denial、hook、sandbox 事件。
- 未来图片输入若只补到 OpenAI adapter，会继续制造两套多模态实现。

因此继续增强 `provider-openai` 会扩大 runtime 分叉。更好的方向是让 OpenAI-compatible 模型也进入 Claude SDK 链路。

## 方案选择

### 方案 A：继续增强 `provider-openai`

做法：在 `provider-openai` 中补 tools、HITL、session、file checkpoint、图片输入。

优点：

- 不引入 CCR 进程。
- OpenAI-compatible 请求可控，问题定位直接。

缺点：

- 等于重做一套 Claude Agent SDK 已经提供的 agent runtime 能力。
- HITL、tool schema、checkpoint、session、hook、usage 都要维护平行实现。
- Anthropic 和 OpenAI 的行为会继续漂移。

结论：不推荐。它解决 provider 接入，但不解决“体验一致”的目标。

### 方案 B：Agent Studio 内置轻量 Anthropic-to-OpenAI router

做法：自己实现一个只覆盖 Agent Studio 需要能力的 Anthropic-compatible proxy。

优点：

- 完全可控，容易和设置、runId、threadId、usage 体系打通。
- 不依赖 CCR 外部项目的配置格式和升级节奏。

缺点：

- Anthropic Messages streaming、tool_use、tool_result、image blocks、error、usage、count_tokens 都要维护。
- 多 provider transformer 细节多，容易变成长期协议债。
- 短期难以覆盖 OpenRouter、DeepSeek、Gemini、SiliconFlow 等复杂差异。

结论：作为长期 fallback 可保留，但不作为首选。

### 方案 C：托管 CCR，统一走 Claude Agent SDK

做法：Agent Studio sidecar 启动和管理一个私有 CCR 实例。Claude Agent SDK 的 `ANTHROPIC_BASE_URL` 指向这个 CCR endpoint。用户配置的 OpenAI-compatible provider 被转换成 CCR upstream provider 配置。每次 run 仍由 Agent Studio 决定 provider/model。

优点：

- 和 Claude Code / Claude Agent SDK 生态目标一致。
- 复用 CCR 已有 provider transformer、路由和 Claude Code 兼容经验。
- 删除当前半成品 OpenAI runtime，减少运行时分叉。
- 产品层仍由 Agent Studio 管 settings、HITL、thread、agent context、run events。

缺点：

- 引入一个新本地服务，需要托管、健康检查、日志、版本升级和故障降级。
- 必须验证 CCR 的 tool streaming、HITL resume、checkpoint、usage 映射不会破坏现有 AGUI 事件。
- 必须解决 run 级模型选择，不能靠全局 CCR default 配置。

结论：推荐。先做 PoC，验收通过后迁移为主链路。

## 推荐架构

目标运行链路：

```text
React UI
  -> /runs { threadId, runId, providerSelection, message }
  -> runWorker
  -> provider-claude
  -> @anthropic-ai/claude-agent-sdk
      env:
        ANTHROPIC_BASE_URL = http://127.0.0.1:<ccrPort>
        ANTHROPIC_API_KEY  = <router-local-key 或 upstream key 映射>
      options.model = <run-scoped model key>
  -> Agent Studio managed CCR
  -> upstream provider/model
```

保留的边界：

- `runWorker` 仍然只知道 `AgentProvider`，不感知 CCR 内部 provider 细节。
- `provider-claude` 继续负责 Claude SDK options、allowedTools、HITL bus、sandbox、hooks、file checkpoint、session resume。
- `providerSettings` 继续负责用户 provider/model 配置，但其 runtime 语义从“直接创建 OpenAI provider”改成“生成 CCR upstream 并选择 CCR model key”。
- CCR 私有配置和运行目录由 sidecar 管，不读取或覆盖用户全局 CCR。

## CCR 托管方式

新增 sidecar 领域模块：

```text
sidecar/src/ccr/
  CcrManager.ts
  CcrConfigBuilder.ts
  CcrHealth.ts
  CcrTypes.ts
```

职责：

- `CcrConfigBuilder`：把 `ProviderConnection` 列表转换为 CCR provider config。
- `CcrManager`：启动、停止、重启 CCR 子进程，维护端口、pid、运行目录。
- `CcrHealth`：探测 CCR 是否可用，输出可诊断错误。
- `CcrTypes`：隔离 CCR 配置格式，避免散落到 provider settings。

私有运行目录：

```text
<app-data>/ccr/
  config.json
  logs/
  runtime/
```

规则：

- 设置变化后重写私有 CCR config。
- 若只是 provider API key / baseUrl / enabled model 变化，可以重启 CCR；但普通 run 启动不能依赖重启。
- CCR 启动失败时，所有非 Anthropic-direct upstream run 返回明确错误：`ccr_unavailable`。
- Anthropic 官方 provider 可以选择直连 Anthropic，也可以经 CCR。第一版建议也经 CCR，确保运行链路统一；若 CCR 失败，可临时回退直连 Anthropic 作为安全开关。

## Run 级模型选择

这是本设计的关键验收点。

禁止方案：

```text
每次用户切模型
  -> 修改 CCR Router.default
  -> restart CCR
  -> 再启动 run
```

原因：

- 多窗口、多 thread、定时任务会互相覆盖全局 default。
- restart 会中断并发 run。
- 模型选择会变成全局状态，不符合当前 `{providerId, modelId}` per-run 语义。

推荐方案：

- 为每个 enabled model 生成稳定的 CCR model key。
- Agent Studio 调 Claude SDK 时把 `options.model` 设置为该 CCR model key。
- CCR 根据 model key 直接路由到对应 upstream provider/model。

示例：

```text
ProviderConnection:
  id = "conn_openai_main"
  profileId = "openai"
  modelId = "gpt-5.1"

CCR model key:
  "agentstudio/conn_openai_main/gpt-5.1"
```

若 CCR 不支持这种 model key 直连路由，需要在 PoC 阶段确认是否可以通过 transformer、provider model alias 或请求 header 实现同等能力。若三者都不可行，CCR 方案不能进入正式迁移。

## Provider Settings 语义调整

现有类型：

```ts
type CustomProviderProtocol = "openai-compatible" | "anthropic";

type AgentRuntime =
  | { protocol: "anthropic"; ... }
  | { protocol: "openai-compatible"; ... }
  | { protocol: "unsupported"; ... };
```

目标语义：

- `openai-compatible` 不再表示 Agent Studio 有一个 OpenAI runtime adapter。
- 它表示 CCR upstream 协议类型。
- runtime protocol 在产品层收敛为 Claude SDK。

建议新类型：

```ts
type UpstreamProtocol = "anthropic" | "openai-compatible";

interface AgentRuntimeCapabilities {
  textInput: boolean;
  imageInput: boolean;
  audioInput: boolean;
  tools: boolean;
  fileCheckpoint: boolean;
}

interface ProviderConnection {
  upstreamProtocol: UpstreamProtocol;
  baseUrl: string;
  apiKey: string;
  enabledModelIds: string[];
  defaultModelId: string | null;
}

interface RuntimeRoute {
  runtime: "claude-agent-sdk";
  gateway: "claude-code-router";
  ccrModelKey: string;
}
```

前端展示上仍保留“OpenAI-compatible”“Anthropic-compatible”协议选项；但描述要改成“上游协议”，不要暗示运行时不同。

## 多模态边界

### 图片输入

CCR 可以帮助把 Anthropic image content block 转到 upstream provider，但 Agent Studio 仍必须自己做产品层能力：

- 模型配置增加 `imageInput` 能力。
- `PromptInput` 的 `files` 被 `TaskMessageInput` 消费。
- `/runs` 请求从 `message.content: string` 升级到 `message.parts`。
- sidecar 校验 MIME、大小、数量，必要时落盘或转 base64。
- `provider-claude` 使用 Claude SDK 支持的 `SDKUserMessage` / Anthropic `MessageParam` content blocks，而不是纯 string prompt。

第一阶段 PoC 只验证 CCR 能处理 image block；正式 UI 可后续独立计划。

### 语音识别

语音识别不走 CCR 主链路。

推荐设计：

```text
audio file
  -> sidecar transcription service
  -> transcript text
  -> Claude SDK run as text part
```

原因：

- STT 是独立模型能力，不等同于 chat model input。
- CCR 主要解决 Claude Code / LLM routing，不应承担音频转写生命周期。
- transcript 可持久化、可审计、可重试，也更容易在 UI 展示。

配置上拆分：

```ts
chatModelSelection: ProviderModelSelection;
transcriptionModelSelection?: ProviderModelSelection;
```

## PoC 验收矩阵

正式删除 `provider-openai` 前必须完成 PoC。PoC 可以用一个临时开发脚本或隐藏配置，不改正式 UI。

验收项：

| 项 | 验收标准 |
|---|---|
| 普通流式 | OpenAI-compatible upstream 经 CCR 返回 token streaming，前端 AGUI 文本增量正常 |
| Tool call | 至少验证 Read、Bash、Edit；tool call start/result 在现有 ProcessGroup 中正常展示 |
| HITL | ask 模式下 Bash/Edit 暂停审批；approve / deny / always allow 行为与 Anthropic 一致 |
| Session resume | 同一 thread 第二轮能延续上下文，不丢失前文 |
| Regenerate | 从某轮 user message regenerate 后，历史截断、resumeSessionAt、文件回滚行为不退化 |
| File checkpoint | Write/Edit/NotebookEdit 生成的 checkpoint 可用于 rewindFiles；无法支持时必须明确标记为 blocker |
| Run 级模型选择 | 两个 thread 同时选择不同 OpenAI-compatible model，不改 CCR default、不重启 CCR，结果命中各自模型 |
| Usage | runs 表和 usage ledger 能记录模型名和 token/cost；CCR 无法提供 cost 时 token 仍需保存 |
| Cancel | 用户 Stop 后 SDK/CCR/upstream 都能及时中止，run terminal 状态正确 |
| Error mapping | API key 错、模型不存在、限流、上游 5xx 映射到现有 RUN_ERROR code |
| 图片 block | 至少用一张小 PNG 验证 Anthropic image content 经 CCR 到上游模型可识别 |

任何一项失败都必须分类：

- **Blocker**：破坏统一 runtime 的核心能力，例如 run 级模型选择、HITL、session resume。
- **Phase 2**：不阻塞 text/tools 迁移，例如图片 UI、成本精确计算。
- **Provider limitation**：模型自身不支持工具或图片，配置层标记能力即可。

## 迁移步骤

### Phase 0：PoC

- 用现有 `provider-claude` 指向本地 CCR。
- 手写或生成最小 CCR config，配置一个 OpenAI-compatible upstream。
- 跑完整验收矩阵。
- 记录必须 patch CCR 或 Agent Studio 的地方。

### Phase 1：托管 CCR

- 新增 `sidecar/src/ccr/*`。
- sidecar 启动时创建私有 CCR 运行目录。
- provider settings 变化时生成 CCR config。
- 增加 health endpoint 或内部 health probe。
- `provider-claude` 支持从 resolved provider 拿到 CCR base URL 和 ccrModelKey。

### Phase 2：Provider runtime 收口

- `provider-factory` 删除 `openai-compatible` runtime 分支。
- OpenAI-compatible provider resolve 为 CCR upstream route。
- 删除或废弃 `sidecar/src/agui/provider-openai/*`。
- 更新测试：所有 run 都断言进入 Claude SDK provider。
- Settings UI 文案改成“上游协议”。

### Phase 3：能力配置

- `AgentRuntimeCapabilities` 增加 `textInput`、`imageInput`、`audioInput`。
- 对远端模型能力未知时默认只启用 text；图片/音频由用户显式开启或由内置 profile 标记。
- 模型选择器展示能力标识，但不阻塞纯文本对话。

### Phase 4：图片输入

- 扩展 `PromptInput` 消费 `files`。
- `/runs` 增加 message parts。
- sidecar 校验附件并映射到 Claude SDK user message。
- CCR upstream 验证通过后开放 UI。

### Phase 5：语音转写

- 新增 transcription service。
- 增加 transcription model setting。
- 音频上传先转 transcript，再进入 run。

## 回滚策略

迁移期间保留安全开关：

```text
AGENT_STUDIO_DISABLE_CCR=1
```

行为：

- Anthropic provider 回退直连 `provider-claude`。
- OpenAI-compatible provider 在正式删除 OpenAI adapter 前可临时回退旧 `provider-openai`。
- 一旦 Phase 2 删除 OpenAI adapter，该开关只允许 Anthropic 直连；OpenAI-compatible run 返回 `ccr_disabled`，提示用户启用 CCR。

正式删除 `provider-openai` 的前置条件：

- PoC 验收矩阵中所有 Blocker 通过。
- 托管 CCR 在 dev 和 packaged sidecar 中均能启动。
- 至少一个 OpenAI-compatible upstream 和一个 Anthropic upstream 在端到端测试中通过。
- 文档明确旧配置如何迁移。

## 测试策略

单元测试：

- `CcrConfigBuilder`：provider connections -> CCR config。
- provider settings migration：旧 `openai-compatible` runtime 语义迁移为 upstream。
- `provider-factory`：所有 supported provider 最终进入 Claude SDK runtime。
- model key 生成：稳定、可逆、不因 display name 改变。

集成测试：

- sidecar 启动私有 CCR，health probe 通过。
- `/runs` 使用不同 providerSelection 生成不同 ccrModelKey。
- CCR 不可用时返回可诊断错误。

端到端手工验收：

- OpenAI-compatible 模型普通对话。
- 工具审批。
- regenerate。
- agent workspace with mounted folders。
- 远程 IM 触发 run。
- 定时任务后台 run。

## 风险与缓解

### CCR 升级破坏配置格式

缓解：把 CCR 配置格式封装在 `CcrConfigBuilder`；版本号写入日志；升级时只改一处。

### 上游模型工具调用不稳定

缓解：模型能力中区分 `tools` 与 `textInput`；默认只给经过验证的模型开启 tools；其他模型显示兼容性提示。

### run 级模型选择不可行

缓解：这是 Phase 0 blocker。若 CCR 无法支持无需重启的 run scoped model routing，则暂停 CCR 迁移，转向自研轻量 router 或 patch CCR。

### CCR 进程管理增加复杂度

缓解：只允许 sidecar 管理私有实例；启动失败进入明确降级；日志写入 app data；退出时 kill 子进程。

### API key 暴露面扩大

缓解：CCR config 文件写入 app-private 目录；限制文件权限；日志中永不输出完整 key；如果 CCR 支持环境变量引用，优先用 env 注入 key。

## 结论

采用 CCR 托管方案，目标是把 OpenAI-compatible provider 从“第二套弱 runtime”改为“Claude SDK runtime 下的 upstream”。这最符合“用户配置 OpenAI 协议模型后体验应与 Anthropic 相同”的产品目标。

但 CCR 迁移必须先经过 PoC，尤其验证 run 级模型选择、HITL、session resume、file checkpoint。PoC 通过后再删除 `provider-openai`，避免把现有基础可用能力替换成不可诊断的新网关问题。

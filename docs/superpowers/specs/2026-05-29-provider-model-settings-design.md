# 模型提供商设置设计

日期：2026-05-29

## 目标

将“设置 > 模型”页面从当前简化的 Anthropic/DeepSeek/自定义表单，升级为面向多个模型提供商的配置界面，支持：

- 内置提供商预设：Gemini、OpenAI、MiniMax、OpenRouter、Novita、AWS Bedrock、DashScope、SiliconFlow CN、SiliconFlow global、Zhipu、Moonshot 中国、Moonshot global、豆包、火山方舟、阿里云百炼、Qianfan、Hunyuan、Anthropic、DeepSeek，以及自定义 OpenAI-compatible API 服务。
- 对支持模型列表接口的提供商拉取远端模型列表。
- 允许用户从远端拉取结果中选择默认模型。
- 本阶段保留当前运行链路：改进 provider 设置和模型选择能力，但不改 AGUI 执行运行时，仍沿用当前 Anthropic-compatible SDK 路径。

## 非目标

- 不实现“模型来源”选择。
- 不支持手动 JSON 模型列表。
- 不在模型条目上标记 `curated`、`remote`、`custom` 等来源字段。
- 本阶段不为 Gemini、Bedrock、DashScope、火山方舟、Qianfan、Hunyuan 等非 Anthropic 协议实现完整运行时 adapter。
- 除继续消费已选择的模型、base URL、API key 外，不修改 `agui/provider-claude` 的行为。
- 不承诺每个内置 provider 都能通过当前 SDK 路径成功运行 agent turn。UI 需要支持配置和拉取模型；协议兼容属于后续独立项目。
- 本阶段不实现每个 provider 单独保存 API key。继续沿用当前“一个 active provider + 一个 active key”的模型。

## 当前状态

sidecar 通过 `sidecar/src/services/providerSettings.ts` 管理 provider 状态。当前会在 `settings` 表中用一行 `provider` JSON 持久化 active provider 配置。

provider catalog 当前在 `sidecar/src/lib/providerProfiles.ts`，只支持 `anthropic`、`deepseek` 和 `custom`。

前端设置页 `src/features/settings/sections/ModelSection.tsx` 硬编码了 provider 选项，支持编辑 base URL、API key。

`GET /models` 在 `sidecar/src/routes/models.ts` 中返回当前 profile 的模型列表，不会访问远端 provider。

## 推荐方案

采用“sidecar 统一维护 provider catalog + 模型拉取 adapter”的方案。

catalog 描述每个 provider 的展示信息、默认 base URL、fallback 模型列表、模型列表拉取策略。模型拉取 adapter 根据策略访问远端并归一化模型列表。使用 OpenAI-compatible models endpoint 的 provider 共享一个 adapter；协议不同的 provider 使用独立小 adapter；没有可靠模型列表接口的 provider 返回“不支持远端刷新”。

这样 provider 知识仍集中在 sidecar，前端不重复维护 provider 表，同时不破坏当前运行架构。

## 数据模型

扩展 provider profile 元数据：

- `id`：稳定 provider id，例如 `openai`、`gemini`、`moonshot-cn`、`moonshot-global`。
- `label`：展示名称。
- `region`：可选分组，例如 `Global`、`China`、`Cloud`。
- `baseUrl`：默认 API base URL。
- `modelList`：模型列表拉取策略定义。
- `models`：内置 fallback 模型列表，仅用于 built-in provider 没有远端缓存时保持当前体验。
- `supportsRemoteModels`：由 `modelList` 推导。
- `compatibilityNote`：可选短提示，用于说明当前运行时协议尚不支持的 provider。

扩展持久化 provider 状态：

- `profileId`：当前选择的 provider id。
- `baseUrl`：用户覆盖值，空字符串表示使用 provider 默认值。
- `apiKey`：当前 active API key。
- `remoteModels`：当前 provider 的远端模型缓存。
- `remoteModelsProviderId`：缓存所属 provider id。
- `remoteModelsBaseUrl`：缓存所属 base URL。
- `remoteModelsFetchedAt`：ISO 时间戳或空字符串。
- `selectedModelId`：可选默认模型 id。

模型条目保持简单：

- `id`
- `displayName`
- `description`

## API 设计

`GET /settings/provider`

返回：

- `current`：解析后的当前 provider 设置，包括 effective base URL、已选默认模型、模型缓存元数据、当前模型列表。
- `builtIn`：完整内置 provider catalog。

`POST /settings/provider`

接受 patch 更新：

- `profileId`
- `baseUrl`
- `apiKey`
- `selectedModelId`

旧的手动模型字段必须拒绝，避免客户端绕过远端刷新流程。

当 `profileId` 改变时，sidecar 解析新 provider 默认值，并保留 API key，除非用户主动清空。不同 provider/base URL 的远端缓存不能被展示为当前 provider 的模型。

`GET /models`

返回当前 active 模型列表。优先级：

1. 当前 provider 有匹配 provider id + base URL 的远端模型缓存：返回 cached remote models。
2. built-in provider 没有远端缓存：返回 catalog fallback models。
3. custom provider 没有远端缓存：返回空列表。

响应继续保留 `data` 作为模型数组，并新增 `defaultModelId`。如果 `selectedModelId` 存在且仍在 active 模型列表中，则它是默认模型；否则默认第一个模型 id；空列表为 `null`。

`POST /models/refresh`

为当前 provider 拉取远端模型列表，归一化后写入 `remoteModels`，并返回刷新后的模型列表。

错误码：

- `missing_api_key`
- `unsupported_remote_models`
- `invalid_provider_response`
- `remote_models_failed`

刷新失败时不能清空已有缓存或 fallback。

## 模型拉取 Adapter

新增 `sidecar/src/services/modelCatalog.ts` 或等价模块，暴露：

- `listModelsForProvider(input): Promise<ModelFetchResult>`
- 根据 provider `modelList.strategy` 选择 adapter。
- 将 provider 原始响应归一化为 `ProfileModel[]`。

初始策略：

- `openai-compatible`：使用 bearer API key 调用 provider 的模型列表 endpoint，并归一化 `data[].id`。
- `gemini`：Gemini 专用 adapter。
- `bedrock`：Bedrock 专用 adapter；如果当前单 key 设置模型无法表达所需 credentials/region，则允许返回 unsupported。
- `static`：不支持远端刷新，只使用 built-in fallback。
- custom provider：使用 active base URL，并按 OpenAI-compatible 模型列表接口拉取。

实现具体 URL 和请求结构前，需要查阅对应 provider 官方文档，避免凭记忆写过期 endpoint。

## 前端设计

`ModelSection` 不再硬编码 provider 选项，而是渲染 `GET /settings/provider` 返回的 `builtIn` catalog。

“设置 > 模型”页面包含：

- Provider select，展示内置 provider label。
- Base URL 输入框，默认填入 provider 默认值，允许用户覆盖。
- API key password 输入框和显示/隐藏 icon button。
- Model select，从 `/models` 填充。
- “刷新模型”按钮。
- 如果存在远端缓存，展示最后刷新时间。
- 为保存成功、刷新成功、不支持刷新、缺少 API key、远端错误展示明确状态。

自定义 provider 只有 Base URL、API key、远端刷新和模型选择；没有手动 JSON，也没有模型来源选择。

New Task 和 Task 里的模型选择器继续使用 `useAvailableModels()`。如果用户在设置页选择了默认模型，现有使用“第一个模型作为默认”的地方应改为使用 `defaultModelId`。

## 错误处理

远端拉取失败必须是非破坏性的：

- 保留已有 cached remote models。
- 如果 built-in provider 没有缓存，回退到 catalog fallback。
- 如果 custom provider 没有缓存，保持空模型列表。
- 在设置页展示用户可理解的错误信息。
- sidecar 返回结构化错误码，前端用 i18n 翻译。

provider 返回格式异常时，应视为 `invalid_provider_response`，不能静默当作空模型列表。

空远端列表不应替换当前可用模型列表。除非 provider 明确返回权威空列表，本阶段将空远端列表视为 invalid。

## 测试

sidecar 测试：

- Provider catalog 包含需求列出的所有 provider id，且 id 唯一。
- `providerSettings` 可以持久化 selected provider、selected model id、远端缓存。
- `providerSettings` 兼容旧 JSON，但不把旧手动 custom models 暴露为可选模型。
- `/settings/provider` 拒绝非法 provider id、非法 selected model id，以及旧手动模型/source 字段。
- `/models` 按 cached remote models、built-in fallback、custom empty 的优先级返回。
- `/models/refresh` 成功时更新缓存。
- `/models/refresh` 失败时保留已有缓存或 fallback。
- OpenAI-compatible adapter 能归一化 `{ data: [{ id }] }` 形式响应。
- Unsupported strategy 返回 `unsupported_remote_models`。

frontend 测试：

- `useAvailableModels()` 使用 sidecar 返回的 `defaultModelId`。
- `ModelSection` 渲染后端 catalog。
- `ModelSection` 刷新前先保存当前 provider 设置。
- `ModelSection` 展示刷新错误。
- `ModelSection` 不渲染模型来源选择或手动 JSON 编辑器。

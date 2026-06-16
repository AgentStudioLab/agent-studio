# 桌面端官方模型聊天扣积分设计

## 背景

桌面端已经具备官网登录态、OAuth token 刷新、侧边栏积分展示、provider/model 设置、以及通用的 `consumeDesktopCredits` 客户端。官网端也已有 `credit` 表、`consumeDesktopCredits`、`/api/desktop/credits`、`/api/desktop/me` 和 `/admin/credits` 后台页面。

缺口在于：桌面聊天选择“官方服务商”时，模型请求需要统一走官网服务端的中转代理，并且只有这条官方模型链路扣官网积分。用户自己新增的供应商继续走本地 sidecar 的现有 provider 逻辑，不扣官网积分。

## 目标

1. 官网服务端读取 `AI_PROXY_BASE_URL` 和 `AI_PROXY_API_KEY`，所有官方模型聊天请求都通过这个中转代理。
2. 桌面端模型供应商设置默认包含一个“官方服务商”，该服务商不能删除、不能修改、不能关闭。
3. 官方服务商默认启用中转站支持的全部模型。
4. 用户选择官方服务商模型聊天时，成功完成一次回复扣 1 积分，并刷新客户端积分值。
5. 用户选择自己新增的供应商聊天时，不走官网扣积分逻辑。
6. 官网后台能看到官方聊天消费记录。
7. 积分不足时，桌面端提示用户去官网充值积分。

## 非目标

- 本阶段不做按 token、模型倍率、上下文长度的动态计费。
- 本阶段不改造用户自建 OpenAI/Anthropic provider 的扣费逻辑。
- 本阶段不引入新的账本表；继续使用现有 `credit` 表记录消费。
- 本阶段不把中转站密钥下发到桌面端或 sidecar。

## 当前代码事实

官网仓库 `agent-studio-website`：

- `src/shared/models/credit.ts` 已有 `consumeCredits`、`consumeDesktopCredits`、`getRemainingCredits`。
- `src/app/api/desktop/credits/consume/route.ts` 已能通过 desktop bearer token 做幂等扣费。
- `src/app/api/desktop/me/route.ts` 返回 `credits.remainingCredits`。
- `src/app/[locale]/(admin)/admin/credits/page.tsx` 已按 `grant/consume` 展示积分流水，消费记录天然可见。

桌面端仓库 `agent-studio`：

- `src/features/auth/AuthProvider.tsx` 已提供 `ensureAuthenticated()`、`getValidAccessToken()`、`refreshUser()`。
- `src/features/auth/desktop-auth-client.ts` 已知道官网 origin，并已有 desktop API envelope 解析。
- `src/features/task/ProviderModelPicker.tsx` 使用 `ProviderModelSelection { providerId, modelId }`。
- `sidecar/src/services/providerSettings.ts` 已有 v3 provider connections、enabled models、default selection 和 run-time selection resolution。
- `sidecar/src/routes/runs.ts` 已把 `providerSelection` 传给 `runWorker`。
- `sidecar/src/server.ts` 已按 `providerSelection` 懒构建 provider 实例。

## 推荐方案

采用“官网官方 AI 代理 + sidecar 官方 provider”的架构。

桌面端选择官方服务商时，sidecar 不直接请求用户自配 API，也不读取中转站密钥，而是带用户的官网 desktop access token 请求官网 `POST /api/desktop/ai/chat`。官网验证用户、检查余额、调用中转站，模型成功完整返回后通过现有积分模型扣 1 积分并返回最新余额。sidecar 将官网代理响应转换成现有 AGUI 事件流，前端在终态后刷新 `auth.user.credits.remainingCredits`。

用户选择非官方 provider 时，保留现有 Anthropic/OpenAI-compatible provider 路径，不要求官网登录，不调用官网积分接口。

## 官网服务端设计

### 环境变量

新增服务端环境变量：

- `AI_PROXY_BASE_URL`：中转代理站基础地址。实现按 OpenAI-compatible 约定规范化 `/v1` 路径。
- `AI_PROXY_API_KEY`：中转代理站 API key。只在服务端使用，不返回给客户端。

`.env.dev` 或当前部署环境提供真实值；仓库只更新 `.env.example`，不提交本地密钥。

### `GET /api/desktop/ai/models`

用途：给桌面官方服务商拉取中转站支持的全部模型。

行为：

- 不要求 desktop bearer token；模型列表不是用户账务操作。
- 读取 `AI_PROXY_BASE_URL` 和 `AI_PROXY_API_KEY`。
- 请求中转站 OpenAI-compatible models endpoint。
- 返回 `{ models: [{ id, displayName, description }] }`。
- 缺配置返回 `official_ai_proxy_not_configured`。
- 上游失败返回 `official_ai_models_failed`。
- 不返回、不记录、不透传 `AI_PROXY_API_KEY`。

模型列表本身不是账务操作，不扣积分。实现可以对结果做短 TTL 内存缓存，减少设置页重复请求。

### `POST /api/desktop/ai/chat`

用途：官方模型聊天请求的唯一入口。

请求体：

```json
{
  "runId": "run_xxx",
  "threadId": "thread_xxx",
  "model": "gpt-5.1",
  "messages": [{ "role": "user", "content": "..." }]
}
```

鉴权：

- 使用现有 `requireDesktopAuth(req)` 校验 desktop bearer token。
- 未登录或 token 失效返回现有 desktop API 错误。

扣费规则：

- 每次官方模型成功完成一次回复扣 1 积分。
- 扣费 scene 固定为 `desktop_ai_chat`。
- 幂等 key 使用 `ai-chat:${runId}`，避免同一 run 重试重复扣费。
- metadata 写入 `runId`、`threadId`、`model`、`provider: "official"`、中转站 usage 信息。
- description 使用 `Official AI chat: <model>`。

请求流程：

1. 校验请求体，模型 id 和消息不能为空。
2. 查 `getRemainingCredits(userId)`，小于 1 时直接返回 `insufficient_credits`，不请求中转站。
3. 使用 `AI_PROXY_BASE_URL`、`AI_PROXY_API_KEY` 请求中转站 chat completions。
4. 上游失败或用户中止时返回错误，不扣积分。
5. 上游成功完成后调用 `consumeDesktopCredits({ amount: 1, scene: "desktop_ai_chat", idempotencyKey: "ai-chat:<runId>" })`。
6. 返回模型文本、usage、扣费后的 `remainingCredits`。

为保持账务一致，官网路由负责“查余额 + 调模型 + 记消费”的完整闭环。桌面端不直接调用 `/api/desktop/credits/consume` 为官方聊天扣费。

### 协议形态

官网到中转站按 OpenAI-compatible `/chat/completions` 实现。官网到 sidecar 使用桌面专用 NDJSON 流协议：

```jsonl
{"type":"text_delta","text":"..."}
{"type":"usage","usage":{"promptTokens":1,"completionTokens":2}}
{"type":"billing","remainingCredits":9}
{"type":"done"}
```

错误用同一条流返回：

```jsonl
{"type":"error","code":"insufficient_credits","message":"insufficient credits","remainingCredits":0}
```

sidecar official provider 只在收到 `done` 后发送 AGUI `RUN_FINISHED`；收到 `error` 时发送 AGUI `RUN_ERROR`。余额不足在上游请求前拦截，不会出现已输出内容才提示余额不足的常见路径。若上游已经流式完成但最后扣费失败，官网发送 `error`，sidecar 保留已显示文本但以 `RUN_ERROR` 结束并刷新余额。

## 桌面 sidecar 设计

### 官方服务配置

sidecar 不能直接读取 Vite 的 `VITE_AGENT_STUDIO_WEBSITE_ORIGIN`，因此由前端在启动后调用新的 sidecar 配置接口同步官网 origin：

- `POST /settings/official-service`：body 为 `{ "websiteOrigin": "https://www.agentstudio.chat" }`。
- sidecar 只在内存保存官网 origin 和官方模型缓存，不持久化用户 token。
- 每次官方 run 的 `POST /runs` 仍会携带 `officialAuthToken`，避免 sidecar 保存长期凭证。

### 官方连接

在 `sidecar/src/services/providerSettings.ts` 引入固定官方连接：

- `OFFICIAL_PROVIDER_ID = "official"`
- `profileId = "official"`
- `name = "官方服务商"`
- `enabled = true`
- `managed = true`
- `apiKey = ""`
- `baseUrl = ""`
- `enabledModelIds = all official models`
- `defaultModelId = first official model`

`ProviderConnectionSummary`、`ResolvedProviderConnection`、`EnabledModelOption` 增加 `managed: boolean`。用户自建连接为 `false`，官方连接为 `true`。官方连接在 `listConnections()`、`listEnabledModelSelections()`、`resolveSelection()` 中总是存在。

### 官方模型列表

sidecar 增加 official model catalog 服务：

- 通过前端同步的 `websiteOrigin` 请求 `/api/desktop/ai/models`。
- 成功后缓存到 sidecar 内存，缓存字段为 `{ models, fetchedAt }`。
- `/settings/provider` 读取当前缓存；如果缓存为空且已配置 `websiteOrigin`，先触发一次刷新再返回。
- 拉取失败时使用少量静态 fallback 模型，保证设置页仍可展示官方服务商。
- 官方模型默认全部启用，用户不能单独关闭。

### 禁止修改官方连接

以下路由遇到 `official` 直接拒绝：

- `POST /settings/provider/connections/official`
- `DELETE /settings/provider/connections/official`
- `POST /settings/provider/connections/official/models/enabled`
- `POST /settings/provider/connections/official/models/refresh` 可以允许触发刷新模型，但不能改变 enabled subset；成功后仍启用全部官方模型。

错误码使用稳定字符串：

- `official_provider_readonly`
- `cannot_delete_official_provider`

### 官方 provider 运行时

新增 `sidecar/src/agui/provider-official/`：

- 输入：官网 origin、desktop access token、model id、runId、threadId、用户消息。
- 请求：`POST /api/desktop/ai/chat`。
- 输出：转换成 AGUI `RUN_STARTED`、`TEXT_MESSAGE_*`、`RUN_FINISHED`、`RUN_ERROR`。
- 不持久化 desktop access token，不写入 provider settings。

`sidecar/src/server.ts` 的 `buildProviderForSelection()` 逻辑改为：

- `resolved.providerId === "official"`：构建 official provider。
- 否则沿用 `createAgentProviderForRuntime()`。

官方 provider 需要每次 run 都拿到当前有效 desktop access token，因此 token 从前端随 `POST /runs` 请求传入 run context，而不是存在 sidecar。

## 桌面前端设计

### 发送官方模型前鉴权

`TaskView` 和 `NewTaskView` 在发送 run 时判断当前 `providerSelection`：

- 如果选中的 provider 是 `official`，先调用 `auth.ensureAuthenticated()`。
- 然后调用 `auth.getValidAccessToken()`，把 token 放进 `POST /runs` 的 `officialAuthToken` 字段，并把 `getWebsiteOrigin()` 的值放进 `officialWebsiteOrigin` 字段。
- 如果未登录，打开现有网页登录流程，不创建 run，不扣积分。

如果没有显式选择模型，使用 provider state 的 `defaultSelection`；默认 selection 如果是官方，也走同样鉴权逻辑。

### 刷新积分

官方 run 终态后：

- `RUN_FINISHED`：调用 `auth.refreshUser()`，侧边栏积分更新。
- `RUN_ERROR code === "INSUFFICIENT_CREDITS"`：调用 `auth.refreshUser()`，并展示充值提示。

非官方 run 不强制刷新积分。

### 设置页

`ProviderConnectionList` 对官方连接：

- 显示“官方服务商”。
- 显示“官网管理”或锁定 badge。
- 隐藏编辑、删除、设为禁用等入口。
- 模型数展示为全部官方模型数量。

`ProviderConnectionDialog` 不打开官方连接。

### 积分不足提示

新增错误码和本地化文案：

- `INSUFFICIENT_CREDITS`
- 中文：`积分不足，请前往官网充值积分。`
- 英文：`Not enough credits. Please top up on the website.`

聊天错误区域对这个错误码渲染专门提示，并提供打开官网充值/设置页的按钮。充值 URL 使用 `VITE_AGENT_STUDIO_WEBSITE_ORIGIN`，路径指向官网现有的价格或用户积分页面。

## 数据流

```text
用户选择官方模型发送消息
  -> 前端确保官网登录并取得 access token
  -> POST sidecar /runs { providerSelection: official, officialAuthToken, officialWebsiteOrigin }
  -> sidecar official provider POST 官网 /api/desktop/ai/chat
  -> 官网校验 token + 检查余额
  -> 官网用 AI_PROXY_BASE_URL/API_KEY 请求中转站
  -> 中转站成功返回
  -> 官网 consumeDesktopCredits(amount=1, scene=desktop_ai_chat)
  -> sidecar 转换为 AGUI 终态
  -> 前端 auth.refreshUser()
  -> 侧边栏积分更新，官网后台 credit 消费记录可见
```

非官方模型：

```text
用户选择自建 provider 发送消息
  -> POST sidecar /runs { providerSelection: custom/provider-id }
  -> sidecar 现有 Anthropic/OpenAI-compatible provider
  -> 不请求官网 AI chat，不扣积分
```

## 错误处理

- 未登录：前端在创建 run 前触发登录，不写 run，不扣积分。
- 余额不足：官网返回 `insufficient_credits`；sidecar 写 `RUN_ERROR code: "INSUFFICIENT_CREDITS"`；前端提示充值并刷新积分。
- 官网代理未配置：官网返回 `official_ai_proxy_not_configured`；sidecar 写普通 `RUN_ERROR`；不扣积分。
- 中转站失败：官网返回 `official_ai_upstream_failed`；sidecar 写普通 `RUN_ERROR`；不扣积分。
- 用户中止：sidecar abort 传播到 official provider；官网请求中止时不扣积分。
- 扣费幂等冲突：`consumeDesktopCredits` 返回最新余额，不重复扣。
- 用户自建 provider：不要求官网登录，不调用扣积分接口。

## 测试计划

### 官网服务端

- `GET /api/desktop/ai/models`：
  - 使用 `AI_PROXY_BASE_URL` 和 `AI_PROXY_API_KEY` 请求中转站。
  - 正确归一化模型列表。
  - 缺配置返回 `official_ai_proxy_not_configured`。
  - 不泄漏 API key。

- `POST /api/desktop/ai/chat`：
  - 未登录拒绝。
  - 余额不足返回 `insufficient_credits`，且不调用中转站。
  - 中转站失败不调用 `consumeDesktopCredits`。
  - 成功完成后扣 1 积分，返回最新余额。
  - 同一 `runId` 重试不重复扣费。
  - metadata 包含 `runId`、`threadId`、`model`、`provider`。

### 桌面 sidecar

- `POST /settings/official-service` 保存前端同步的 `websiteOrigin`，并拒绝非 http/https origin。
- provider settings 初始化后始终包含 `official` 连接。
- 官方连接不能 update/delete/disable。
- 官方模型进入 `enabledModels`，默认 selection 可指向官方模型。
- `resolveSelection({ providerId: "official", modelId })` 返回 official runtime。
- 官方 provider 将官网 `insufficient_credits` 映射为 `INSUFFICIENT_CREDITS`。
- 非官方 provider selection 不调用 official provider。

### 桌面前端

- 启动后会把 `getWebsiteOrigin()` 同步到 sidecar 的 `/settings/official-service`。
- 选择官方模型发送时，会先确保登录并向 sidecar 传 `officialAuthToken` 和 `officialWebsiteOrigin`。
- 未登录时不创建 run，显示现有登录流程。
- 官方 run 成功后调用 `auth.refreshUser()`。
- 官方 run 余额不足后展示充值提示并调用 `auth.refreshUser()`。
- 自建 provider 发送时不要求登录、不传 official token。
- 设置页官方连接不显示编辑/删除入口。

## 验收标准

1. 登录官网账号，给账号 1 积分。
2. 桌面端选择官方服务商模型聊天一次。
3. 回复成功后，桌面侧边栏积分从 1 变为 0。
4. 官网后台 `/admin/credits?type=consume` 出现一条 `desktop_ai_chat` 的 `-1` 消费记录。
5. 再次使用官方模型聊天，桌面端提示积分不足并引导去官网充值。
6. 切换到用户自建 provider 聊天，官网积分不变化。

## 实施顺序

1. 官网端新增 AI proxy env、models API、chat API 与测试。
2. 桌面 sidecar 新增 official provider profile/connection、只读保护与测试。
3. 桌面前端接入官方发送鉴权、积分刷新、余额不足提示与设置页锁定 UI。
4. 运行官网和桌面端的相关测试，再做一次手动端到端验收。

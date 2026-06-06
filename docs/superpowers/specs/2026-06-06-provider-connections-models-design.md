# Provider 连接与多模型选择设计

日期：2026-06-06

## 目标

重构模型设置体验，从“一个 active provider preset + 一个 selected model”升级为“多个 Provider 连接 + 每个连接可启用多个模型 + 对话时选择具体模型”。

本设计修正 `docs/superpowers/specs/2026-06-06-provider-presets-design.md` 的第一版假设。第一版把“provider 配置”和“当前使用的模型”绑定在同一个 preset 上，导致两个问题：

- 只有设为当前使用的 preset 才能刷新模型。
- 一个 provider 只能表达一个 selected model，不能像 AionUI 那样配置一个提供商下的多个可用模型。

新的目标是：

- 设置页像 AionUI 一样以 provider 连接列表为主。
- 新增 / 编辑 provider 使用弹框，不在页面平铺配置表单。
- 每个 provider 可以独立刷新远端模型，不依赖是否当前使用。
- 每个 provider 可以启用多个模型。
- 对话页选择的是具体 `{providerId, modelId}`，而不是只选择 provider。

## 非目标

- 不实现 per-model 参数模板，例如 temperature、top_p、max tokens。
- 不改变 OpenAI-compatible runtime 当前能力边界；它仍是 text streaming first，不承诺 tools、HITL、file checkpoint。
- 不实现完整 Cherry Studio 式 provider 账号体系，例如 provider 账号、模型 marketplace、模型参数、计费统计多层拆分。
- 不允许一个 run 运行中途切换模型；运行开始后使用启动时选择的 provider/model。
- 不改变“一条 thread 同时只能有一个 live run”的 invariant。
- 不要求 scheduled task / agent workspace 立即完全迁移到新选择语义；若现有裸 model picker 仍有独立业务含义，可以作为兼容路径保留到后续计划。

## 当前问题

当前已落地的 provider preset 方案把一个 preset 定义为：

- provider profile
- base URL
- API key
- remote models cache
- selected model

这会把三类不同概念耦合在一起：

1. **连接配置**：API key、base URL、provider profile。
2. **模型目录**：远端 `/models` 拉到的模型列表。
3. **使用选择**：对话当前要用哪个 provider/model。

因此出现：

- 刷新模型只能通过 active preset 完成，非 active provider 无法维护模型列表。
- 对话页选择 provider preset 时实际是在切全局 active provider，会影响其他对话和设置页状态。
- 一个 provider 下多个模型必须拆成多个 preset，API key 和 base URL 被重复保存。
- 设置页配置表单平铺在列表旁，随着字段增多会变成低密度、难管理的 UI。

## 推荐方案

把数据模型拆成两层：

1. **ProviderConnection**：一个可连接的模型服务提供商配置。
2. **EnabledModelSelection**：一个 provider 下被用户启用、可用于对话的模型。

设置页管理 ProviderConnection；对话页只展示 enabled model selections。

运行时不再读取“active preset”，而是按 run request 中的 `{providerId, modelId}` resolve 出当前 provider。如果 request 没带选择，则使用全局默认选择。

## 数据模型

`settings.key = "provider"` 的新持久化结构升级为 `version: 3`：

```ts
interface PersistedProviderSettingsV3 {
  version: 3;
  defaultSelection: ProviderModelSelection | null;
  connections: ProviderConnection[];
}

interface ProviderModelSelection {
  providerId: string;
  modelId: string;
}

interface ProviderConnection {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  remoteModels: ProfileModel[];
  remoteModelsProviderId: ProviderProfileId | "";
  remoteModelsBaseUrl: string;
  remoteModelsFetchedAt: string;
  enabledModelIds: string[];
  defaultModelId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

字段规则：

- `id` 由 sidecar 生成，稳定保存。
- `name` 是用户可编辑的 provider 显示名，允许重复，但 UI 不依赖名称定位。
- `enabled` 控制该 provider 是否出现在对话模型选择器中。
- `remoteModels` 是远端模型缓存，按 `profileId + effective baseUrl` 隔离。
- `enabledModelIds` 是用户启用的模型集合。为空时，该 provider 不贡献可选模型。
- `defaultModelId` 必须为空或属于 `enabledModelIds`。
- `defaultSelection` 必须为空或指向一个 enabled provider 下的 enabled model。

## 迁移规则

`providerSettings` 读取 `settings.provider` 时按顺序兼容：

1. `version: 3` 且包含有效 `connections`：直接读取，必要时修复失效的 `defaultSelection`。
2. `version: 2` provider preset store：把每个 preset 迁移为一个 `ProviderConnection`。
   - `preset.id` 迁为 `connection.id`。
   - `preset.name` 迁为 `connection.name`。
   - `preset.selectedModelId` 如果存在，加入 `enabledModelIds` 并作为 `defaultModelId`。
   - `activePresetId + selectedModelId` 迁为全局 `defaultSelection`。
   - 如果 preset 有 `remoteModels`，保留原缓存。
3. 旧单 provider 对象：生成一个 connection。
4. 数据损坏或缺失：创建一个 disabled=false 的默认 Anthropic connection；如果有 env fallback API key/base URL，写入该 connection。

迁移读取必须容错；写入 mutation 时持久化为 v3。

## Sidecar 服务接口

`providerSettings` 从“active current”接口演进为连接 + selection resolve 接口。

核心接口：

```ts
interface ProviderSettingsState {
  listConnections(): ProviderConnectionSummary[];
  getConnection(id: string): ResolvedProviderConnection | null;
  createConnection(input: CreateProviderConnectionInput): ResolvedProviderConnection;
  updateConnection(id: string, patch: ProviderConnectionPatch): ResolvedProviderConnection | null;
  deleteConnection(id: string): DeleteProviderConnectionResult;
  refreshConnectionModels(id: string): Promise<ResolvedProviderConnection>;
  setEnabledModels(id: string, modelIds: string[]): ResolvedProviderConnection | null;
  setDefaultSelection(selection: ProviderModelSelection | null): ProviderModelSelection | null;
  listEnabledModelSelections(): EnabledModelOption[];
  resolveSelection(selection?: ProviderModelSelection | null): ResolvedProviderForRun;
  getApiKey(): string;
  onChange(cb: () => void): () => void;
}
```

`onChange()` 触发规则：

- provider runtime 可能受影响时触发：API key、base URL、profile、enabled models、default selection 变化。
- 只更新非默认 provider 的名称可以不触发 runtime cache 失效。
- 刷新模型后如果 enabled/default 模型仍有效，可以只让 frontend query invalidation 更新 UI；如果默认模型被修复，则触发 `onChange()`。

## HTTP API

### 读取设置

`GET /settings/provider`

返回：

```ts
{
  version: 3,
  defaultSelection: { providerId: string, modelId: string } | null,
  connections: ProviderConnectionSummary[],
  enabledModels: EnabledModelOption[],
  builtIn: ProviderProfile[]
}
```

`ProviderConnectionSummary` 不返回完整 API key；只返回 `hasApiKey`：

```ts
interface ProviderConnectionSummary {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  providerLabel: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  modelCount: number;
  enabledModelCount: number;
  defaultModelId: string | null;
  remoteModelsFetchedAt: string;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}
```

### 连接 CRUD

`POST /settings/provider/connections`

创建 provider connection。请求：

```ts
{
  name?: string;
  profileId?: ProviderProfileId;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}
```

`GET /settings/provider/connections/:id`

返回完整可编辑详情，包括 API key 和 remote model cache：

```ts
{
  connection: ResolvedProviderConnection
}
```

`POST /settings/provider/connections/:id`

更新连接字段：

```ts
{
  name?: string;
  profileId?: ProviderProfileId;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  defaultModelId?: string | null;
}
```

`DELETE /settings/provider/connections/:id`

删除连接。删除后如果 `defaultSelection` 指向该连接，则自动选择第一个可用 enabled model；没有可用模型则置空。

### 模型刷新与启用

`POST /settings/provider/connections/:id/models/refresh`

刷新指定 provider 的模型列表。它不要求该 provider 是当前默认，也不改变全局默认选择。

成功后：

- 写入该 connection 的 `remoteModels*`。
- 移除不存在于新模型列表中的 `enabledModelIds`。
- 如果 `defaultModelId` 不再存在，修复为第一个 enabled model 或 null。
- 如果全局 `defaultSelection` 失效，修复为第一个可用 enabled model 或 null。

`POST /settings/provider/connections/:id/models/enabled`

设置该 provider 下启用的模型：

```ts
{
  modelIds: string[],
  defaultModelId?: string | null
}
```

规则：

- `modelIds` 必须来自该 connection 当前 resolved model list。
- 如果传 `defaultModelId`，必须在 `modelIds` 内。
- 如果未传 `defaultModelId` 且原默认已失效，自动使用 `modelIds[0] ?? null`。

### 默认选择

`POST /settings/provider/default-selection`

设置新对话默认模型：

```ts
{
  providerId: string,
  modelId: string
}
```

请求必须指向 enabled provider 下的 enabled model。

### 兼容接口

旧接口短期保留：

- `GET /models`：返回全局 `defaultSelection` 所在 provider 的 enabled models；如果没有 defaultSelection，返回所有 enabled models 的扁平列表，并给出第一个作为 default。
- `POST /models/refresh`：刷新 defaultSelection 对应 provider；如果没有 defaultSelection，返回 `no_default_model`。
- `POST /settings/provider`：兼容更新 defaultSelection 对应 provider；如果没有 defaultSelection，则更新第一个 connection。新 UI 不再使用它。

兼容接口只用于减少一次性迁移风险；新设置页和新对话模型选择器应使用 v3 API。

## 运行时选择

`POST /runs` 和 `POST /threads/:id/regenerate` 增加可选字段：

```ts
{
  providerSelection?: {
    providerId: string;
    modelId: string;
  }
}
```

处理规则：

1. 如果请求带 `providerSelection`，sidecar 使用该选择 resolve provider。
2. 如果未带，使用 `defaultSelection`。
3. 如果 selection 无效，返回结构化错误 `invalid_provider_selection`。
4. 如果 provider 的 `agentRuntime.protocol` 是 `unsupported`，返回 `unsupported_provider_runtime`。

`model` 字段作为旧字段短期兼容：

- 如果同时传 `providerSelection` 和 `model`，以 `providerSelection` 为准。
- 如果只传 `model`，优先在 default provider 的 enabled models 中查找；找不到再在所有 enabled models 中查找第一个 matching model id。
- 新前端不再发送裸 `model`。

## 设置页交互

设置页 Model section 改成列表主界面。

顶部：

- 标题：`模型`
- 说明：`配置可用于对话的模型服务。每个提供商可以启用多个模型。`
- 操作：`+ 添加模型`
- 可选：`清除状态`，用于清空临时错误/刷新提示，不清除配置。

列表行参考 AionUI：

- 左侧：展开箭头、provider 名称。
- 中间：`模型 (N)`、`API Key (有/无)`、runtime 状态。
- 右侧：启用开关、添加模型按钮、删除按钮、编辑按钮。

行内行为：

- 点击展开箭头：展示该 provider 已启用模型列表。
- 点击启用开关：切换 provider 是否出现在对话模型选择器中。
- 点击添加模型：打开模型选择弹框，焦点在模型启用区。
- 点击编辑：打开 provider 配置弹框。
- 点击删除：如果 provider 下仍有 enabled models 或是默认 selection，需要二次确认。

## Provider 配置弹框

弹框用于新增和编辑 provider。

字段：

- Provider 类型。
- 显示名称。
- Base URL。
- API Key，带显示/隐藏按钮。
- Runtime 能力提示。
- 模型管理区。

动作：

- `测试连接 / 刷新模型`：调用指定 connection 的 refresh API，不要求设为默认。
- `保存`：保存连接配置。
- `取消`：关闭弹框，丢弃未保存表单改动。

模型管理区：

- 展示 remote models 或 built-in catalog models。
- 支持搜索。
- 支持勾选多个模型作为 enabled models。
- 支持选择一个默认模型。
- 如果 provider 不支持远端刷新，则展示 built-in models 或提示当前 provider 需要手动输入模型。

Custom provider：

- Base URL 必填。
- API key 可选，但刷新远端模型时没有 key 应返回 `missing_api_key`。
- 如果远端刷新失败，可以允许用户手动添加模型 id。手动模型只属于该 custom provider。

## 对话页模型选择器

对话输入框里的模型选择器展示 enabled model options，而不是 provider presets。

展示形式：

```text
OpenRouter
  GPT-5.1
  Claude Sonnet 4.5

SiliconFlow
  DeepSeek-V3.2
```

每个选项显示：

- 模型 display name。
- provider 名称。
- runtime 能力标签，例如 `text only`。

选择行为：

- 新对话：默认选中 `defaultSelection`。
- 已有对话且尚未开始 run：允许切换。
- 当前 thread 有历史消息后：本阶段仍锁定选择器，避免同一 thread 中途混用 provider 导致上下文语义不清。
- run 进行中或 awaiting approval：禁用选择器。

发送行为：

- 新前端调用 `send(text, { permissionMode, providerSelection })`。
- `providerSelection` 由 UI 当前选择决定。
- 如果用户未选择，省略字段，让 sidecar 使用 `defaultSelection`。

## 错误处理

后端结构化错误：

- `provider_connection_not_found`
- `cannot_delete_last_connection`
- `invalid_provider_profile`
- `invalid_provider_selection`
- `missing_api_key`
- `unsupported_remote_models`
- `unsupported_provider_runtime`
- `remote_models_fetch_failed`
- `invalid_enabled_model_ids`

前端展示：

- 刷新失败显示在弹框模型区，不关闭弹框。
- API key 缺失提示直接靠近 API key 字段。
- 删除默认 provider 时用确认弹框说明会重置默认模型。
- 对话页没有可用模型时，模型选择器显示 `配置模型`，点击跳转设置页。

## 文件与组件边界

Sidecar：

- `sidecar/src/services/providerSettings.ts`
  - v3 持久化、迁移、连接 CRUD、enabled model 管理、selection resolve。
- `sidecar/src/routes/settings.ts`
  - 新增 `/settings/provider/connections*` 和 `/settings/provider/default-selection`。
- `sidecar/src/routes/models.ts`
  - 保留兼容 `/models` 和 `/models/refresh`。
- `sidecar/src/agent/runWorker.ts` 和 provider factory 路径
  - 接收 `providerSelection` 并 resolve 当前 run provider。

Frontend：

- `src/features/settings/sections/ModelSection.tsx`
  - 维持 thin composer，拆出列表和弹框子组件。
- `src/features/settings/sections/ProviderConnectionList.tsx`
  - provider 列表。
- `src/features/settings/sections/ProviderConnectionDialog.tsx`
  - 新增 / 编辑弹框。
- `src/features/settings/sections/ProviderModelSelector.tsx`
  - 弹框内模型启用和默认模型选择。
- `src/features/task/ProviderPresetPicker.tsx`
  - 重命名为 `ProviderModelPicker.tsx`，展示 enabled model options。
- `src/lib/data/settings.ts`
  - v3 类型和 client methods。
- `src/lib/agui/runtime/api.ts`
  - run/regenerate 请求支持 `providerSelection`。

## 测试策略

Sidecar tests：

- v2 preset store 迁移到 v3 connections。
- 旧单 provider 迁移到 v3 connection。
- 非默认 provider 可以刷新模型。
- 刷新模型只更新目标 connection。
- enabled model ids 会随 remote model list 修复。
- defaultSelection 失效时自动修复。
- run request 带 providerSelection 时 resolve 到指定 provider/model。
- invalid providerSelection 返回结构化错误。
- 兼容 `/models/refresh` 仍只刷新默认 selection provider。

Frontend tests：

- ModelSection 渲染 provider list，不再平铺配置表单。
- 点击 `+ 添加模型` 打开弹框。
- 编辑按钮打开弹框并加载完整 connection。
- 非默认 provider 可点击刷新模型。
- 模型启用多选会调用 enabled models API。
- 删除默认 provider 显示确认并修复默认选择。
- 对话模型选择器按 provider 分组展示 enabled models。
- run 中 / 有历史消息时模型选择器禁用。
- 发送新消息时携带 providerSelection。

Typecheck：

- `cd sidecar && bunx tsc --noEmit`
- `bunx tsc --noEmit -p tsconfig.app.json`

## 实施顺序建议

1. Sidecar v3 store 和迁移。
2. Connection CRUD / refresh / enabled models API。
3. Run request providerSelection resolve。
4. Frontend settings client v3 类型。
5. Settings provider list + dialog UI。
6. Conversation ProviderModelPicker。
7. 兼容接口和旧组件清理。

## 自审

- 没有把刷新模型绑定到当前默认 provider。
- 明确支持一个 provider 多个 enabled models。
- 明确对话页选择具体 provider/model。
- 保留 OpenAI-compatible runtime 现有能力限制，没有扩大 runtime 协议承诺。
- 保留 scheduled task / agent workspace 兼容空间，避免把本次 UI 重构扩大成所有业务入口迁移。
- 新 API 与旧兼容 API 分开，避免前端继续依赖 active preset 语义。

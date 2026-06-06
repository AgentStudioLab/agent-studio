# 模型预设配置设计

日期：2026-06-06

## 目标

将当前“只能配置一个 provider + 一个 selected model”的模型设置，升级为“多个模型预设 + 一个当前预设”。

一个模型预设代表一个可运行的模型服务配置，包含：

- 预设名称。
- provider profile，例如 Anthropic、OpenAI、SiliconFlow、自定义 OpenAI-compatible 服务。
- base URL。
- API key。
- selected model id。
- 该 provider/base URL 下的远端模型缓存。

设置页负责管理多个预设。对话页可以直接从已配置好的预设中选择当前模型服务。sidecar 运行时继续只消费一个 active preset，保证本阶段不引入多运行时并发语义。

## 非目标

- 不实现每个 thread 独立绑定模型预设。
- 不支持一个 run 运行中途切换模型。
- 不重做 provider catalog、model list adapter 或 OpenAI-compatible runtime 的协议能力。
- 不实现完整 Cherry Studio 式 provider 账号体系，例如 provider 账号与模型启用状态分两层管理。
- 不在本阶段实现 per-model 参数模板，例如 temperature、top_p、max tokens。
- 不改变现有 OpenAI-compatible runtime 的能力限制；它仍是 text streaming first，不承诺 tools、HITL、file checkpoint。

## 当前状态

sidecar 使用 `sidecar/src/services/providerSettings.ts` 维护 provider 设置，并把一个 JSON 对象写入 `settings.key = "provider"`。

当前持久化对象只有一个 active 配置：

- `profileId`
- `baseUrl`
- `apiKey`
- `remoteModels`
- `remoteModelsProviderId`
- `remoteModelsBaseUrl`
- `remoteModelsFetchedAt`
- `selectedModelId`

`providerSettings.current()` 返回一个 `ResolvedProvider`。`server.ts` 通过它创建 agent provider，并用 `selectedModelId` 作为默认模型。`providerSettings.onChange()` 用于让 server 失效已缓存的 provider。

前端设置页 `src/features/settings/sections/ModelSection.tsx` 编辑这一个 active 配置。对话页和 new task 当前只消费 `/models` 返回的 active 模型列表，没有独立的“已配置模型服务”选择。

## 推荐方案

采用“Provider Preset”模型：把旧的单配置迁移成预设列表。

sidecar 仍然是 provider/model truth 的单一来源。前端不复制 provider catalog，也不自己拼运行时信息。所有可运行预设都来自 `/settings/provider`。

第一阶段保持全局 active preset：

- 设置页可新增、复制、重命名、删除、编辑预设。
- 设置页可设置 active preset。
- 对话页可选择一个已配置预设，并把它切为全局 active preset。
- 新 run 创建时读取当前 active preset。
- 如果已有 run 正在运行或等待审批，对话页模型选择器禁用。

这样能满足“直接切换模型服务”的需求，同时不需要马上修改 thread schema、scheduled task schema 和 run creation contract。

## 数据模型

`settings.key = "provider"` 的新结构：

```ts
interface PersistedProviderSettingsV2 {
  version: 2;
  activePresetId: string;
  presets: ProviderPreset[];
}
```

`ProviderPreset`：

```ts
interface ProviderPreset {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  remoteModels: ProfileModel[];
  remoteModelsProviderId: ProviderProfileId | "";
  remoteModelsBaseUrl: string;
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

字段约束：

- `id` 由 sidecar 生成，稳定保存。
- `name` 必须是非空字符串，sidecar 需要 trim；重复名称允许，因为运行时依赖 id。
- `profileId` 沿用现有 `ProviderProfileId`，包括 `custom`。
- `remoteModels*` 仍按 provider id + effective base URL 隔离，避免 endpoint 切换后泄漏旧模型列表。
- `selectedModelId` 可以为空；解析模型列表时继续 fallback 到第一个可见模型。

## 迁移规则

`providerSettings` 读取 `settings.provider` 时按顺序兼容：

1. 如果是 `version: 2` 且包含有效 `presets`，按新结构读取。
2. 如果是旧单配置对象，生成一个默认 preset：
   - `id`：新生成。
   - `name`：优先使用 resolved provider label；失败时为 `Default`。
   - 旧字段原样迁入 preset。
   - `activePresetId` 指向该 preset。
3. 如果数据损坏或缺失，创建一个默认 Anthropic preset，继续使用 env fallback 中的 `apiKey` 和 `baseUrl`。

迁移只在下一次 `update()` 或 preset mutation 时写回 v2。读取时不应该因为旧格式而崩溃。

## Resolved Provider

现有 `ResolvedProvider` 继续表示 active preset 的解析结果，并新增 preset 元信息：

```ts
interface ResolvedProvider {
  presetId: string;
  presetName: string;
  profileId: ProviderProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}
```

`providerSettings.current()` 继续返回 active preset 的 `ResolvedProvider`。这样 `server.ts`、`/models` 和现有运行时路径只需要小范围适配。

## Provider Settings API

`GET /settings/provider`

返回：

```ts
{
  current: ResolvedProvider;
  activePresetId: string;
  presets: ProviderPresetSummary[];
  builtIn: ProviderProfile[];
}
```

`ProviderPresetSummary` 用于 UI 列表，应该包含：

- `id`
- `name`
- `profileId`
- `providerLabel`
- `baseUrl`
- `selectedModelId`
- `selectedModelLabel`
- `agentRuntime`
- `supportsRemoteModels`
- `remoteModelsFetchedAt`
- `compatibilityNote`

为了避免泄漏和误展示，summary 不需要包含完整 `remoteModels`；API key 是否返回沿用现有设置页行为。本阶段为了保持表单可编辑，`current.apiKey` 可以继续返回，但 preset 列表不展示 key。

`POST /settings/provider`

继续作为兼容接口，默认更新 active preset，接受：

- `profileId`
- `baseUrl`
- `apiKey`
- `selectedModelId`

返回 `{ current }`，同时触发 `onChange()`。

`POST /settings/provider/presets`

创建新 preset。请求：

```ts
{
  name?: string;
  copyFromPresetId?: string;
  activate?: boolean;
}
```

默认行为是从 active preset 复制，生成一个新名称，例如 `OpenAI GPT-5.1 Copy`。如果不复制，则使用默认 Anthropic preset 或 provider catalog 的第一个可运行项。创建后不自动激活，除非请求显式传入 `activate: true`。

`GET /settings/provider/presets/:id`

读取指定 preset 的完整可编辑详情。设置页编辑非 active preset 时使用这个接口，避免在列表 summary 中返回每个 preset 的 API key 和完整 remote model cache。

返回：

```ts
{
  preset: ResolvedProvider;
}
```

如果读取的是非 active preset，`preset` 仍按该 preset 自身字段 resolve，但不会改变 `activePresetId`，也不会触发 `onChange()`。

`POST /settings/provider/presets/:id`

更新指定 preset，接受：

- `name`
- `profileId`
- `baseUrl`
- `apiKey`
- `selectedModelId`

如果更新的是 active preset，触发 `onChange()`；如果更新非 active preset，只更新持久化和列表展示，不影响当前 runtime。

`POST /settings/provider/presets/:id/activate`

切换 active preset。返回 `{ current, activePresetId }` 并触发 `onChange()`。

`DELETE /settings/provider/presets/:id`

删除 preset。规则：

- 禁止删除最后一个 preset，返回 `cannot_delete_last_preset`。
- 删除不存在的 preset 返回 `preset_not_found`。
- 删除非 active preset 不影响 runtime。
- 删除 active preset 时，自动切换到剩余 preset 的第一个，并触发 `onChange()`。

## Models API

`GET /models`

继续返回 active preset 的模型列表：

```ts
{
  data: ProfileModel[];
  defaultModelId: string | null;
}
```

解析优先级不变：

1. active preset 的 remote cache 与 provider id + effective base URL 匹配：返回 cached remote models。
2. built-in provider 没有 remote cache：返回 catalog fallback models。
3. custom provider 没有 remote cache：返回空列表。

`POST /models/refresh`

默认刷新 active preset。成功后只写 active preset 的 `remoteModels*` 字段，并触发 `onChange()`。

后续可选扩展：

```ts
POST /models/refresh { presetId?: string }
```

本阶段可以先不暴露该参数，避免非 active preset 刷新后是否影响 runtime 的语义过早复杂化。

## 设置页设计

`ModelSection` 拆成两个区域：

- 预设列表：展示所有已配置模型服务。
- 预设详情：编辑当前选中的 preset。

预设列表展示：

- 预设名称。
- provider label。
- selected model label 或 model id。
- active 状态。
- runtime 能力提示，例如 Anthropic-compatible、OpenAI-compatible text-only、unsupported。

操作：

- 新增：从当前 preset 复制，生成新 id 和新名称。
- 复制：复制指定 preset。
- 重命名：编辑 `name`。
- 删除：禁止删除最后一个；删除 active 时提示会切换到其他 preset。
- 设为当前：调用 activate API。

详情表单沿用现有字段：

- provider select。
- base URL input。
- API key password input + 显示隐藏 icon。
- model select。
- refresh models。
- save。
- remote fetched at。
- runtime status。

当用户切换 provider 时：

- base URL 填入 provider 默认值。
- selected model 切到该 provider fallback 列表第一项。
- remote model cache 不跨 provider/base URL 复用。

## 对话页模型选择

对话页增加一个模型预设选择器，数据来自 `GET /settings/provider` 的 `presets`。

选择器展示已配置好的模型服务，而不是裸 model id：

- `OpenAI · GPT-5.1`
- `SiliconFlow · DeepSeek-V3.2`
- `Custom · Qwen`

选择一个 preset 后调用：

```http
POST /settings/provider/presets/:id/activate
```

切换后：

- invalidate `provider` 和 `models` query。
- 下一个新 run 使用新的 active preset。
- 已有历史消息不重写模型信息。

禁用规则：

- 当前 thread 有 `running` run 时禁用。
- 当前 thread 有 `awaiting_approval` run 时禁用。
- 如果全局状态能发现其他 thread 有 active run，本阶段可以不阻止；运行时读取是在新 run 创建时发生，已有 run 不受影响。

UI 提示：

- OpenAI-compatible runtime 显示 text-only 能力提示。
- unsupported runtime 的 preset 可以展示，但发送前应该阻止创建 run，并提示该 provider runtime 尚未实现。

## 运行时数据流

`server.ts` 继续监听 `providerSettings.onChange()`。

以下操作触发 `notify()`：

- 更新 active preset。
- 切换 active preset。
- 删除 active preset 并自动切换。
- 刷新 active preset 模型缓存。

以下操作不触发 provider runtime 失效：

- 更新非 active preset。
- 删除非 active preset。
- 创建非 active preset。

run 创建时继续读取：

- `providerSettings.current().agentRuntime`
- `providerSettings.current().apiKey`
- `providerSettings.current().selectedModelId`

因此本阶段不会让一个 run 携带自己的 preset snapshot。未来如果实现 per-thread 或 per-run model，需要在 run creation contract 中显式保存 `presetId` 或 resolved provider snapshot。

## 错误处理

新增错误码：

- `preset_not_found`
- `invalid_preset_name`
- `cannot_delete_last_preset`
- `invalid_active_preset`

现有错误码继续保留：

- `invalid_profile_id`
- `invalid_base_url`
- `invalid_api_key`
- `invalid_selected_model_id`
- `unsupported_model_source`
- `unsupported_custom_models`
- `missing_api_key`
- `unsupported_remote_models`
- `invalid_provider_response`
- `remote_models_failed`

远端刷新失败必须是非破坏性的：

- 不清空 active preset 的已有 remote cache。
- 不影响其他 preset 的模型缓存。
- 不切换 active preset。

## 测试

sidecar 测试：

- 旧单 provider JSON 迁移成 `version: 2` preset list。
- 缺失或损坏 JSON 创建默认 preset。
- `providerSettings.current()` 返回 active preset resolved provider。
- 创建 preset 默认复制 active preset。
- 更新 active preset 触发 change listener。
- 更新非 active preset 不触发 runtime change listener。
- activate preset 后 current 指向新 preset。
- 删除最后一个 preset 被拒绝。
- 删除 active preset 自动切换到剩余 preset。
- remote model cache 按 preset + provider id + base URL 隔离。
- `/settings/provider` 返回 `presets`、`activePresetId`、`current`、`builtIn`。
- 兼容 `POST /settings/provider` 更新 active preset。
- 新增 preset API、读取 preset API、更新 preset API、activate API、delete API 返回结构化错误。
- `/models/refresh` 只写 active preset。

frontend 测试：

- `getProvider()` 类型包含 `presets` 和 `activePresetId`。
- `ModelSection` 渲染 preset 列表和 active 状态。
- 编辑非 active preset 时调用详情接口，不从 summary 读取 API key。
- 新增、复制、删除、激活调用正确 API。
- 保存 active preset 后 invalidates `provider` 和 `models`。
- 保存非 active preset 不误改当前模型列表。
- refresh models 仍先保存当前详情，再刷新 active preset。
- 对话页模型预设选择器展示 provider + model。
- 对话页选择 preset 后调用 activate API 并刷新 queries。
- 有 active run 或 pending approval 时模型预设选择器禁用。

## 后续扩展

第二阶段可以设计 per-thread preset：

- thread 记录 `activePresetId`。
- run 创建时保存 preset snapshot，避免全局切换影响恢复。
- scheduled task 可以保存自己的 preset 或使用全局默认。
- 对话页切换只影响当前 thread。

第三阶段可以设计完整 provider 账号体系：

- provider account 独立保存 base URL/API key。
- model preset 引用 provider account。
- 每个 provider 下可启用/隐藏模型。
- model preset 支持模型参数模板。

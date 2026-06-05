# 模型提供商设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将“设置 > 模型”升级为多 provider 配置页，支持内置 provider catalog、远端模型列表刷新、默认模型选择和自定义 OpenAI-compatible API 服务。

**Architecture:** sidecar 继续作为 provider 配置和模型列表的单一来源。新增 provider catalog、model fetch adapter、provider settings remote cache/default model 持久化；前端只消费 `/settings/provider`、`/models`、`/models/refresh`，不复制 provider catalog。当前 AGUI runtime 不做多协议改造。

**Constraint:** 不实现“模型来源”选择，不支持手动 JSON 模型列表，也不在 `ProfileModel` 上携带 `source` 字段。模型选择只来自当前 provider 的远端刷新结果；内置 provider 的本地列表仅作为 fallback/初始可用列表，custom provider 必须通过远端刷新获得模型后才能设置。

**Tech Stack:** Bun test、Bun SQLite、Hono、React 19、TanStack Query、shadcn/ui、react-i18next、TypeScript。

**提交策略:** 本计划执行期间不要自动提交。只有用户明确要求提交时，才执行 git add/commit。

---

## 文件结构

- 修改 `sidecar/src/lib/providerProfiles.ts`：扩展 provider 类型和内置 catalog，作为 provider metadata 单一来源。
- 新增 `sidecar/src/lib/providerProfiles.test.ts`：验证 provider id 覆盖需求列表且唯一。
- 修改 `sidecar/src/services/providerSettings.ts`：扩展持久化结构，支持 remote model cache、selectedModelId，并兼容旧 JSON。
- 新增 `sidecar/src/services/providerSettings.test.ts`：验证迁移默认值、保存/读取、provider/base URL/API key 切换时缓存隔离。
- 新增 `sidecar/src/services/modelCatalog.ts`：远端模型列表 adapter 和归一化逻辑。
- 新增 `sidecar/src/services/modelCatalog.test.ts`：验证 OpenAI-compatible adapter、Gemini adapter、空列表、unsupported、失败映射。
- 修改 `sidecar/src/routes/models.ts`：`GET /models` 返回 active 列表和 `defaultModelId`；新增 `POST /models/refresh`。
- 新增 `sidecar/src/routes/models.test.ts`：验证模型列表 default 和 refresh 行为。
- 修改 `sidecar/src/routes/settings.ts`：校验扩展 provider id 和新增 patch 字段，返回扩展 provider state；拒绝旧的手动模型/source 字段。
- 新增 `sidecar/src/routes/settings-provider.test.ts`：验证 provider settings 路由。
- 修改 `src/lib/data/settings.ts`：扩展 provider 类型、保存字段、读取返回类型。
- 修改 `src/lib/models.ts`：读取 `/models.defaultModelId`，新增 `refreshModels()`。
- 新增 `src/lib/models.test.tsx`：验证 `useAvailableModels()` 使用后端默认模型。
- 修改 `src/features/settings/sections/ModelSection.tsx`：动态 provider select、模型选择、刷新模型、状态反馈。
- 新增 `src/features/settings/sections/ModelSection.test.tsx`：验证动态 provider、刷新、错误反馈，并确认没有手动 JSON/source 控件。
- 修改 `src/i18n/locales/zh/settings.json` 和 `src/i18n/locales/en/settings.json`：新增设置页文案和错误提示。

## Task 1: Provider Catalog

**Files:**
- Modify: `sidecar/src/lib/providerProfiles.ts`
- Create: `sidecar/src/lib/providerProfiles.test.ts`

- [ ] 写失败测试，锁定内置 provider id 覆盖范围、唯一性、远端能力标记、OpenAI `/models` endpoint。
- [ ] 扩展 `ProviderProfileId` 到需求中的内置 provider + `custom`。
- [ ] 保留 `ProfileModel` 名称，但只包含 `{ id, displayName, description }`。
- [ ] 新增 `ModelListStrategy`：`static`、`openai-compatible`、`gemini`、`bedrock`。
- [ ] `supportsRemoteModels` 由 `modelList.strategy !== "static"` 推导。
- [ ] 运行 `cd sidecar && bun test src/lib/providerProfiles.test.ts`。

## Task 2: Provider Settings 持久化扩展

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Create: `sidecar/src/services/providerSettings.test.ts`

- [ ] 写失败测试，覆盖默认值、旧数据兼容、远端缓存保存、切换 provider/base URL/API key 后不暴露旧缓存。
- [ ] persisted schema 包含 `profileId`、`baseUrl`、`apiKey`、`remoteModels`、`remoteModelsProviderId`、`remoteModelsBaseUrl`、`remoteModelsFetchedAt`、`selectedModelId`。
- [ ] `ResolvedProvider` 返回当前 effective provider、模型列表、远端刷新时间、已选模型和远端能力，不返回手动模型/source 字段。
- [ ] custom provider 的模型列表只来自匹配当前 base URL 的远端缓存；没有缓存时为空。
- [ ] built-in provider 优先使用匹配当前 provider/base URL 的远端缓存，否则回退到内置 fallback 列表。
- [ ] `update()` 在 profile/base URL/API key 改变时清空 active remote cache metadata，并在 profile 改变时清空 `selectedModelId`。
- [ ] 运行 `cd sidecar && bun test src/services/providerSettings.test.ts`。

## Task 3: Model Catalog Adapter

**Files:**
- Create: `sidecar/src/services/modelCatalog.ts`
- Create: `sidecar/src/services/modelCatalog.test.ts`

- [ ] 写失败测试覆盖 OpenAI-compatible `{ data: [{ id }] }`、Gemini `{ models: [{ name }] }`、空列表、缺 API key、unsupported strategy、远端失败。
- [ ] `listModelsForProvider()` 根据 `profile.modelList.strategy` 调用对应远端 endpoint。
- [ ] OpenAI-compatible 使用 bearer token 和 `path ?? "/models"`。
- [ ] Gemini 使用 `?key=<apiKey>` 并去掉 `models/` 前缀。
- [ ] Bedrock 当前返回 `unsupported_remote_models`，直到凭证/region 表达方式明确。
- [ ] 归一化后的模型只包含 `{ id, displayName, description }`。
- [ ] 运行 `cd sidecar && bun test src/services/modelCatalog.test.ts`。

## Task 4: Settings 和 Models 路由

**Files:**
- Modify: `sidecar/src/routes/settings.ts`
- Modify: `sidecar/src/routes/models.ts`
- Create: `sidecar/src/routes/settings-provider.test.ts`
- Create: `sidecar/src/routes/models.test.ts`

- [ ] `GET /settings/provider` 返回 `{ current, builtIn: BUILT_IN_PROFILES }`。
- [ ] `POST /settings/provider` 接受 `profileId`、`baseUrl`、`apiKey`、`selectedModelId`。
- [ ] `POST /settings/provider` 拒绝旧的 `customModels` 和 `customModelSource` 字段。
- [ ] `GET /models` 返回 `{ data, defaultModelId }`；`defaultModelId` 优先使用仍在 active 列表中的 `selectedModelId`，否则第一个模型，空列表返回 `null`。
- [ ] `POST /models/refresh` 使用当前 provider 配置拉取远端模型，成功后写入 remote cache 并返回刷新后的模型列表。
- [ ] custom provider 固定按 OpenAI-compatible `/models` 远端刷新，不支持手动列表。
- [ ] 运行 `cd sidecar && bun test src/routes/settings-provider.test.ts src/routes/models.test.ts`。

## Task 5: Frontend 数据层

**Files:**
- Modify: `src/lib/data/settings.ts`
- Modify: `src/lib/models.ts`
- Create: `src/lib/models.test.tsx`

- [ ] 扩展 `ProfileId`、`ProviderConfig`、`BuiltInProfile` 类型。
- [ ] `ProfileModel` 只包含 `{ id, displayName, description }`。
- [ ] `setProvider()` patch 只暴露 `profileId`、`baseUrl`、`apiKey`、`selectedModelId`。
- [ ] `refreshModels()` 调用 `POST /models/refresh`，失败时透传 sidecar error code。
- [ ] `useAvailableModels()` 使用后端返回的 `defaultModelId`。
- [ ] 运行 `bun test src/lib/models.test.tsx`。

## Task 6: 设置页 UI 和 i18n

**Files:**
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Create: `src/features/settings/sections/ModelSection.test.tsx`
- Modify: `src/i18n/locales/zh/settings.json`
- Modify: `src/i18n/locales/en/settings.json`

- [ ] `ModelSection` 从 `/settings/provider` 渲染动态 provider select。
- [ ] 保存 provider/base URL/API key/selected model。
- [ ] “刷新模型”先保存当前 provider 设置，再调用 `/models/refresh`，成功后 invalidates `provider` 和 `models` query。
- [ ] 不渲染模型来源选择或手动 JSON 编辑器。
- [ ] 为保存成功、刷新成功、不支持刷新、缺少 API key、远端错误展示明确状态。
- [ ] API key 显示/隐藏用 icon button + tooltip。
- [ ] 更新中英文文案，仅保留远端刷新相关文案。
- [ ] 运行 `bun test src/features/settings/sections/ModelSection.test.tsx`。

## Verification

- [ ] `cd sidecar && bun test src/lib/providerProfiles.test.ts src/services/providerSettings.test.ts src/services/modelCatalog.test.ts src/routes/settings-provider.test.ts src/routes/models.test.ts`
- [ ] `bun test src/lib/models.test.tsx src/features/settings/sections/ModelSection.test.tsx`
- [ ] `bunx tsc --noEmit -p tsconfig.app.json`

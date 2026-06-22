# 会话模型更新设计

日期：2026-06-22

## 背景

当前 Task 页在会话有消息后会把模型选择器锁住：

- `TaskView` 传入 `modelLocked={viewMessages.length > 0}`。
- `TaskMessageInput` 将锁定状态传给 `ProviderModelPicker`。
- 文案提示“session started 后不能改模型”。

但后端运行链路已经支持每次 run 带 `providerSelection` / `model`。`POST /runs` 和 regenerate 都会从请求里解析模型并传给 `runWorker`，实际限制主要来自前端 UI 和会话默认模型状态没有完整打通。

同时，`conversations` 表已经有 `model` 字段，但它目前更像 scheduled run 的 seed 字段，没有作为交互会话的模型默认值完整使用。Task 页的 `ProviderModelPicker` 还会在选择时写全局默认模型，这会把“当前会话换模型”和“新会话默认模型”混在一起。

## 目标

1. 创建会话后仍允许更新模型。
2. 模型选择属于当前 conversation，刷新和切换回来后仍保留。
3. 运行中的 run 不被打断，模型切换只影响下一次 run。
4. Task 页切换模型不修改全局默认模型。
5. 使用 TanStack Query 做乐观更新，让切换即时反馈。
6. 覆盖发送、队列、regenerate、刷新恢复等关键路径。

## 非目标

1. 不允许一个已经启动的 run 中途换模型。
2. 不新增 per-message 模型快照；队列消息使用发送时的会话默认模型。
3. 不新增模型参数模板，例如 temperature、max tokens。
4. 不改变 provider 连接设置页的模型管理能力。
5. 不改变“一条 thread 同时只能有一个 live run”的 invariant。

## 推荐方案

把 `conversation.model` 正式定义为当前会话的默认模型。

- 新建会话时，如果用户选了模型，首轮 run 使用该模型，并把该模型保存到 conversation。
- 已有会话打开时，Task 页模型选择器优先显示 `conversation.model`。
- 如果 `conversation.model === null`，Task 页显示并使用全局默认模型。
- Task 页切换模型时，只 patch 当前 conversation，不调用 `setDefaultProviderSelection`。
- 切换模型时即使当前 run 正在进行，也允许操作；它只影响下一次发送、队列 flush 或 regenerate。

## 数据模型

沿用现有字段：

```ts
interface Conversation {
  model?: string | null;
}
```

语义调整：

- `model: string`：当前 conversation 的默认模型 id。
- `model: null`：当前 conversation 不指定模型，发送时回退到全局默认选择。

当前 provider 选择仍以 `{ providerId, modelId }` 作为前端和运行时请求形态。由于 `conversations.model` 只保存裸 model id，Task 页需要用 provider 设置中的 enabled models 反查模型对应 provider：

1. 如果 `conversation.model` 能唯一匹配 enabled model，选择该 `{providerId, modelId}`。
2. 如果找不到，回退全局默认，并保留服务端 `conversation.model` 原值直到用户重新选择。
3. 如果出现多个 provider 暴露同一个 `modelId`，优先使用全局默认 provider 中的同名模型；否则使用 enabled models 列表中的第一个匹配项。

后续如果需要彻底消除同名模型歧义，可增加 `conversation.provider_id`。本次不扩表，避免扩大迁移面。

## 后端 API

`ThreadService` 增加：

```ts
updateModel(id: string, model: string | null): Thread
```

`PATCH /conversations/:id` 支持：

```json
{ "model": "gpt-5.1" }
```

和：

```json
{ "model": null }
```

校验规则：

1. `model === null` 表示清除会话默认模型。
2. `typeof model === "string" && model.length > 0` 表示设置模型。
3. 空字符串、非字符串且非 null 返回 `400 { error: "invalid_model" }`。
4. patch 成功后返回更新后的 conversation。

后端只保存 model id，不在 conversation route 里校验 provider 是否启用。运行时仍由 provider resolve 路径处理模型可用性，避免 conversation API 依赖 provider settings。

## 前端数据层

`src/lib/data/conversations.ts` 增加：

```ts
updateConversationModel(id: string, model: string | null): Promise<Conversation>
```

`src/lib/data/queries.ts` 增加 mutation：

```ts
useUpdateConversationModelMutation()
```

mutation 使用 TanStack Query 乐观更新：

1. `onMutate`
   - cancel `queryKeys.detail(id)`。
   - snapshot 旧 conversation detail。
   - 立即把 cache 中的 `model` 改成新值。
2. `onError`
   - 用 snapshot 回滚 detail cache。
   - 让 Task 页 picker 回到旧模型。
3. `onSuccess`
   - 用服务端返回值覆盖 detail cache。
4. `onSettled`
   - invalidate `queryKeys.detail(id)`，确保最终一致。

如果切换模型后用户马上发送消息，发送逻辑优先读取本地最新选择，因此不需要等待 PATCH 返回。

## Task 页状态

`TaskView` 的模型选择来源调整为：

1. `conversationQuery.data?.model`
2. provider settings 的 `enabledModels` / `defaultSelection`
3. 本地 `providerSelection` state

推荐新增一个 feature-local helper：

```ts
resolveThreadProviderSelection({
  conversationModel,
  enabledModels,
  defaultSelection,
  localSelection,
}): ProviderModelSelection | null
```

职责：

- 统一处理 `conversation.model` 到 `{providerId, modelId}` 的映射。
- 让 UI label、发送参数、regenerate 参数都使用同一份选择。
- 避免每个调用点重复写 fallback 逻辑。

Task 页切换模型流程：

1. 用户在 picker 选择 `{providerId, modelId}`。
2. 立即设置本地 `providerSelection`。
3. 触发 `updateConversationModel(threadId, modelId)` mutation。
4. mutation 乐观更新 conversation detail cache。
5. 下一次 `buildRunOptions()` 使用本地最新 selection。
6. mutation 失败时回滚 cache 和本地选择。

`TaskView` 不再传 `modelLocked={viewMessages.length > 0}`。模型选择器在运行中也可用。

## Picker 组件职责

`ProviderModelPicker` 应从“选择并写全局默认”改为“只负责展示和回调选择”，由调用方决定持久化目标。

建议接口：

```ts
interface ProviderModelPickerProps {
  value: ProviderModelSelection | null;
  onChange: (selection: ProviderModelSelection) => void;
  persistDefault?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}
```

首版可用 `persistDefault` 兼容当前 New Task 页行为：

- New Task 页：`persistDefault={true}`，保持现有“选择后更新全局默认”的行为。
- Task 页：不传或传 `false`，只更新当前 conversation。

如果后续要进一步收敛职责，可以把全局默认持久化完全移出 picker，让 New Task 页自己调用 `setDefaultProviderSelection`。

## 发送与运行语义

发送消息时：

- `sendOrQueue()` 调用 `buildRunOptions()`。
- `buildRunOptions()` 使用当前会话选择作为 explicit provider selection。
- 如果当前会话没有模型，回退全局默认。

运行中切换模型：

- 当前 run 保持启动时的模型。
- UI 不弹确认框、不取消 run。
- 下一次 run 使用新模型。

队列：

- 队列 item 不保存模型快照。
- 自动 flush 时读取当时的会话默认模型。
- 因此运行中切换模型后，后续队列 flush 使用新模型。

Regenerate：

- regenerate 使用当前会话默认模型，不强制使用原回答当时的模型。
- `runs.model_used` 继续记录实际使用模型，审计和 usage 不受影响。

## 错误处理

1. conversation model patch 失败：回滚乐观 cache 和 picker 本地选择。
2. patch 失败但用户已经发出下一条消息：不撤回已启动 run；UI 回滚后续状态，以服务端 conversation 为准。
3. conversation.model 指向不可用模型：picker 回退显示全局默认；用户重新选择后覆盖旧值。
4. provider settings 加载失败：保留当前 label fallback，发送时走现有错误路径。
5. 空模型列表：picker 维持当前 empty state。

## 测试计划

### Sidecar

1. `PATCH /conversations/:id` 支持 `model: string`。
2. `PATCH /conversations/:id` 支持 `model: null`。
3. 空字符串返回 `invalid_model`。
4. 非字符串且非 null 返回 `invalid_model`。
5. `GET /conversations/:id` 返回更新后的 `model`。

### Frontend Data

1. `updateConversationModel()` 发送正确 PATCH body。
2. mutation `onMutate` 乐观更新 `queryKeys.detail(id)`。
3. mutation `onError` 回滚旧 conversation。
4. mutation `onSuccess` 使用服务端返回值覆盖 cache。

### Task UI

1. 已有消息后模型 picker 仍可打开。
2. Task 页选择模型不调用 `setDefaultProviderSelection`。
3. 切换模型后下一次 `send()` 带新 `{providerId, modelId}`。
4. 运行中切换模型后，队列 flush 使用新选择。
5. regenerate 使用当前会话默认模型。
6. PATCH 失败时 picker 回滚。

### Regression

1. New Task 页选择模型仍能影响首轮 run。
2. New Task 页现有全局默认更新行为保持不变。
3. scheduled task seed 的 conversation model 仍被 Task 页识别。
4. provider 设置页不受影响。

## 验收标准

1. 创建会话并完成首轮后，模型下拉仍可切换。
2. 运行中可以切换模型，当前 run 不被取消。
3. 切换后下一条消息使用新模型。
4. 刷新页面后当前会话仍显示新模型。
5. 新建另一个会话不会被上一个会话的切换误改默认模型。
6. 网络慢时模型切换即时反馈，失败时正确回滚。
7. 所有新增和相关回归测试通过。

# 模型供应商设置与视觉输入优化 Spec

## 背景

当前模型设置页已经支持多个 Provider connection、远端模型刷新、启用模型、默认模型选择，并且 OpenAI-compatible Provider 通过内部 Claude Code Router 接入 Claude Agent SDK runtime。

这套设计暴露出几个问题：

1. 自定义 OpenAI-compatible 只区分 `openai-compatible` / `anthropic`，没有区分 OpenAI Chat Completions 与 OpenAI Responses。
2. 对 sub2api 这类中转站，底层模型相同，但 Chat Completions 路径只返回普通 `delta.content`，Responses 路径才返回 reasoning summary；因此当前 Agent Studio 看不到思考内容。
3. 设置页缺少连接测试与协议/模型能力验证，用户配置错误时只能从日志和运行失败中倒推。
4. “允许用于对话”“设为默认”“刷新模型”“CCR 状态”混在一个列表和弹窗里，用户很难理解到底配置的是连接、模型还是内部路由。
5. 模型能力没有体系化展示，后续支持视觉输入时无法判断哪些模型能直接接收图片。
6. 输入框尚不支持上传图片、截图粘贴和图片历史展示。

## 目标

### P0：修复 OpenAI Responses 思考链路

用户配置 OpenAI Responses 协议后，使用支持 reasoning summary 的 OpenAI-compatible 中转站时，Agent Studio 应能显示思考内容。

必须满足：

- 不使用模型 ID 正则判断是否走 Responses。
- 不默认把所有 OpenAI-compatible 切到 Responses，避免破坏现有 Chat Completions 用户。
- 用户能在 Provider 配置中明确选择 OpenAI Chat Completions 或 OpenAI Responses。
- 选择 Responses 后，页面展示最终上游请求地址为 `/responses`。
- Responses 路径通过 CCR 的 `openai-responses` transformer，并让 SDK 请求 summarized thinking。

### P1：优化模型设置页的信息架构

模型设置页应从“连接列表 + 大弹窗”升级为“Provider 连接管理 + 连接详情 + 模型列表/能力状态”的页面。

必须满足：

- 普通用户 UI 不展示 CCR、route key、`127.0.0.1:3456`、CCR 状态。
- 用户看到的是上游 Provider 地址、协议、健康状态、模型能力和默认模型。
- “设为默认”落在具体 provider + model 上，不再作为连接卡片上的模糊动作。
- “允许用于对话”改成更清晰的“启用连接”或“启用模型”，避免混淆。

### P1：增加连接测试与能力探测

用户应能测试一个 Provider 配置是否可用，系统应能记录模型能力。

必须满足：

- 基础连接测试验证：最终请求地址、认证、协议、默认/选中模型是否可用。
- 健康检查结果区分认证失败、网络失败、协议不匹配、模型不可用。
- 能力探测支持记录：文本、工具调用、思考、视觉、结构化输出。
- 能力标签默认由系统探测或 Provider metadata 推断，用户可手动覆盖。
- UI 区分“已验证”和“手动标记”，避免把手动配置误认为真实探测结果。

### P2：支持视觉输入基础链路

用户可以在普通对话输入框中上传图片或粘贴截图，图片会作为消息附件持久化并参与 run。

必须满足：

- 第一阶段支持文件选择和剪贴板截图粘贴。
- 第一阶段不做拖拽上传。
- 不做“默认图片识别模型”。
- 不自动把图片任务转给另一个视觉模型。
- 当前模型支持视觉时，图片作为 image block 传给模型。
- 当前模型不支持视觉时，仍允许发送图片；图片作为附件保存，并给 agent 注入附件路径说明，使其可通过工具/Python 读取处理。
- 历史消息能展示图片缩略图。

## 非目标

- 不实现自动切换视觉模型。
- 不实现默认图片识别模型。
- 不实现拖拽图片上传。
- 不实现图片编辑、标注、OCR 专用工具。
- 不实现云同步附件。
- 不做多用途默认模型，例如“视觉默认”“轻量任务默认”“标题生成默认”。
- 不在普通 UI 展示 CCR 内部状态；CCR 信息只保留在日志、开发诊断或隐藏调试入口。

## 用户体验设计

### 模型设置页面结构

页面采用左右结构：

- 左侧：Provider 连接列表
  - 名称
  - Provider 类型
  - 健康状态
  - 默认模型摘要
  - 缺 Key / 停用 / 错误状态

- 右侧：当前连接详情
  - 基础配置
    - 连接名称
    - Provider 类型
    - 协议
    - Base URL
    - API Key
  - 最终请求地址
    - OpenAI Chat Completions: `<base>/chat/completions`
    - OpenAI Responses: `<base>/responses`
    - Anthropic Messages: `<base>/v1/messages` 或兼容 endpoint
  - 健康检查
    - 测试连接按钮
    - 最近测试结果
    - 错误详情
  - 模型列表
    - 刷新模型
    - 搜索模型
    - 启用/停用模型
    - 设置默认模型
    - 能力标签
  - 模型能力详情
    - 工具调用
    - 视觉输入
    - 思考
    - 结构化输出
    - 用户手动覆盖入口

### 协议选择

自定义 Provider 的协议选项改为：

- OpenAI Chat Completions
- OpenAI Responses
- Anthropic Messages

当前仍处于开发阶段，不做旧配置迁移。已有本地开发数据可以清空或按新协议重新配置。内置 OpenAI-compatible Provider 默认继续走 Chat Completions。用户自定义中转站如果需要思考内容，应选择 OpenAI Responses。

### 健康检查

基础连接测试由用户手动点击触发，结果保存到连接上。

基础测试只做低成本请求：

- Chat Completions：最小 `/chat/completions` 请求。
- Responses：最小 `/responses` 请求。
- Anthropic：最小 Messages 请求。

能力探测可以在后台或“重新测试”中触发，但不阻止保存连接。

能力状态：

- `verified`：系统已验证支持。
- `provider`：Provider metadata 声明支持，但未实测。
- `manual`：用户手动标记。
- `unsupported`：系统验证不支持。
- `unknown`：未知。

### 视觉输入

普通对话输入框增加图片附件入口：

- 附件按钮选择图片。
- 截图后粘贴图片。
- 附件预览与移除。
- 发送后消息展示缩略图。

发送策略：

- 当前模型支持视觉：图片进入模型上下文，作为视觉输入。
- 当前模型不支持视觉：图片不作为视觉输入；系统给 agent 附加说明，包含图片文件名、mime、尺寸、稳定本地路径，并提示可用工具读取。

示例说明：

```text
Attached images:
- screenshot.png (image/png, 1280x720): /Users/.../attachments/thread_xxx/sha256.png

These images are not embedded as visual input for the current model. Use available tools to inspect them if needed.
```

## 技术设计

### Provider 协议模型

建议内部协议类型：

```ts
type CustomProviderProtocol =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic";
```

OpenAI Responses 不通过模型名推断，必须来自 Provider 配置。

### CCR 配置生成

Chat Completions：

- `api_base_url`: `<base>/chat/completions`
- transformer: `reasoning`
- 用于兼容返回 `reasoning_content` 的中转站。

Responses：

- `api_base_url`: `<base>/responses`
- transformer: `openai-responses`
- 用于转换 Responses stream 中的 `response.reasoning_summary_text.delta`。

Anthropic：

- 保持 Anthropic transformer。

### SDK thinking

仅当 Provider 协议为 OpenAI Responses 时，对 CCR runtime 的 Claude Agent SDK provider 传：

```ts
thinking: { type: "enabled", budgetTokens: 1024, display: "summarized" }
```

不对所有 Provider 全局启用，避免增加不必要的成本、延迟和兼容风险。

### 模型能力数据

建议记录在 Provider settings V3 JSON 内，随连接持久化：

```ts
type ModelCapabilityKey =
  | "text"
  | "tools"
  | "vision"
  | "reasoning"
  | "structuredOutput";

type CapabilitySource =
  | "verified"
  | "provider"
  | "manual"
  | "unsupported"
  | "unknown";

interface ModelCapabilityState {
  key: ModelCapabilityKey;
  supported: boolean;
  source: CapabilitySource;
  checkedAt?: string;
  message?: string;
}
```

用户手动覆盖优先级高于系统探测。后续探测结果不应静默覆盖用户手动标记，除非用户选择“恢复自动”。

### 附件存储

图片附件复制到应用数据目录，不引用原始路径。

原因：

- 剪贴板截图没有稳定原始路径。
- 用户可能删除源文件。
- 历史消息、regenerate、resume 需要稳定重放。

建议表：

```sql
attachments (
  id,
  thread_id,
  kind,
  mime_type,
  filename,
  byte_size,
  width,
  height,
  sha256,
  storage_path,
  created_at
)

message_attachments (
  message_id,
  attachment_id,
  position
)
```

附件目录应纳入 provider 可读范围，否则非视觉模型无法通过工具读取图片。

## 验收标准

### 思考链路

- 自定义 Provider 选择 OpenAI Responses，Base URL 为 `https://aiproxy.cloud-ip.cc/v1` 时，页面显示最终请求地址 `https://aiproxy.cloud-ip.cc/v1/responses`。
- 使用支持 reasoning summary 的模型发起对话时，UI 能显示 reasoning / thinking 内容。
- 同一 Provider 选择 OpenAI Chat Completions 时，不强行走 Responses。
- 开发阶段不兼容旧 `openai-compatible` 配置；重新配置为 OpenAI Chat Completions 或 OpenAI Responses。

### 设置页

- 普通模型设置页不出现 CCR 字样。
- 用户能在连接详情中看到完整上游请求地址。
- 用户能测试连接，并看到明确错误类型。
- 用户能在模型行看到能力标签。
- 用户能手动覆盖模型能力标签，并看到“手动”状态。
- 默认模型设置落在具体模型行上。

### 图片输入

- 用户能通过附件按钮上传图片。
- 用户能粘贴截图。
- 用户能在发送前预览和移除图片。
- 历史消息能展示图片缩略图。
- 视觉模型收到 image block。
- 非视觉模型收到附件路径说明，并能通过工具读取附件。

## 风险

- `openai-responses` transformer 必须来自可复现的 CCR 依赖或 bundled runtime，不能只依赖当前机器已有文件。
- Responses summarized thinking 可能增加 token 成本和延迟。
- 健康检查和能力探测可能产生轻微调用费用，需要低成本 prompt。
- 附件路径需要同时满足安全边界和工具可读性。
- 官方服务商 website runtime 可能暂不支持图片，应在 UI 中标注能力未知或不支持。

## 建议分期

1. 修复 OpenAI Responses 思考链路。
2. 增加连接测试和模型能力数据结构。
3. 改造模型设置页为双栏结构并隐藏 CCR。
4. 增加图片附件存储和上传 API。
5. 输入框支持文件选择和剪贴板粘贴。
6. Provider 层支持视觉 image block 与非视觉附件路径说明。

# Model Provider Settings And Vision Input Implementation Plan

> Superseded by the split plan set:
> `docs/superpowers/plans/2026-06-26-model-provider-settings-master.md`.
> Keep this file as the original draft only; use the master + phase documents for execution and progress tracking.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系统优化 Agent Studio 的模型配置体验，隐藏 CCR 实现细节，支持 OpenAI Chat Completions / OpenAI Responses 区分、连接健康检查、模型能力标签与视觉图片输入。

**Architecture:** 把“模型设置”从单一弹窗改为连接详情页：Provider 连接是配置源，模型能力是可探测可覆盖的模型元数据，默认选择落在具体 provider+model 上。视觉输入作为消息附件进入通用 run 链路：支持视觉的模型收到 image block，不支持视觉的模型收到稳定附件路径说明并可通过工具处理。

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + shadcn，Bun + Hono sidecar，SQLite，本地 CCR runtime，`@anthropic-ai/claude-agent-sdk`。

---

## 已确认产品决策

- 普通用户 UI 不展示 CCR、route key、`127.0.0.1:3456`、CCR 状态；这些只留在日志和开发诊断里。
- Provider 协议按用户能理解的上游接口拆分：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages。
- 页面显示完整上游请求地址，例如 `https://aiproxy.cloud-ip.cc/v1/responses`，让用户确认真实请求目标。
- 健康检查分两级：基础连接测试由用户触发；模型能力探测在保存、刷新模型、启用模型后后台执行，也允许手动重新测试。
- 能力标签不要求用户一开始配置；系统探测优先，用户可在模型详情中手动覆盖，且 UI 区分“已验证”和“手动标记”。
- 第一阶段不做“默认图片识别模型”，也不做自动切换视觉模型；当前会话选择的模型决定是否直接接收视觉输入。
- 图片输入第一阶段支持文件选择和剪贴板截图粘贴；拖拽后置。
- 即使当前模型不支持视觉，也允许用户上传图片；图片作为附件保存，模型可通过工具/Python读取处理。

## 文件结构与职责

### Provider 协议与能力

- Modify: `sidecar/src/services/providerSettings.ts`
  - 持久化 Provider 协议、模型能力、探测状态和用户覆盖。
- Modify: `src/lib/data/settings.ts`
  - 前端同步 ProviderConnection / ModelCapability 类型。
- Modify: `sidecar/src/ccr/routes.ts`
  - CCR route 携带 OpenAI wire protocol。
- Modify: `sidecar/src/ccr/config.ts`
  - 生成 Chat Completions / Responses 的不同上游地址和 transformer。
- Modify: `sidecar/src/server.ts`
  - OpenAI Responses 路由给 SDK provider 传 `thinking: { type: "adaptive", display: "summarized" }`。
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
  - `ClaudeProviderOptions` 增加 `thinking` 透传。
- Modify: `sidecar/src/routes/settings.ts`
  - 新增基础连接测试、能力探测 API。

### 设置页 UI

- Modify: `src/features/settings/sections/ModelSection.tsx`
  - 改成双栏结构，移除普通 UI 的 CCR 状态。
- Create: `src/features/settings/sections/ProviderConnectionSidebar.tsx`
  - 左侧连接列表。
- Create: `src/features/settings/sections/ProviderConnectionDetail.tsx`
  - 右侧连接详情。
- Create: `src/features/settings/sections/ProviderEndpointPreview.tsx`
  - 完整上游请求地址展示。
- Create: `src/features/settings/sections/ProviderHealthPanel.tsx`
  - 基础连接测试和最近结果。
- Create: `src/features/settings/sections/ProviderModelCapabilityBadges.tsx`
  - 模型能力标签。
- Modify: `src/features/settings/sections/ProviderConnectionDialog.tsx`
  - 第一轮可以保留为新增入口；最终应拆小或删除。
- Modify: `src/i18n/locales/zh/settings.json`
- Modify: `src/i18n/locales/en/settings.json`

### 图片附件与消息链路

- Modify: `sidecar/src/db.ts`
  - 新增 `attachments` 表和 `message_attachments` 关系。
- Create: `sidecar/src/services/attachments.ts`
  - 写入应用数据目录，计算 sha256、尺寸、mime、稳定路径。
- Create: `sidecar/src/routes/attachments.ts`
  - 上传图片、读取缩略图/原图。
- Modify: `sidecar/src/services/messages.ts`
  - 用户消息 DTO 支持附件。
- Modify: `sidecar/src/routes/runs.ts`
  - `POST /runs` 支持 `attachments`。
- Modify: `sidecar/src/agent/runWorker.ts`
  - 构造带附件说明/视觉 blocks 的 provider 输入。
- Modify: `sidecar/src/agui/core/provider-types.ts`
  - `RunContext.userMessage` 支持 blocks/attachments。
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
  - 视觉模型发送 image block；非视觉模型发送附件路径说明。
- Modify: `src/lib/agui/runtime/api.ts`
  - `postRun` 支持附件 id。
- Modify: `src/lib/agui/runtime/runtime.ts`
  - 乐观用户消息支持图片附件。
- Modify: `src/lib/agui/runtime/types.ts`
  - `MessageView` 支持 image attachment block。
- Modify: `src/features/task/TaskMessageInput.tsx`
  - 附件按钮、文件选择、剪贴板图片粘贴、预览、移除。
- Modify: `src/features/task/ChatStream.tsx`
  - 历史消息展示图片缩略图。

---

## Phase 1: Provider 协议拆分与思考链路修复

### Task 1: 扩展 Provider 协议类型

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `src/lib/data/settings.ts`
- Test: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: 写失败测试**

在 `sidecar/src/services/providerSettings.test.ts` 增加：

```ts
it("persists custom OpenAI Responses protocol", () => {
  const settings = createProviderSettingsState(makeDb());
  const created = settings.createConnection({
    name: "sub2api",
    profileId: "custom",
    baseUrl: "https://aiproxy.cloud-ip.cc/v1",
    apiKey: "sk-test",
    customProtocol: "openai-responses",
  });

  expect(created.customProtocol).toBe("openai-responses");
});
```

Expected: 当前类型不接受 `openai-responses`，测试失败。

- [ ] **Step 2: 更新类型**

把协议类型改成：

```ts
export type CustomProviderProtocol =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic";

function sanitizeCustomProviderProtocol(value: unknown): CustomProviderProtocol {
  if (value === "openai-responses") return "openai-responses";
  if (value === "anthropic") return "anthropic";
  return "openai-chat-completions";
}
```

开发阶段不兼容旧 `openai-compatible` 值；本地旧数据可清空或重新配置。

- [ ] **Step 3: 同步前端类型**

`src/lib/data/settings.ts`：

```ts
export type CustomProviderProtocol =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic";
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/services/providerSettings.test.ts
```

Expected: 新增测试通过，旧 openai-compatible 相关测试删除或更新为新协议名后通过。

### Task 2: CCR config 支持 OpenAI Responses

**Files:**
- Modify: `sidecar/src/ccr/routes.ts`
- Modify: `sidecar/src/ccr/config.ts`
- Test: `sidecar/src/ccr/config.test.ts`
- Test: `sidecar/src/ccr/routes.test.ts`
- Test: `sidecar/src/ccr/runtime-service.test.ts`

- [ ] **Step 1: 写失败测试**

`sidecar/src/ccr/config.test.ts`：

```ts
it("routes OpenAI Responses providers to /responses with openai-responses transformer", () => {
  const route: CcrRuntimeRoute = {
    ...openaiRoute,
    upstream: {
      ...openaiRoute.upstream,
      protocol: "openai-responses",
      baseUrl: "https://aiproxy.cloud-ip.cc/v1",
      modelId: "gpt-5.5",
    },
  };

  const config = buildAgentStudioCcrConfig([route]);

  expect(config.Providers[0]).toMatchObject({
    api_base_url: "https://aiproxy.cloud-ip.cc/v1/responses",
    transformer: { use: ["openai-responses"] },
  });
});
```

- [ ] **Step 2: 实现 URL 归一化**

`sidecar/src/ccr/config.ts`：

```ts
function openAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl
    .replace(/\/+$/, "")
    .replace(/\/responses$/, "")
    .replace(/\/chat\/completions$/, "");
  return `${normalized}/chat/completions`;
}

function openAIResponsesUrl(baseUrl: string): string {
  const normalized = baseUrl
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "")
    .replace(/\/responses$/, "");
  return `${normalized}/responses`;
}
```

`providerForRoute` 分支：

```ts
if (route.upstream.protocol === "openai-responses") {
  provider.api_base_url = openAIResponsesUrl(route.upstream.baseUrl);
  provider.transformer = { use: ["openai-responses"] };
} else if (route.upstream.protocol === "openai-chat-completions") {
  provider.api_base_url = openAIChatCompletionsUrl(route.upstream.baseUrl);
  provider.transformer = { use: ["reasoning"] };
} else {
  provider.api_base_url = route.upstream.baseUrl.replace(/\/+$/, "");
  provider.transformer = { use: ["Anthropic"] };
}
```

- [ ] **Step 3: 确认 CCR runtime 资产支持 transformer**

新增一个测试保护运行时资产：

```ts
it("bundled CCR runtime includes openai-responses transformer", async () => {
  const cli = await readFile(ccrCliAssetPath, "utf8");
  expect(cli).toContain("openai-responses");
});
```

如果当前 npm 包 `@musistudio/claude-code-router@2.0.0` 的 asset 不包含该字符串，先升级/替换到包含 transformer 的可复现版本，再继续。

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/ccr/config.test.ts sidecar/src/ccr/routes.test.ts sidecar/src/ccr/runtime-service.test.ts sidecar/src/ccr/spawn.test.ts
```

Expected: 所有 CCR 配置与运行时资产测试通过。

### Task 3: SDK thinking 透传

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Modify: `sidecar/src/server.ts`
- Test: `sidecar/src/agui/provider-claude/provider.test.ts`

- [ ] **Step 1: 写失败测试**

在 provider test 的 `sdkQuery` mock 断言中加入：

```ts
expect(mockSdkQuery).toHaveBeenCalledWith(
  expect.objectContaining({
    options: expect.objectContaining({
      thinking: { type: "adaptive", display: "summarized" },
    }),
  }),
);
```

- [ ] **Step 2: 增加 option 类型**

`sidecar/src/agui/provider-claude/provider.ts`：

```ts
import type { ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeProviderOptions {
  thinking?: ThinkingConfig;
}
```

在 `sdkQuery({ options })` 中加入：

```ts
...(opts.thinking ? { thinking: opts.thinking } : {}),
```

- [ ] **Step 3: 只对 OpenAI Responses 路由启用 summarized thinking**

`sidecar/src/server.ts`：

```ts
const commonForCcr =
  current.customProtocol === "openai-responses"
    ? {
        ...common,
        ccrSkillReminderCompat: true,
        thinking: { type: "adaptive" as const, display: "summarized" as const },
      }
    : { ...common, ccrSkillReminderCompat: true };
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/agui/provider-claude/provider.test.ts
cd sidecar && bunx tsc --noEmit
```

Expected: provider tests pass，TypeScript pass。

---

## Phase 2: 健康检查与能力探测

### Task 4: 增加健康检查 API

**Files:**
- Create: `sidecar/src/services/providerHealth.ts`
- Modify: `sidecar/src/routes/settings.ts`
- Test: `sidecar/src/routes/settings-provider.test.ts`

- [ ] **Step 1: 定义检查结果类型**

```ts
export type ProviderHealthStatus = "ok" | "auth_error" | "network_error" | "protocol_error" | "model_error";

export interface ProviderHealthResult {
  status: ProviderHealthStatus;
  checkedAt: string;
  finalUrl: string;
  latencyMs: number;
  message: string;
}
```

- [ ] **Step 2: 写失败测试**

```ts
it("POST /settings/provider/connections/:id/test returns final upstream URL", async () => {
  const res = await app.request("/settings/provider/connections/conn_custom/test", {
    method: "POST",
    headers: authHeaders,
  });
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.health).toMatchObject({
    status: "ok",
    finalUrl: "https://aiproxy.cloud-ip.cc/v1/responses",
  });
});
```

- [ ] **Step 3: 实现基础检查**

基础检查只验证：

```ts
interface BasicProbeInput {
  protocol: CustomProviderProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}
```

请求策略：

- OpenAI Chat Completions：POST `/chat/completions`，最小 messages。
- OpenAI Responses：POST `/responses`，最小 input。
- Anthropic Messages：POST `/v1/messages`，最小 messages。

- [ ] **Step 4: 保存最近检查结果**

在 provider settings JSON 中保存连接级：

```ts
health?: {
  status: ProviderHealthStatus;
  checkedAt: string;
  finalUrl: string;
  latencyMs: number;
  message: string;
};
```

- [ ] **Step 5: 跑测试**

Run:

```bash
bun test sidecar/src/routes/settings-provider.test.ts sidecar/src/services/providerSettings.test.ts
```

Expected: health API 与 settings persistence 测试通过。

### Task 5: 模型能力探测与用户覆盖

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Create: `sidecar/src/services/modelCapabilities.ts`
- Modify: `sidecar/src/routes/settings.ts`
- Test: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: 定义能力模型**

```ts
export type ModelCapabilityKey =
  | "text"
  | "tools"
  | "vision"
  | "reasoning"
  | "structuredOutput";

export type CapabilitySource = "verified" | "manual" | "provider" | "unknown" | "unsupported";

export interface ModelCapabilityState {
  key: ModelCapabilityKey;
  supported: boolean;
  source: CapabilitySource;
  checkedAt?: string;
  message?: string;
}

export interface ProviderModelCapabilityRecord {
  modelId: string;
  capabilities: ModelCapabilityState[];
}
```

- [ ] **Step 2: 写失败测试**

```ts
it("keeps manual capability overrides when later probes fail", () => {
  const settings = createProviderSettingsState(makeDb());
  const conn = settings.createConnection({ profileId: "custom", name: "Custom" });

  settings.setModelCapabilityOverride(conn.providerId, "gpt-5.5", {
    key: "vision",
    supported: true,
  });
  settings.recordModelCapabilityProbe(conn.providerId, "gpt-5.5", {
    key: "vision",
    supported: false,
    source: "unsupported",
    message: "No image input support",
  });

  const next = settings.getConnection(conn.providerId);
  expect(findCapability(next, "gpt-5.5", "vision")).toMatchObject({
    supported: true,
    source: "manual",
  });
});
```

- [ ] **Step 3: 实现后台探测策略**

探测触发点：

- 保存连接后：对 default model 做基础能力探测。
- 刷新模型后：不立即全量探测，避免慢；只给模型打 provider/unknown 初始标签。
- 启用模型后：对新启用模型入队轻量探测。
- 用户点击“重新测试”：探测当前连接的已启用模型。

探测内容：

- `text`：基础连接测试通过即 verified。
- `reasoning`：仅 OpenAI Responses / Anthropic Messages 尝试。
- `tools`：发送最小 no-op tool schema。
- `vision`：只在用户手动请求或模型 metadata/name 可能支持时探测；第一阶段也允许用户手动标记。
- `structuredOutput`：后置，第一轮可只保留 unknown。

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/services/providerSettings.test.ts sidecar/src/routes/settings-provider.test.ts
```

Expected: 用户覆盖优先级、探测记录和 summary DTO 通过。

---

## Phase 3: 设置页信息架构改造

### Task 6: 双栏设置页

**Files:**
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Create: `src/features/settings/sections/ProviderConnectionSidebar.tsx`
- Create: `src/features/settings/sections/ProviderConnectionDetail.tsx`
- Test: `src/features/settings/sections/ModelSection.test.tsx`

- [ ] **Step 1: 写 UI 测试**

```tsx
it("shows provider list and selected provider detail without CCR wording", async () => {
  render(<ModelSection />);

  expect(await screen.findByText("Provider connections")).toBeInTheDocument();
  expect(screen.getByLabelText("Provider details")).toBeInTheDocument();
  expect(screen.queryByText(/CCR/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 提取左侧列表**

`ProviderConnectionSidebar` props：

```ts
interface ProviderConnectionSidebarProps {
  connections: ProviderConnectionSummary[];
  selectedId: string | null;
  defaultSelection: ProviderModelSelection | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}
```

- [ ] **Step 3: 提取右侧详情**

`ProviderConnectionDetail` props：

```ts
interface ProviderConnectionDetailProps {
  connection: ProviderConnectionConfig;
  builtIn: BuiltInProfile[];
  defaultSelection: ProviderModelSelection | null;
  onSaved: () => void;
}
```

- [ ] **Step 4: 移除普通 UI 的 CcrRuntimeStatus**

删除 `ModelSection` 中普通展示的：

```tsx
<CcrRuntimeStatus status={data.ccrStatus} />
```

内部错误映射成用户语义：

- `ccr_applying` → “正在初始化模型路由”
- `ccr_error` → “模型路由初始化失败”

- [ ] **Step 5: 跑测试**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: UI 测试通过，普通文案不再出现 CCR。

### Task 7: 最终请求地址预览

**Files:**
- Create: `src/features/settings/sections/ProviderEndpointPreview.tsx`
- Test: `src/features/settings/sections/modelSectionModels.test.ts`

- [ ] **Step 1: 写纯函数测试**

```ts
expect(finalProviderRequestUrl({
  protocol: "openai-responses",
  baseUrl: "https://aiproxy.cloud-ip.cc/v1",
})).toBe("https://aiproxy.cloud-ip.cc/v1/responses");

expect(finalProviderRequestUrl({
  protocol: "openai-chat-completions",
  baseUrl: "https://api.example.com/v1/chat/completions",
})).toBe("https://api.example.com/v1/chat/completions");
```

- [ ] **Step 2: 实现展示组件**

```tsx
export function ProviderEndpointPreview({ url }: { url: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">完整请求地址</div>
      <code className="mt-1 block break-all text-[12px] text-foreground">{url}</code>
    </div>
  );
}
```

- [ ] **Step 3: 跑测试**

Run:

```bash
bun test src/features/settings/sections/modelSectionModels.test.ts
```

Expected: URL 归一化测试通过。

---

## Phase 4: 视觉附件基础设施

### Task 8: 附件数据库与服务

**Files:**
- Modify: `sidecar/src/db.ts`
- Create: `sidecar/src/services/attachments.ts`
- Test: `sidecar/src/services/attachments.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it("stores pasted image bytes under app data and returns stable metadata", async () => {
  const service = new AttachmentService(db, { rootDir });
  const result = await service.createImageAttachment({
    threadId: "thread_1",
    bytes: Buffer.from([137, 80, 78, 71]),
    mimeType: "image/png",
    filename: "screenshot.png",
  });

  expect(result).toMatchObject({
    threadId: "thread_1",
    kind: "image",
    mimeType: "image/png",
    filename: "screenshot.png",
  });
  expect(result.storagePath).toContain(rootDir);
});
```

- [ ] **Step 2: 增加表**

`sidecar/src/db.ts`：

```sql
CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('image')),
  mime_type    TEXT NOT NULL,
  filename     TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  sha256       TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_thread ON attachments (thread_id, created_at);

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  PRIMARY KEY (message_id, attachment_id)
);
```

- [ ] **Step 3: 实现 AttachmentService**

```ts
export interface ImageAttachmentDTO {
  id: string;
  threadId: string;
  kind: "image";
  mimeType: string;
  filename: string;
  byteSize: number;
  width?: number;
  height?: number;
  sha256: string;
  storagePath: string;
  createdAt: number;
}
```

存储路径：

```ts
attachments/<threadId>/<sha256>.<ext>
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/services/attachments.test.ts sidecar/src/db.test.ts
```

Expected: DB schema 和服务测试通过。

### Task 9: 附件上传 API

**Files:**
- Create: `sidecar/src/routes/attachments.ts`
- Modify: `sidecar/src/server.ts`
- Create: `src/lib/data/attachments.ts`
- Test: `sidecar/src/routes/attachments.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it("POST /attachments/images stores image for a thread", async () => {
  const form = new FormData();
  form.append("threadId", "thread_1");
  form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "shot.png");

  const res = await app.request("/attachments/images", {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({
    attachment: { kind: "image", mimeType: "image/png", filename: "shot.png" },
  });
});
```

- [ ] **Step 2: 实现路由**

限制：

- 只接受 `image/png`、`image/jpeg`、`image/webp`。
- 单图最大 10MB。
- 单条消息最多 8 张。

- [ ] **Step 3: 前端 client**

`src/lib/data/attachments.ts`：

```ts
export async function uploadImageAttachment(input: {
  threadId: string;
  file: File;
}): Promise<ImageAttachment> {
  const form = new FormData();
  form.append("threadId", input.threadId);
  form.append("file", input.file);
  const res = await fetchSidecar("/attachments/images", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`upload_image_${res.status}`);
  return ((await res.json()) as { attachment: ImageAttachment }).attachment;
}
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/routes/attachments.test.ts
```

Expected: 上传 API 测试通过。

---

## Phase 5: 输入框上传与粘贴图片

### Task 10: TaskMessageInput 支持图片附件

**Files:**
- Modify: `src/features/task/TaskMessageInput.tsx`
- Create: `src/features/task/ImageAttachmentTray.tsx`
- Test: `src/features/task/TaskMessageInput.test.tsx`

- [ ] **Step 1: 写 UI 测试**

```tsx
it("uploads pasted screenshot and sends attachment ids with the message", async () => {
  render(<TaskMessageInput {...props} />);

  await user.paste(new ClipboardEvent("paste", {
    clipboardData: makeClipboardWithPng("shot.png"),
  }) as never);

  expect(await screen.findByAltText("shot.png")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Message"), "看下这张图");
  await user.click(screen.getByRole("button", { name: /send/i }));

  expect(onSend).toHaveBeenCalledWith("看下这张图", {
    attachmentIds: ["att_1"],
  });
});
```

- [ ] **Step 2: 调整 props**

```ts
interface TaskMessageInputProps {
  onSend: (text: string, options?: { attachmentIds?: string[] }) => void | Promise<void>;
  onQueue?: (text: string, options?: { attachmentIds?: string[] }) => void;
  onOverride?: (text: string, options?: { attachmentIds?: string[] }) => void;
}
```

- [ ] **Step 3: 增加文件选择和粘贴**

实现：

- 附件按钮打开 `<input type="file" accept="image/png,image/jpeg,image/webp">`
- `onPaste` 读取 `clipboardData.items` 中的 image。
- 上传成功后加入 tray。
- 发送成功后清空 tray。

- [ ] **Step 4: 不做拖拽**

本阶段不实现 drag/drop，不留空 handler。

- [ ] **Step 5: 跑测试**

Run:

```bash
bun test src/features/task/TaskMessageInput.test.tsx
```

Expected: 文件上传、粘贴、预览、移除、发送附件 id 通过。

### Task 11: runtime 和 run API 传递附件

**Files:**
- Modify: `src/lib/agui/runtime/api.ts`
- Modify: `src/lib/agui/runtime/runtime.ts`
- Modify: `sidecar/src/routes/runs.ts`
- Modify: `sidecar/src/agent/runWorker.ts`
- Test: `src/lib/agui/runtime/runtime.test.ts`
- Test: `sidecar/src/routes/runs.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/agui/runtime/runtime.test.ts`：

```ts
await rt.send("看图", {
  providerSelection,
  attachmentIds: ["att_1"],
});

expect(postRunBody).toMatchObject({
  message: { role: "user", content: "看图" },
  attachmentIds: ["att_1"],
});
```

- [ ] **Step 2: 扩展 request 类型**

```ts
export interface PostRunRequest {
  attachmentIds?: string[];
}

export interface SendProviderOptions {
  attachmentIds?: string[];
}
```

- [ ] **Step 3: sidecar 校验**

`sidecar/src/routes/runs.ts`：

```ts
const attachmentIds = parseStringArray(body.attachmentIds) ?? [];
```

`runWorker` input：

```ts
attachmentIds?: string[];
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test src/lib/agui/runtime/runtime.test.ts sidecar/src/routes/runs.test.ts
```

Expected: 附件 id 从 UI 传到 worker。

---

## Phase 6: Provider 多模态发送与非视觉降级

### Task 12: 消息持久化与历史展示

**Files:**
- Modify: `sidecar/src/services/messages.ts`
- Modify: `sidecar/src/routes/messages.ts`
- Modify: `src/lib/agui/runtime/types.ts`
- Modify: `src/features/task/ChatStream.tsx`
- Test: `sidecar/src/services/messages.test.ts`
- Test: `src/features/task/ChatStream.test.tsx`

- [ ] **Step 1: 写失败测试**

```ts
it("groups user turns with image attachments", () => {
  const msg = messages.appendUser("thread_1", "看图");
  attachments.linkToMessage(msg.id, ["att_1"]);

  expect(messages.listByThreadGrouped("thread_1")[0]).toMatchObject({
    role: "user",
    content: "看图",
    attachments: [expect.objectContaining({ id: "att_1", kind: "image" })],
  });
});
```

- [ ] **Step 2: 扩展 DTO**

```ts
export type TurnDTO =
  | {
      id: string;
      role: "user";
      content: string;
      attachments?: ImageAttachmentDTO[];
      createdAt: number;
    }
  | { id: string; role: "assistant"; blocks: AssistantBlock[]; createdAt: number };
```

- [ ] **Step 3: ChatStream 展示缩略图**

用户消息下方渲染：

```tsx
{message.attachments?.map((attachment) => (
  <img
    key={attachment.id}
    src={attachment.thumbnailUrl}
    alt={attachment.filename}
    className="max-h-48 rounded-md border border-border object-contain"
  />
))}
```

- [ ] **Step 4: 跑测试**

Run:

```bash
bun test sidecar/src/services/messages.test.ts src/features/task/ChatStream.test.tsx
```

Expected: 历史消息能展示附件。

### Task 13: Claude provider 发送 image block 或附件路径说明

**Files:**
- Modify: `sidecar/src/agui/core/provider-types.ts`
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Test: `sidecar/src/agui/provider-claude/provider.test.ts`

- [ ] **Step 1: 定义 provider 用户消息**

```ts
export interface RunUserImageAttachment {
  id: string;
  mimeType: string;
  filename: string;
  storagePath: string;
  base64?: string;
}

export interface RunUserMessage {
  role: "user";
  content: string;
  attachments?: RunUserImageAttachment[];
  visualInputEnabled?: boolean;
}
```

- [ ] **Step 2: 写视觉模型测试**

```ts
expect(promptSentToSdk).toEqual([
  { type: "text", text: "看图" },
  {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: expect.any(String),
    },
  },
]);
```

- [ ] **Step 3: 写非视觉模型测试**

```ts
expect(promptSentToSdk).toContain(
  "These images are not embedded as visual input for the current model.",
);
expect(promptSentToSdk).toContain("/Application Support/com.agentstudiolab.agent-studio/attachments/");
```

- [ ] **Step 4: 实现 prompt 构造**

视觉模型：

```ts
const prompt = [
  { type: "text", text: userTextWithAttachmentSummary },
  ...attachments.map((a) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: a.mimeType,
      data: a.base64!,
    },
  })),
];
```

非视觉模型：

```ts
const prompt = [
  userText,
  "",
  "Attached images:",
  ...attachments.map((a) => `- ${a.filename} (${a.mimeType}): ${a.storagePath}`),
  "These images are not embedded as visual input for the current model. Use available tools to inspect them if needed.",
].join("\n");
```

- [ ] **Step 5: 跑测试**

Run:

```bash
bun test sidecar/src/agui/provider-claude/provider.test.ts sidecar/src/agent/runWorker.test.ts
```

Expected: 视觉和非视觉路径都正确。

---

## Phase 7: 验证、回归与发布顺序

### Task 14: 集成验证

**Files:**
- Modify: no production files
- Test: existing test suites

- [ ] **Step 1: Sidecar 单测**

Run:

```bash
bun test sidecar/src/services/providerSettings.test.ts \
  sidecar/src/ccr/config.test.ts \
  sidecar/src/ccr/routes.test.ts \
  sidecar/src/ccr/runtime-service.test.ts \
  sidecar/src/routes/settings-provider.test.ts \
  sidecar/src/services/attachments.test.ts \
  sidecar/src/routes/attachments.test.ts \
  sidecar/src/services/messages.test.ts \
  sidecar/src/routes/runs.test.ts \
  sidecar/src/agui/provider-claude/provider.test.ts
```

Expected: PASS。

- [ ] **Step 2: 前端单测**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx \
  src/features/settings/sections/modelSectionModels.test.ts \
  src/features/task/TaskMessageInput.test.tsx \
  src/features/task/ChatStream.test.tsx \
  src/lib/agui/runtime/runtime.test.ts
```

Expected: PASS。

- [ ] **Step 3: 类型检查**

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
cd sidecar && bunx tsc --noEmit
```

Expected: no TypeScript errors。

- [ ] **Step 4: 手动 smoke**

Run:

```bash
AGENT_STUDIO_CCR_LOG=1 AGENT_STUDIO_CCR_LOG_LEVEL=trace bun run tauri:dev
```

Manual checks:

- 自定义 Provider 选择 OpenAI Responses 后，完整请求地址显示 `/responses`。
- 基础连接测试返回 ok。
- 使用 sub2api `gpt-5.5` 发普通文本时能看到 reasoning。
- 上传/粘贴图片后，用户消息显示缩略图。
- 视觉模型收到 image block。
- 非视觉模型收到附件路径说明，可以用 Python/工具读取图片。
- 设置页普通 UI 不出现 CCR 字样。

## 分阶段交付建议

1. **提交 1：协议拆分 + reasoning 修复**
   - 覆盖 Phase 1。
   - 用户可马上解决 OpenAI Responses 思考缺失。

2. **提交 2：健康检查 + 能力数据模型**
   - 覆盖 Phase 2。
   - UI 仍可维持旧结构，但已有后端能力。

3. **提交 3：设置页双栏改造**
   - 覆盖 Phase 3。
   - 移除 CCR 普通展示，完成主要体验优化。

4. **提交 4：附件存储 + 上传 API**
   - 覆盖 Phase 4。
   - 不影响 run 行为，风险可控。

5. **提交 5：输入框图片上传/粘贴 + 历史展示**
   - 覆盖 Phase 5 和 Phase 6 的展示部分。

6. **提交 6：provider 多模态转发与非视觉附件说明**
   - 覆盖 Phase 6 provider 部分。
   - 需要重点手动验证。

## 主要风险

- CCR runtime 的 `openai-responses` transformer 必须来自可复现依赖，不能只依赖当前机器 App Support 目录里已有的 runtime 文件。
- OpenAI Responses 的 reasoning summary 会增加 token、延迟和费用；只在 Responses 协议下启用 summarized thinking。
- 图片附件会扩大本地存储，需要后续增加清理策略；第一阶段先随 conversation cascade 删除。
- 非视觉模型通过工具读取图片依赖工具权限和 sandbox 可读路径，附件目录必须加入 provider 可读范围。
- 官方服务商 `provider-official` 当前是 website runtime，不一定支持图片；第一阶段应明确只支持 sidecar provider 的视觉路径。

## 暂不做

- 默认图片识别模型。
- 自动切换视觉模型。
- 拖拽图片上传。
- 图片编辑/标注/OCR 专用工具。
- 云同步附件。
- 多用途默认模型，如视觉默认、轻量任务默认、标题生成默认。

## 自检

- 已覆盖用户列出的 5 个优化点：协议/思考、健康检查、允许对话语义、视觉模型、默认模型 UI。
- 已隐藏 CCR 普通用户概念，但保留日志诊断。
- 已区分系统探测和用户能力覆盖。
- 已把图片作为通用附件设计，不绑定单一视觉模型策略。
- 未使用模型 ID 正则推断 Responses。

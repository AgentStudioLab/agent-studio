# Provider Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. During execution, update **Execution Progress** after every completed, blocked, or materially changed task.

**Goal:** 将 provider 的“模型列表刷新”和“Agent 运行时调用”拆开建模，修复 SiliconFlow 通过 Claude Agent SDK 运行时报 `stream error` 的问题，并实现第一版 OpenAI-compatible Agent runtime。

**Architecture:** `sidecar/src/lib/providerProfiles.ts` 继续作为 provider metadata 单一来源，但新增 `agentRuntime` 表达运行时协议、运行时 base URL、鉴权模式和能力等级。Anthropic-compatible runtime 继续复用现有 Claude Agent SDK provider；OpenAI-compatible runtime 使用 `ai` + `@ai-sdk/openai-compatible` 实现新的 `AgentProvider`，先支持文本流、usage、基础错误映射和无工具运行。模型列表仍使用现有 `modelList`，因此同一 provider 可以用 OpenAI-compatible `/models` 刷新模型，同时选择 Anthropic-compatible 或 OpenAI-compatible runtime 执行。

**Tech Stack:** TypeScript、Bun test、Bun SQLite、Hono、React 19、TanStack Query、Claude Agent SDK、AI SDK v6、`@ai-sdk/openai-compatible`、shadcn/ui。

**提交策略:** 当前工作树已有未提交的 provider/model settings 相关改动。本计划执行期间不要自动提交；只有用户明确要求提交时，才窄范围 stage/commit 本计划相关文件。

---

## Execution Progress

> 后续执行时必须实时更新本节：每完成一个 task，把状态从 `pending` 改为 `done`；遇到阻塞改为 `blocked` 并写明证据；验证命令跑完后记录实际结果和日期。

| Task | Status | Last update | Notes |
|---|---|---|---|
| 1. Provider runtime metadata | done | 2026-06-05 | `cd sidecar && bun test src/lib/providerProfiles.test.ts src/services/providerSettings.test.ts` PASS |
| 2. Provider settings resolved runtime | done | 2026-06-05 | `cd sidecar && bun test src/lib/providerProfiles.test.ts src/services/providerSettings.test.ts` PASS |
| 3. Claude provider auth mode | done | 2026-06-05 | `cd sidecar && bun test src/agui/provider-claude/provider-env.test.ts src/agui/provider-claude/provider.test.ts` PASS |
| 4. Runtime provider factory | done | 2026-06-05 | `cd sidecar && bun test src/agui/provider-factory.test.ts` PASS; server now uses factory |
| 5. OpenAI-compatible provider dependency | done | 2026-06-05 | Installed `ai@6.0.197` and `@ai-sdk/openai-compatible@2.0.48`; import smoke PASS |
| 6. OpenAI provider text streaming | done | 2026-06-05 | `cd sidecar && bun test src/agui/provider-openai/provider.test.ts src/agui/provider-openai/bridge.test.ts` PASS |
| 7. OpenAI provider integration path | done | 2026-06-05 | `cd sidecar && bun test src/routes/settings-provider.test.ts` PASS; runtime metadata returned |
| 8. Frontend runtime status | done | 2026-06-05 | `bun test src/features/settings/sections/ModelSection.test.tsx` PASS |
| 9. Verification and smoke checks | done | 2026-06-05 | Sidecar targeted tests: 47 pass; ModelSection test: 12 pass; `cd sidecar && bunx tsc --noEmit` PASS; `bunx tsc --noEmit -p tsconfig.app.json` PASS. Manual SiliconFlow/OpenAI smoke not run. |

## 文件结构

- 修改 `sidecar/src/lib/providerProfiles.ts`：新增 `AgentRuntime` 类型；为 Anthropic、DeepSeek、SiliconFlow 配置 Anthropic-compatible runtime；为 OpenAI/DashScope/OpenRouter 等配置 OpenAI-compatible runtime。
- 修改 `sidecar/src/lib/providerProfiles.test.ts`：验证 SiliconFlow runtime root base URL 不带 `/v1` 且鉴权模式为 Bearer；验证 OpenAI-compatible providers 暴露 OpenAI runtime。
- 修改 `sidecar/src/services/providerSettings.ts`：`ResolvedProvider` 返回当前 provider 的 `agentRuntime`，custom provider 根据配置默认走 Anthropic-compatible runtime，后续可扩展 UI 显式选择。
- 修改 `sidecar/src/services/providerSettings.test.ts`：验证 resolved runtime 随 profile/base URL 变化正确计算，且 SiliconFlow 不把模型列表 URL 当 runtime URL。
- 修改 `sidecar/src/agui/provider-claude/provider.ts`：`ClaudeProviderOptions` 增加 `authMode`，构造 SDK env 时在 `ANTHROPIC_API_KEY` 与 `ANTHROPIC_AUTH_TOKEN` 之间选择。
- 新增 `sidecar/src/agui/provider-claude/provider-env.test.ts`：单测 Claude SDK env 构造，不启动真实 SDK。
- 新增 `sidecar/src/agui/provider-factory.ts`：按 `AgentRuntime.protocol` 创建并缓存对应 runtime provider。
- 修改 `sidecar/src/server.ts`：使用 provider factory，不再硬编码 `createClaudeProvider()`。
- 修改 `sidecar/package.json`：新增 sidecar 依赖 `ai` 和 `@ai-sdk/openai-compatible`。
- 新增 `sidecar/src/agui/provider-openai/provider.ts`：基于 AI SDK 的 OpenAI-compatible `AgentProvider` 第一版实现。
- 新增 `sidecar/src/agui/provider-openai/bridge.ts`：将 AI SDK text stream/finish/error 转成 AGUI events，并调用 `ProviderCallbacks`。
- 新增 `sidecar/src/agui/provider-openai/error-map.ts`：OpenAI-compatible 错误到 `RUN_ERROR.code` 的映射。
- 新增 `sidecar/src/agui/provider-openai/provider.test.ts` 和 `bridge.test.ts`：验证流式事件、usage、错误、resume/rewind 限制。
- 修改 `sidecar/src/routes/settings.ts`：`GET /settings/provider` 返回 `agentRuntime` 信息，供前端展示兼容性。
- 修改 `sidecar/src/routes/settings-provider.test.ts`：验证 settings route 返回 runtime metadata。
- 修改 `src/lib/data/settings.ts`：同步前端 `AgentRuntime` 类型和 `ProviderConfig/BuiltInProfile` 字段。
- 修改 `src/features/settings/sections/ModelSection.tsx`：展示 runtime 状态，区分 Anthropic-compatible、OpenAI-compatible 和当前能力限制。
- 修改 `src/features/settings/sections/ModelSection.test.tsx`：验证 SiliconFlow、OpenAI 两类 runtime 文案。
- 修改 `src/i18n/locales/zh/settings.json` 和 `src/i18n/locales/en/settings.json`：新增 runtime 状态文案。

## Runtime Scope

本计划内 OpenAI-compatible runtime 的第一版只承诺：

- 文本流式输出：用户能发送消息并看到流式 assistant 文本。
- usage 记录：能把 input/output tokens 写入现有 usage 回调。
- 基础错误映射：鉴权、限流、上游 5xx、模型错误映射为现有 `RUN_ERROR.code`。
- 无工具能力：不暴露 Claude Code 内置文件/命令工具；不会执行 Bash/Read/Edit/Write。
- 无 HITL interrupt：没有工具就不会产生审批卡。
- 无文件 checkpoint rewind：`rewindFiles()` 返回 `{ canRewind: false, error: "unsupported" }`。
- 无 provider resume：`resume()` 对 OpenAI provider 返回 `RUN_ERROR`，提示该 runtime 没有 pending interrupt。

后续版本再设计 OpenAI 工具调用、HITL、审计、文件编辑工具、checkpoint/regen 等能力。

## Task 1: Provider Runtime Metadata

**Files:**
- Modify: `sidecar/src/lib/providerProfiles.ts`
- Modify: `sidecar/src/lib/providerProfiles.test.ts`

- [ ] **Step 1: 写失败测试锁定 SiliconFlow runtime**

在 `sidecar/src/lib/providerProfiles.test.ts` 增加测试：

```ts
it("configures SiliconFlow model list as /v1/models but runtime as Anthropic root bearer", () => {
  const cn = getBuiltInProfile("siliconflow-cn");
  const global = getBuiltInProfile("siliconflow");

  expect(cn?.baseUrl).toBe("https://api.siliconflow.cn/v1");
  expect(cn?.modelList).toEqual({
    strategy: "openai-compatible",
    path: "/models",
  });
  expect(cn?.agentRuntime).toEqual({
    protocol: "anthropic",
    baseUrl: "https://api.siliconflow.cn",
    auth: "bearer",
    capabilities: {
      text: true,
      tools: true,
      fileCheckpoint: true,
    },
  });

  expect(global?.baseUrl).toBe("https://api.siliconflow.com/v1");
  expect(global?.agentRuntime).toEqual({
    protocol: "anthropic",
    baseUrl: "https://api.siliconflow.com",
    auth: "bearer",
    capabilities: {
      text: true,
      tools: true,
      fileCheckpoint: true,
    },
  });
});
```

- [ ] **Step 2: 写失败测试锁定 OpenAI-compatible runtime**

继续在 `sidecar/src/lib/providerProfiles.test.ts` 增加：

```ts
it("configures OpenAI-compatible providers with OpenAI text runtime", () => {
  const openai = getBuiltInProfile("openai");
  const dashscope = getBuiltInProfile("dashscope");

  expect(openai?.agentRuntime).toEqual({
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
    capabilities: {
      text: true,
      tools: false,
      fileCheckpoint: false,
    },
  });

  expect(dashscope?.agentRuntime.protocol).toBe("openai-compatible");
  expect(dashscope?.agentRuntime.capabilities).toEqual({
    text: true,
    tools: false,
    fileCheckpoint: false,
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/lib/providerProfiles.test.ts
```

Expected: FAIL，TypeScript 或断言提示 `agentRuntime` 不存在。

- [ ] **Step 4: 实现 `AgentRuntime` 类型**

在 `sidecar/src/lib/providerProfiles.ts` 的 `ModelListStrategy` 后增加：

```ts
export interface AgentRuntimeCapabilities {
  text: boolean;
  tools: boolean;
  fileCheckpoint: boolean;
}

export type AgentRuntime =
  | {
      protocol: "anthropic";
      baseUrl: string;
      auth: "x-api-key" | "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "openai-compatible";
      baseUrl: string;
      auth: "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "unsupported";
      reason: string;
      capabilities: AgentRuntimeCapabilities;
    };
```

扩展 `ProviderProfile`：

```ts
export interface ProviderProfile {
  id: Exclude<ProviderProfileId, "custom">;
  label: string;
  region?: "Global" | "China" | "Cloud";
  baseUrl: string;
  modelList: ModelListStrategy;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
  models: ProfileModel[];
}
```

增加 helpers：

```ts
const ANTHROPIC_FULL_CAPABILITIES: AgentRuntimeCapabilities = {
  text: true,
  tools: true,
  fileCheckpoint: true,
};

const OPENAI_TEXT_CAPABILITIES: AgentRuntimeCapabilities = {
  text: true,
  tools: false,
  fileCheckpoint: false,
};

const UNSUPPORTED_CAPABILITIES: AgentRuntimeCapabilities = {
  text: false,
  tools: false,
  fileCheckpoint: false,
};

function anthropicRuntime(
  baseUrl: string,
  auth: "x-api-key" | "bearer" = "x-api-key",
): AgentRuntime {
  return {
    protocol: "anthropic",
    baseUrl,
    auth,
    capabilities: ANTHROPIC_FULL_CAPABILITIES,
  };
}

function openAICompatibleRuntime(baseUrl: string): AgentRuntime {
  return {
    protocol: "openai-compatible",
    baseUrl,
    auth: "bearer",
    capabilities: OPENAI_TEXT_CAPABILITIES,
  };
}
```

修改 `ProviderProfileInput`：

```ts
type ProviderProfileInput =
  Omit<ProviderProfile, "supportsRemoteModels" | "agentRuntime"> & {
    agentRuntime?: AgentRuntime;
  };
```

修改 `defineProfile()`：

```ts
function defineProfile(profile: ProviderProfileInput): ProviderProfile {
  return {
    ...profile,
    agentRuntime:
      profile.agentRuntime ??
      ({
        protocol: "unsupported",
        reason: "Agent runtime is not implemented for this provider.",
        capabilities: UNSUPPORTED_CAPABILITIES,
      } satisfies AgentRuntime),
    compatibilityNote:
      profile.compatibilityNote ??
      (profile.id === "anthropic" || profile.id === "deepseek"
        ? undefined
        : RUNTIME_COMPATIBILITY_NOTE),
    supportsRemoteModels: profile.modelList.strategy !== "static",
  };
}
```

- [ ] **Step 5: 配置 Anthropic-compatible profiles**

Anthropic:

```ts
agentRuntime: anthropicRuntime("https://api.anthropic.com", "x-api-key"),
```

DeepSeek:

```ts
agentRuntime: anthropicRuntime("https://api.deepseek.com/anthropic", "x-api-key"),
```

SiliconFlow China:

```ts
agentRuntime: anthropicRuntime("https://api.siliconflow.cn", "bearer"),
compatibilityNote: "Uses SiliconFlow's Anthropic-compatible Messages endpoint.",
```

SiliconFlow Global:

```ts
agentRuntime: anthropicRuntime("https://api.siliconflow.com", "bearer"),
compatibilityNote: "Uses SiliconFlow's Anthropic-compatible Messages endpoint.",
```

- [ ] **Step 6: 配置 OpenAI-compatible profiles**

为这些 profile 添加 `agentRuntime: openAICompatibleRuntime(baseUrl)`：

```ts
openai
minimax
openrouter
novita
dashscope
zhipu
moonshot-cn
moonshot-global
doubao
volcengine-ark
bailian
qianfan
hunyuan
```

示例：

```ts
{
  id: "openai",
  label: "OpenAI",
  region: "Global",
  baseUrl: "https://api.openai.com/v1",
  modelList: { strategy: "openai-compatible", path: "/models" },
  agentRuntime: openAICompatibleRuntime("https://api.openai.com/v1"),
  models: [fallbackModel("gpt-5.1", "GPT-5.1")],
}
```

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
cd sidecar && bun test src/lib/providerProfiles.test.ts
```

Expected: PASS。

更新 **Execution Progress**：Task 1 -> `done`，记录测试结果。

## Task 2: Provider Settings Resolve Runtime

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: 写失败测试验证 SiliconFlow resolved runtime**

在 `sidecar/src/services/providerSettings.test.ts` 增加：

```ts
it("resolves SiliconFlow runtime separately from model list baseUrl", () => {
  const { settings } = setup();

  settings.update({
    profileId: "siliconflow-cn",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sf-key",
  });

  const current = settings.current();
  expect(current.baseUrl).toBe("https://api.siliconflow.cn/v1");
  expect(current.agentRuntime).toMatchObject({
    protocol: "anthropic",
    baseUrl: "https://api.siliconflow.cn",
    auth: "bearer",
  });
});
```

- [ ] **Step 2: 写失败测试验证 OpenAI resolved runtime 和 custom fallback**

继续增加：

```ts
it("resolves OpenAI-compatible runtime for OpenAI providers", () => {
  const { settings } = setup();

  settings.update({
    profileId: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "openai-key",
  });

  expect(settings.current().agentRuntime).toMatchObject({
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
  });
});

it("uses custom baseUrl as Anthropic runtime for custom providers", () => {
  const { settings } = setup();

  settings.update({
    profileId: "custom",
    baseUrl: "https://gateway.example",
    apiKey: "custom-key",
  });

  expect(settings.current().agentRuntime).toMatchObject({
    protocol: "anthropic",
    baseUrl: "https://gateway.example",
    auth: "x-api-key",
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected: FAIL，`agentRuntime` 字段不存在。

- [ ] **Step 4: 扩展 `ResolvedProvider` 类型**

在 `sidecar/src/services/providerSettings.ts` import 增加 `type AgentRuntime`：

```ts
import {
  BUILT_IN_PROFILES,
  getBuiltInProfile,
  type AgentRuntime,
  type ProfileModel,
  type ProviderProfileId,
} from "../lib/providerProfiles";
```

在 `ResolvedProvider` 增加：

```ts
agentRuntime: AgentRuntime;
```

- [ ] **Step 5: 在 `resolve()` 中返回 runtime**

custom provider 分支增加：

```ts
agentRuntime: {
  protocol: "anthropic",
  baseUrl: persisted.baseUrl,
  auth: "x-api-key",
  capabilities: {
    text: true,
    tools: true,
    fileCheckpoint: true,
  },
},
```

fallback removed-profile 分支增加：

```ts
agentRuntime: fallback.agentRuntime,
```

built-in 分支增加：

```ts
agentRuntime: builtIn.agentRuntime,
```

- [ ] **Step 6: 运行 provider settings 测试确认通过**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected: PASS。

更新 **Execution Progress**：Task 2 -> `done`，记录测试结果。

## Task 3: Claude Provider Auth Mode

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`
- Create: `sidecar/src/agui/provider-claude/provider-env.test.ts`

- [ ] **Step 1: 抽出 env 构造函数并写失败测试**

创建 `sidecar/src/agui/provider-claude/provider-env.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { buildClaudeProviderEnv } from "./provider";

describe("buildClaudeProviderEnv", () => {
  it("uses ANTHROPIC_API_KEY for x-api-key auth", () => {
    const env = buildClaudeProviderEnv(
      {
        ANTHROPIC_AUTH_TOKEN: "stale",
        ANTHROPIC_API_KEY: "stale-key",
      },
      {
        apiKey: "key-1",
        baseUrl: "https://api.anthropic.com",
        authMode: "x-api-key",
        model: "claude-sonnet-4-6",
      },
    );

    expect(env.ANTHROPIC_API_KEY).toBe("key-1");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-6");
  });

  it("uses ANTHROPIC_AUTH_TOKEN for bearer auth", () => {
    const env = buildClaudeProviderEnv(
      {
        ANTHROPIC_API_KEY: "stale-key",
        ANTHROPIC_AUTH_TOKEN: "stale-token",
      },
      {
        apiKey: "sf-key",
        baseUrl: "https://api.siliconflow.cn",
        authMode: "bearer",
      },
    );

    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sf-key");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.siliconflow.cn");
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/provider-env.test.ts
```

Expected: FAIL，`buildClaudeProviderEnv` 未导出。

- [ ] **Step 3: 实现 env helper 和 `authMode`**

在 `sidecar/src/agui/provider-claude/provider.ts` 中扩展 options：

```ts
export type ClaudeProviderAuthMode = "x-api-key" | "bearer";
```

```ts
export interface ClaudeProviderOptions {
  apiKey: string;
  baseUrl?: string;
  authMode?: ClaudeProviderAuthMode;
  model?: string;
  // 其余字段保持不变
}
```

在 `createClaudeProvider()` 前增加：

```ts
export function buildClaudeProviderEnv(
  baseEnv: Record<string, string | undefined>,
  opts: {
    apiKey: string;
    baseUrl?: string;
    authMode?: ClaudeProviderAuthMode;
    model?: string;
  },
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...baseEnv };
  if ((opts.authMode ?? "x-api-key") === "bearer") {
    env.ANTHROPIC_AUTH_TOKEN = opts.apiKey;
    delete env.ANTHROPIC_API_KEY;
  } else {
    env.ANTHROPIC_API_KEY = opts.apiKey;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  if (opts.baseUrl) env.ANTHROPIC_BASE_URL = opts.baseUrl;
  else delete env.ANTHROPIC_BASE_URL;
  if (opts.model) env.ANTHROPIC_MODEL = opts.model;
  else delete env.ANTHROPIC_MODEL;
  return env;
}
```

替换原 `buildEnv()`：

```ts
function buildEnv(): Record<string, string | undefined> {
  return buildClaudeProviderEnv(process.env as Record<string, string | undefined>, {
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    authMode: opts.authMode,
    model: opts.model,
  });
}
```

传给 SDK 时保留现有类型兼容：

```ts
env: buildEnv() as Record<string, string>,
```

- [ ] **Step 4: 运行 env 测试**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/provider-env.test.ts
```

Expected: PASS。

更新 **Execution Progress**：Task 3 -> `done`，记录测试结果。

## Task 4: Runtime Provider Factory

**Files:**
- Create: `sidecar/src/agui/provider-factory.ts`
- Create: `sidecar/src/agui/provider-factory.test.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 写 factory 失败测试**

创建 `sidecar/src/agui/provider-factory.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { createAgentProviderForRuntime } from "./provider-factory";

describe("createAgentProviderForRuntime", () => {
  it("creates a Claude provider for Anthropic runtimes", () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "anthropic",
        baseUrl: "https://api.siliconflow.cn",
        auth: "bearer",
        capabilities: { text: true, tools: true, fileCheckpoint: true },
      },
      apiKey: "sf-key",
      defaultModel: undefined,
      common: {
        resolveAllowedTools: () => [],
      },
    });

    expect(provider.name).toBe("claude-agent-sdk");
  });

  it("creates an OpenAI-compatible provider for OpenAI runtimes", () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
      apiKey: "openai-key",
      defaultModel: "gpt-5.1",
      common: {
        resolveAllowedTools: () => [],
      },
    });

    expect(provider.name).toBe("openai-compatible");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-factory.test.ts
```

Expected: FAIL，factory 文件不存在。

- [ ] **Step 3: 实现 factory**

创建 `sidecar/src/agui/provider-factory.ts`：

```ts
import type { AgentRuntime } from "../lib/providerProfiles";
import type { AgentProvider } from "./core";
import {
  createClaudeProvider,
  type ClaudeProviderOptions,
} from "./provider-claude";
import { createOpenAICompatibleProvider } from "./provider-openai/provider";

export interface ProviderFactoryInput {
  runtime: AgentRuntime;
  apiKey: string;
  defaultModel?: string;
  common: Omit<ClaudeProviderOptions, "apiKey" | "baseUrl" | "authMode" | "model">;
}

export function createAgentProviderForRuntime(input: ProviderFactoryInput): AgentProvider {
  const { runtime, apiKey, defaultModel, common } = input;
  if (runtime.protocol === "anthropic") {
    return createClaudeProvider({
      ...common,
      apiKey,
      baseUrl: runtime.baseUrl,
      authMode: runtime.auth,
      model: defaultModel,
    });
  }

  if (runtime.protocol === "openai-compatible") {
    return createOpenAICompatibleProvider({
      apiKey,
      baseUrl: runtime.baseUrl,
      model: defaultModel,
    });
  }

  throw new Error("agent_runtime_not_supported");
}
```

本步骤会因为 `createOpenAICompatibleProvider` 尚未存在而无法通过；Task 6 会补齐。

- [ ] **Step 4: 修改 `server.ts` 使用 factory**

在 `sidecar/src/server.ts` 替换 `createClaudeProvider` import 为：

```ts
import { createAgentProviderForRuntime } from "./agui/provider-factory";
```

把缓存类型改成通用 `AgentProvider`：

```ts
import type { AgentProvider } from "./agui/core";
let providerInstance: AgentProvider | null = null;
```

修改 `buildProvider()`：

```ts
function buildProvider() {
  const current = providerSettings.current();
  if (!current.apiKey) throw new Error("api_key_missing");
  const resolveAllowedTools = (threadId: string): string[] => {
    const override = threads.getAllowedTools(threadId);
    return override ?? settingsTools.getDefault();
  };
  return createAgentProviderForRuntime({
    runtime: current.agentRuntime,
    apiKey: current.apiKey,
    defaultModel: process.env.ANTHROPIC_MODEL,
    common: {
      resolveAllowedTools,
      interruptBus,
      audit,
      resolveAppendPrompt: () =>
        composeAppendPrompt(userProfileSettings.current()),
      onInitMetadata: (threadId, meta) => sessionMetadata.upsert(threadId, meta),
      resolveSkillsConfig: () => ({
        enabledSkills: skillRegistry.listEnabledIds(),
        pluginPath: skillRegistry.builtinPluginPath(),
      }),
      skillInvocationsStore: skillInvocations,
      onCreateScheduledTask,
      onRemember,
    },
  });
}
```

如果 `onCreateScheduledTask` / `onRemember` 当前是 inline 函数，先提到 `buildProvider()` 外部或在 `common` 中保留原 inline 内容，行为不变。

- [ ] **Step 5: 暂不运行全量 factory 测试**

Expected: 由于 OpenAI provider 尚未实现，Task 4 的测试可能仍失败。更新 **Execution Progress**：Task 4 -> `in_progress`，Notes 写明等待 Task 6。

## Task 5: OpenAI-compatible Provider Dependency

**Files:**
- Modify: `sidecar/package.json`
- Modify: `bun.lock` or lockfile generated by Bun

- [ ] **Step 1: 检查 sidecar 是否已有 AI SDK 依赖**

Run:

```bash
cat sidecar/package.json
```

Expected: 当前没有 `ai` 和 `@ai-sdk/openai-compatible`。

- [ ] **Step 2: 安装 sidecar 依赖**

Run:

```bash
cd sidecar && bun add ai @ai-sdk/openai-compatible
```

Expected: `sidecar/package.json` 增加依赖，锁文件更新。

如果 sandbox 因网络失败，按权限流程重跑同一命令并说明需要安装 npm 依赖。

- [ ] **Step 3: 验证依赖可导入**

Run:

```bash
cd sidecar && bun -e 'import { createOpenAICompatible } from "@ai-sdk/openai-compatible"; import { streamText } from "ai"; console.log(typeof createOpenAICompatible, typeof streamText);'
```

Expected: 输出 `function function`。

更新 **Execution Progress**：Task 5 -> `done`，记录安装结果。

## Task 6: OpenAI Provider Text Streaming

**Files:**
- Create: `sidecar/src/agui/provider-openai/provider.ts`
- Create: `sidecar/src/agui/provider-openai/bridge.ts`
- Create: `sidecar/src/agui/provider-openai/error-map.ts`
- Create: `sidecar/src/agui/provider-openai/provider.test.ts`
- Create: `sidecar/src/agui/provider-openai/bridge.test.ts`
- Create: `sidecar/src/agui/provider-openai/index.ts`

- [ ] **Step 1: 写 provider 行为测试**

创建 `sidecar/src/agui/provider-openai/provider.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createOpenAICompatibleProvider } from "./provider";

describe("createOpenAICompatibleProvider", () => {
  it("does not support pending interrupts or file rewind", async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.1",
      streamTextImpl: (() => {
        throw new Error("not called");
      }) as never,
    });

    expect(await provider.getPendingInterrupts("thread", "run")).toEqual([]);
    expect(await provider.rewindFiles?.({
      threadId: "thread",
      cwd: "/tmp",
      checkpointUuid: "uuid",
    })).toEqual({ canRewind: false, error: "unsupported" });
  });

  it("resume returns RUN_ERROR because OpenAI runtime has no HITL interrupt", async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.1",
      streamTextImpl: (() => {
        throw new Error("not called");
      }) as never,
    });

    const events = [];
    for await (const event of provider.resume({
      threadId: "thread",
      runId: "run",
      resumePayload: {},
      abortSignal: new AbortController().signal,
      cwd: "/tmp",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: EventType.RUN_STARTED, threadId: "thread", runId: "run" },
      {
        type: EventType.RUN_ERROR,
        code: "EXECUTION_ERROR",
        message: "OpenAI-compatible runtime has no pending interrupt to resume.",
      },
    ]);
  });
});
```

- [ ] **Step 2: 写 bridge 流式测试**

创建 `sidecar/src/agui/provider-openai/bridge.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { streamOpenAITextToAgui } from "./bridge";

async function* textStream(parts: string[]) {
  for (const part of parts) yield part;
}

describe("streamOpenAITextToAgui", () => {
  it("emits AGUI text events and calls callbacks", async () => {
    const ended: Array<{ id: string; content: string }> = [];

    const events = [];
    for await (const event of streamOpenAITextToAgui({
      runId: "run",
      threadId: "thread",
      textStream: textStream(["你", "好"]),
      usage: Promise.resolve({
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
      }),
      model: "gpt-5.1",
      callbacks: {
        onMessageEnd: (msg) => ended.push({ id: msg.id, content: msg.content }),
        onRunUsage: (usage) => {
          expect(usage.inputTokens).toBe(3);
          expect(usage.outputTokens).toBe(2);
          expect(usage.model).toBe("gpt-5.1");
        },
      },
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(ended[0]?.content).toBe("你好");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-openai/provider.test.ts src/agui/provider-openai/bridge.test.ts
```

Expected: FAIL，provider-openai 文件不存在。

- [ ] **Step 4: 实现错误映射**

创建 `sidecar/src/agui/provider-openai/error-map.ts`：

```ts
export type OpenAIRunErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMIT"
  | "UPSTREAM_5XX"
  | "MODEL_ERROR"
  | "EXECUTION_ERROR"
  | "CANCELLED";

export function mapOpenAIError(err: unknown): {
  code: OpenAIRunErrorCode;
  message: string;
} {
  if (err instanceof Error && err.name === "AbortError") {
    return { code: "CANCELLED", message: err.message || "cancelled" };
  }

  const maybe = err as {
    status?: number;
    message?: string;
    error?: { message?: string };
  };
  const status = maybe?.status;
  const message =
    maybe?.error?.message ??
    maybe?.message ??
    (err instanceof Error ? err.message : String(err));

  if (status === 401 || status === 403) return { code: "AUTH_FAILED", message };
  if (status === 429) return { code: "RATE_LIMIT", message };
  if (typeof status === "number" && status >= 500) {
    return { code: "UPSTREAM_5XX", message };
  }
  if (typeof status === "number" && status >= 400) {
    return { code: "MODEL_ERROR", message };
  }
  return { code: "EXECUTION_ERROR", message };
}
```

- [ ] **Step 5: 实现 bridge**

创建 `sidecar/src/agui/provider-openai/bridge.ts`：

```ts
import { EventType } from "@ag-ui/core";
import { nanoid } from "nanoid";
import type { AGUIEvent, ProviderCallbacks } from "../core";
import { mapOpenAIError } from "./error-map";

export interface OpenAIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface StreamOpenAITextInput {
  runId: string;
  threadId: string;
  textStream: AsyncIterable<string>;
  usage?: Promise<OpenAIUsage | undefined>;
  model?: string;
  callbacks?: ProviderCallbacks;
}

export async function* streamOpenAITextToAgui(
  input: StreamOpenAITextInput,
): AsyncIterable<AGUIEvent> {
  const { runId, threadId, textStream, callbacks, model } = input;
  yield { type: EventType.RUN_STARTED, threadId, runId } as AGUIEvent;

  const messageId = `msg_${nanoid(10)}`;
  let started = false;
  let content = "";

  try {
    for await (const delta of textStream) {
      if (!started) {
        started = true;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        } as AGUIEvent;
      }
      content += delta;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      } as AGUIEvent;
    }

    if (started) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
      await callbacks?.onMessageEnd?.({
        id: messageId,
        content,
        phase: "conclusion",
      });
    }

    const usage = await input.usage?.catch(() => undefined);
    await callbacks?.onRunUsage?.({
      runId,
      threadId,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      permissionDenials: [],
      model,
    });

    yield { type: EventType.RUN_FINISHED, threadId, runId } as AGUIEvent;
  } catch (err) {
    if (started) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
    }
    const mapped = mapOpenAIError(err);
    yield {
      type: EventType.RUN_ERROR,
      code: mapped.code,
      message: mapped.message,
    } as AGUIEvent;
  }
}
```

- [ ] **Step 6: 实现 provider**

创建 `sidecar/src/agui/provider-openai/provider.ts`：

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { EventType } from "@ag-ui/core";
import type { AgentProvider, AGUIEvent, RunContext, ResumeContext } from "../core";
import { streamOpenAITextToAgui } from "./bridge";

export interface OpenAICompatibleProviderOptions {
  apiKey: string;
  baseUrl: string;
  model?: string;
  streamTextImpl?: typeof streamText;
}

export function createOpenAICompatibleProvider(
  opts: OpenAICompatibleProviderOptions,
): AgentProvider {
  const streamTextImpl = opts.streamTextImpl ?? streamText;
  const provider = createOpenAICompatible({
    name: "agent-studio-openai-compatible",
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl,
  });

  function resolveModel(ctxModel?: string): string {
    const model = ctxModel ?? opts.model;
    if (!model) throw new Error("model_missing");
    return model;
  }

  return {
    name: "openai-compatible",
    async *run(ctx: RunContext): AsyncIterable<AGUIEvent> {
      const modelId = resolveModel(ctx.model);
      const result = streamTextImpl({
        model: provider.chatModel(modelId),
        prompt: ctx.userMessage.content,
        abortSignal: ctx.abortSignal,
      });

      yield* streamOpenAITextToAgui({
        runId: ctx.runId,
        threadId: ctx.threadId,
        textStream: result.textStream,
        usage: result.usage,
        model: modelId,
        callbacks: ctx.callbacks,
      });
    },
    async *resume(ctx: ResumeContext): AsyncIterable<AGUIEvent> {
      yield { type: EventType.RUN_STARTED, threadId: ctx.threadId, runId: ctx.runId } as AGUIEvent;
      yield {
        type: EventType.RUN_ERROR,
        code: "EXECUTION_ERROR",
        message: "OpenAI-compatible runtime has no pending interrupt to resume.",
      } as AGUIEvent;
    },
    async getPendingInterrupts() {
      return [];
    },
    async notifyCancelled() {
      return;
    },
    async rewindFiles() {
      return { canRewind: false, error: "unsupported" };
    },
  };
}
```

创建 `sidecar/src/agui/provider-openai/index.ts`：

```ts
export { createOpenAICompatibleProvider } from "./provider";
export type { OpenAICompatibleProviderOptions } from "./provider";
```

- [ ] **Step 7: 运行 OpenAI provider 测试**

Run:

```bash
cd sidecar && bun test src/agui/provider-openai/provider.test.ts src/agui/provider-openai/bridge.test.ts
```

Expected: PASS。

更新 **Execution Progress**：Task 6 -> `done`，记录测试结果。

## Task 7: OpenAI Provider Integration Path

**Files:**
- Modify: `sidecar/src/agui/provider-factory.ts`
- Modify: `sidecar/src/agui/provider-factory.test.ts`
- Modify: `sidecar/src/server.ts`
- Modify: `sidecar/src/routes/settings-provider.test.ts`

- [ ] **Step 1: 跑 factory 测试**

Run:

```bash
cd sidecar && bun test src/agui/provider-factory.test.ts
```

Expected: PASS。如果失败，按错误修正 factory import 或 provider constructor。

- [ ] **Step 2: 写 settings route runtime metadata 测试**

在 `sidecar/src/routes/settings-provider.test.ts` 增加：

```ts
it("returns agent runtime metadata for SiliconFlow and OpenAI providers", async () => {
  const { app } = setup();

  const saveSf = await app.request("/settings/provider", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profileId: "siliconflow-cn",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sf-key",
    }),
  });
  expect(saveSf.status).toBe(200);

  const sfBody = await (await app.request("/settings/provider")).json() as {
    current: { agentRuntime: { protocol: string; baseUrl?: string; auth?: string } };
  };
  expect(sfBody.current.agentRuntime).toMatchObject({
    protocol: "anthropic",
    baseUrl: "https://api.siliconflow.cn",
    auth: "bearer",
  });

  const saveOpenAI = await app.request("/settings/provider", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profileId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
    }),
  });
  expect(saveOpenAI.status).toBe(200);

  const openaiBody = await (await app.request("/settings/provider")).json() as {
    current: { agentRuntime: { protocol: string; baseUrl?: string; auth?: string } };
  };
  expect(openaiBody.current.agentRuntime).toMatchObject({
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
  });
});
```

- [ ] **Step 3: 运行 route 测试**

Run:

```bash
cd sidecar && bun test src/routes/settings-provider.test.ts
```

Expected: PASS。

- [ ] **Step 4: 确认 server provider cache key 覆盖 runtime 差异**

在 `sidecar/src/server.ts` 找到 provider cache key 逻辑。若当前只按 `(apiKey, baseUrl)` 缓存，改成：

```ts
const providerCacheKey = JSON.stringify({
  protocol: current.agentRuntime.protocol,
  baseUrl:
    current.agentRuntime.protocol === "unsupported"
      ? ""
      : current.agentRuntime.baseUrl,
  auth:
    current.agentRuntime.protocol === "unsupported"
      ? ""
      : current.agentRuntime.auth,
  apiKey: current.apiKey,
});
```

并用 `providerCacheKey` 判断是否复用 provider。

- [ ] **Step 5: 运行 integration targeted tests**

Run:

```bash
cd sidecar && bun test \
  src/agui/provider-factory.test.ts \
  src/routes/settings-provider.test.ts \
  src/routes/runs.test.ts
```

Expected: PASS。

更新 **Execution Progress**：Task 7 -> `done`，记录测试结果。

## Task 8: Frontend Runtime Status

**Files:**
- Modify: `src/lib/data/settings.ts`
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Modify: `src/features/settings/sections/ModelSection.test.tsx`
- Modify: `src/i18n/locales/zh/settings.json`
- Modify: `src/i18n/locales/en/settings.json`

- [ ] **Step 1: 写失败测试验证 runtime 文案**

在 `src/features/settings/sections/ModelSection.test.tsx` 增加 SiliconFlow 场景：

```tsx
it("shows Anthropic runtime support for SiliconFlow", async () => {
  mockProvider({
    current: {
      profileId: "siliconflow-cn",
      label: "SiliconFlow China",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sf-key",
      models: [{ id: "deepseek-ai/DeepSeek-V3.2", displayName: "DeepSeek V3.2", description: "Remote model" }],
      remoteModelsFetchedAt: "2026-06-05T01:47:12.552Z",
      selectedModelId: "deepseek-ai/DeepSeek-V3.2",
      supportsRemoteModels: true,
      compatibilityNote: "Uses SiliconFlow's Anthropic-compatible Messages endpoint.",
      agentRuntime: {
        protocol: "anthropic",
        baseUrl: "https://api.siliconflow.cn",
        auth: "bearer",
        capabilities: { text: true, tools: true, fileCheckpoint: true },
      },
    },
    builtIn: [],
  });

  render(<ModelSection />);

  expect(await screen.findByText(/Agent runtime/i)).toBeInTheDocument();
  expect(screen.getByText(/Anthropic-compatible/i)).toBeInTheDocument();
});
```

增加 OpenAI-compatible 场景：

```tsx
it("shows OpenAI-compatible runtime limitations", async () => {
  mockProvider({
    current: {
      profileId: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      models: [{ id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" }],
      remoteModelsFetchedAt: "",
      selectedModelId: "gpt-5.1",
      supportsRemoteModels: true,
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
    builtIn: [],
  });

  render(<ModelSection />);

  expect(await screen.findByText(/Agent runtime/i)).toBeInTheDocument();
  expect(screen.getByText(/OpenAI-compatible/i)).toBeInTheDocument();
  expect(screen.getByText(/text only/i)).toBeInTheDocument();
});
```

如果现有测试 helper 名称不是 `mockProvider`，按文件内已有 helper 改写，但断言语义保持一致。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: FAIL，类型缺少 `agentRuntime` 或 UI 未显示文案。

- [ ] **Step 3: 扩展前端 settings 类型**

在 `src/lib/data/settings.ts` 增加：

```ts
export interface AgentRuntimeCapabilities {
  text: boolean;
  tools: boolean;
  fileCheckpoint: boolean;
}

export type AgentRuntime =
  | {
      protocol: "anthropic";
      baseUrl: string;
      auth: "x-api-key" | "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "openai-compatible";
      baseUrl: string;
      auth: "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "unsupported";
      reason: string;
      capabilities: AgentRuntimeCapabilities;
    };
```

在 `ProviderConfig` 和 `BuiltInProfile` 增加：

```ts
agentRuntime: AgentRuntime;
```

- [ ] **Step 4: 增加 i18n 文案**

在 `src/i18n/locales/zh/settings.json` 的 provider 文案块加入：

```json
"runtimeLabel": "Agent runtime",
"runtimeAnthropic": "Anthropic-compatible",
"runtimeOpenAI": "OpenAI-compatible",
"runtimeTextOnly": "文本流可用；工具调用和文件回滚暂未接入。",
"runtimeUnsupported": "Agent runtime 暂未接入",
"runtimeBaseUrl": "运行时 Base URL：{{baseUrl}}"
```

在 `src/i18n/locales/en/settings.json` 对应位置加入：

```json
"runtimeLabel": "Agent runtime",
"runtimeAnthropic": "Anthropic-compatible",
"runtimeOpenAI": "OpenAI-compatible",
"runtimeTextOnly": "Text streaming is available; tool calls and file rewind are not connected yet.",
"runtimeUnsupported": "Agent runtime not implemented",
"runtimeBaseUrl": "Runtime Base URL: {{baseUrl}}"
```

- [ ] **Step 5: 在 `ModelSection.tsx` 渲染 runtime 状态**

在 provider/base URL 或 compatibility note 附近加入：

```tsx
{provider?.current.agentRuntime ? (
  <div className="rounded-md border border-border-100 bg-bg-50 px-3 py-2 text-sm text-text-200">
    <div className="font-medium text-text-100">
      {t("settings.provider.runtimeLabel")}
    </div>
    {provider.current.agentRuntime.protocol === "anthropic" ? (
      <div>
        {t("settings.provider.runtimeAnthropic")}
        <span className="block text-text-300">
          {t("settings.provider.runtimeBaseUrl", {
            baseUrl: provider.current.agentRuntime.baseUrl,
          })}
        </span>
      </div>
    ) : provider.current.agentRuntime.protocol === "openai-compatible" ? (
      <div>
        {t("settings.provider.runtimeOpenAI")}
        <span className="block text-text-300">
          {t("settings.provider.runtimeTextOnly")}
        </span>
      </div>
    ) : (
      <div>
        {t("settings.provider.runtimeUnsupported")}
        <span className="block text-text-300">
          {provider.current.agentRuntime.reason}
        </span>
      </div>
    )}
  </div>
) : null}
```

如果当前文件使用不同 token/class pattern，沿用既有 `ModelSection.tsx` 的相邻提示样式，不引入新颜色。

- [ ] **Step 6: 运行前端测试**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: PASS。

更新 **Execution Progress**：Task 8 -> `done`，记录测试结果。

## Task 9: Verification And Smoke Checks

**Files:**
- No code files unless preceding tests reveal a specific defect.

- [ ] **Step 1: 运行 sidecar targeted tests**

Run:

```bash
cd sidecar && bun test \
  src/lib/providerProfiles.test.ts \
  src/services/providerSettings.test.ts \
  src/agui/provider-claude/provider-env.test.ts \
  src/agui/provider-openai/provider.test.ts \
  src/agui/provider-openai/bridge.test.ts \
  src/agui/provider-factory.test.ts \
  src/routes/settings-provider.test.ts
```

Expected: PASS。

- [ ] **Step 2: 运行前端 targeted tests**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: PASS。

- [ ] **Step 3: 运行 typecheck**

Run:

```bash
cd sidecar && bunx tsc --noEmit
```

Expected: PASS。

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS。

- [ ] **Step 4: 手工 smoke SiliconFlow Claude-compatible runtime**

在 Tauri dev app 中确认：

1. 设置页选择 `SiliconFlow China`。
2. Base URL 保持 `https://api.siliconflow.cn/v1`。
3. API key 填 SiliconFlow key。
4. 刷新模型成功，选择支持 Messages 的模型，例如 `deepseek-ai/DeepSeek-V3.2`。
5. 设置页显示 `Agent runtime: Anthropic-compatible`，运行时 Base URL 为 `https://api.siliconflow.cn`。
6. 新建一次简单对话，观察不再出现 `错误：stream error`。

- [ ] **Step 5: 手工 smoke OpenAI-compatible text runtime**

在 Tauri dev app 中确认：

1. 设置页选择 `OpenAI` 或一个 OpenAI-compatible provider。
2. API key 填对应 provider key。
3. 刷新模型成功并选择文本模型。
4. 设置页显示 `Agent runtime: OpenAI-compatible` 和 text-only 限制提示。
5. 新建一次简单对话，观察有流式文本输出。
6. 不测试文件编辑、Bash、Read/Edit/Write 工具；第一版明确不支持。

- [ ] **Step 6: 若 smoke 失败，查真实 RUN_ERROR**

Run:

```bash
cd sidecar && bun -e 'import { Database } from "bun:sqlite"; const db=new Database("/Users/wisen/Library/Application Support/com.ugreen.agent-studio/agent-studio.db", {readonly:true}); console.log(db.query("select run_id, seq, type, payload from run_events order by created_at desc, seq desc limit 10").all());'
```

Expected: 如果失败，`RUN_ERROR.payload` 应包含比 `stream error` 更具体的信息。根据 payload 再回到 provider bridge、error-map 或 SDK env 配置定位。

更新 **Execution Progress**：Task 9 -> `done` 或 `blocked`，记录全部验证结果。

## Self-Review

- Spec coverage: 本计划覆盖 SiliconFlow Claude-compatible runtime 修复、provider runtime metadata 抽象、OpenAI-compatible runtime 第一版、factory 切换、settings UI 状态、测试、typecheck 和 smoke 验证。
- Scope clarity: OpenAI-compatible 第一版只做 text streaming，不承诺 Claude Code 工具、HITL、checkpoint rewind 和 provider resume；这些能力明确留到后续版本。
- Progress tracking: 文档顶部有 `Execution Progress`，后续执行必须实时更新状态和验证结果。
- Placeholder scan: 没有 `TBD`、`TODO` 或未定义路径；每个代码任务都给出具体文件、代码形状和命令。
- Type consistency: 后端和前端均使用 `AgentRuntime`，字段为 `protocol/baseUrl/auth/capabilities/reason`；Claude provider 使用 `authMode`，OpenAI provider 使用 `baseUrl/apiKey/model`。

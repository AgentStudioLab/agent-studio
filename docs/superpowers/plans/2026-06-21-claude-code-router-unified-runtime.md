# Claude Code Router 统一 Runtime 实施计划

> **给 agentic workers：** 必须使用子技能：推荐 `superpowers:subagent-driven-development`，或使用 `superpowers:executing-plans` 按任务执行。所有步骤使用 checkbox（`- [ ]`）追踪。

**目标：** 让用户配置的 OpenAI-compatible 模型也通过 Claude Agent SDK runtime 执行，并由 Agent Studio 托管的 Claude Code Router（CCR）转发到真实上游模型。

**架构：** 本计划只覆盖已批准设计文档的 Phase 0-2：CCR 依赖和 PoC 入口、CCR route/model key 抽象、sidecar 托管 CCR 的进程管理缝合点、provider runtime 收口。图片输入和语音转写是后续独立计划，不混入本次 runtime 收口。

**技术栈：** Bun test runner、Hono sidecar、SQLite-backed provider settings、`@anthropic-ai/claude-agent-sdk`、`@musistudio/claude-code-router`、TypeScript。

---

## 范围检查

设计文档包含三个相对独立的工作流：

1. 通过 CCR 统一 agent runtime。
2. 图片输入和结构化 run message parts。
3. 音频转写。

本计划只实现第 1 项。交付目标是：sidecar 长期只保留一条 agent runtime 主路径，即 `provider-claude` + CCR upstream routing。图片和音频必须在本计划完成并完成 CCR PoC 后，再分别写独立实施计划。

## 文件结构

新增文件：

- `sidecar/src/ccr/model-key.ts`：稳定生成和解析 CCR model key。
- `sidecar/src/ccr/model-key.test.ts`：model key 回归测试。
- `sidecar/src/ccr/routes.ts`：把 resolved provider selection 转成 Claude SDK + CCR runtime route。
- `sidecar/src/ccr/routes.test.ts`：Anthropic 与 OpenAI-compatible provider 的 route 测试。
- `sidecar/src/ccr/config.ts`：Agent Studio 内部 CCR 配置结构和日志脱敏 helper。
- `sidecar/src/ccr/config.test.ts`：配置生成与 API key 脱敏测试。
- `sidecar/src/ccr/manager.ts`：私有 CCR 实例的进程管理缝合层。
- `sidecar/src/ccr/manager.test.ts`：fake spawn 生命周期测试。
- `sidecar/src/ccr/spawn.ts`：私有 CCR config 写盘、CLI 路径解析/提取、真实进程启动 adapter。
- `sidecar/src/ccr/spawn.test.ts`：私有 HOME/config 写盘和 spawn 参数测试。
- `sidecar/src/ccr/index.ts`：CCR 模块导出入口。
- `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`：人工 PoC 矩阵和证据记录。

修改文件：

- `sidecar/package.json` 和实际变化的 lockfile：加入 `@musistudio/claude-code-router`。
- `sidecar/src/lib/providerProfiles.ts`：调整 OpenAI-compatible profile 的 runtime 文案，不再描述为 text-only runtime adapter。
- `sidecar/src/services/providerSettings.ts`：让 OpenAI-compatible selection 解析为 CCR-routed Claude SDK runtime。
- `sidecar/src/agui/provider-factory.ts`：移除 OpenAI provider 创建逻辑，只保留 Claude SDK runtime。
- `sidecar/src/agui/provider-factory.test.ts`：替换 OpenAI runtime 测试。
- `sidecar/src/server.ts`：初始化 CCR manager，并把 CCR route 纳入 provider cache/build 路径。
- `sidecar/src/agui/provider-openai/*`：PoC gate 通过后删除。

本计划不改前端 UI，除非 TypeScript shared type 被迫联动。设置页文案、能力 badge 属于后续 UX 计划。

---

### Task 1：固定 CCR 依赖并记录外部契约

**Files:**
- Modify: `sidecar/package.json`
- Modify: 实际变化的 Bun lockfile
- Create: `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`

- [ ] **Step 1：确认 NPM 包名和 CLI**

Run:

```bash
npm view @musistudio/claude-code-router name version bin --json
```

Expected:

```json
{
  "name": "@musistudio/claude-code-router",
  "version": "2.0.0",
  "bin": {
    "ccr": "dist/cli.js"
  }
}
```

- [ ] **Step 2：添加依赖**

Run:

```bash
cd sidecar && bun add @musistudio/claude-code-router@2.0.0
```

Expected:

```text
installed @musistudio/claude-code-router@2.0.0
```

如果 Bun 输出不同，只要确认 `sidecar/package.json` 包含：

```json
"@musistudio/claude-code-router": "2.0.0"
```

- [ ] **Step 3：探测 CLI，不启动长驻服务**

Run:

```bash
cd sidecar && bunx ccr --help
```

Expected:

```text
Usage:
```

CCR 的 help 细节可能随版本变化。记录用于启动 server、指定 config path、指定 port 的命令和参数。

- [ ] **Step 4：创建人工 PoC 文档**

Create `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`:

```markdown
# CCR Runtime PoC 记录

日期：2026-06-21

## Package

- Package: `@musistudio/claude-code-router`
- Agent Studio 固定版本：`2.0.0`
- CLI binary：`ccr`

## CLI Probe

记录以下命令的完整输出：

```bash
cd sidecar && bunx ccr --help
```

## 必须确认的问题

删除 `provider-openai` 前必须确认：

- 哪个命令可以用私有 config 文件启动 CCR。
- 哪些 config 字段定义 providers、model aliases、transformers、router defaults。
- 单个 Claude SDK request 能否通过 `options.model` 指定具体 upstream model，且不需要重启 CCR。
- CCR 是否支持本地 router API key，同时 upstream API key 留在私有 config 或 env 中。

## PoC 矩阵

| 项 | 结果 | 证据 |
|---|---|---|
| Text streaming | Not run |  |
| Read/Bash/Edit tool calls | Not run |  |
| HITL approve/deny | Not run |  |
| Session resume | Not run |  |
| Regenerate | Not run |  |
| File checkpoint rewind | Not run |  |
| Run-scoped model selection | Not run |  |
| Usage | Not run |  |
| Cancel | Not run |  |
| Error mapping | Not run |  |
```

- [ ] **Step 5：运行 sidecar 测试**

Run:

```bash
cd sidecar && bun test
```

Expected:

```text
0 fail
```

- [ ] **Step 6：提交**

```bash
git add sidecar/package.json bun.lock sidecar/bun.lock docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md
git commit -m "chore: add claude code router dependency"
```

只 add 实际变化的 lockfile。

---

### Task 2：新增稳定的 CCR Model Key

**Files:**
- Create: `sidecar/src/ccr/model-key.ts`
- Create: `sidecar/src/ccr/model-key.test.ts`

- [ ] **Step 1：先写失败测试**

Create `sidecar/src/ccr/model-key.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  buildCcrModelKey,
  parseCcrModelKey,
  sanitizeCcrSegment,
} from "./model-key";

describe("CCR model keys", () => {
  it("builds stable route keys from provider and model ids", () => {
    expect(
      buildCcrModelKey({
        providerId: "conn_openai_main",
        modelId: "gpt-5.1",
      }),
    ).toBe("agentstudio/conn_openai_main/gpt-5.1");
  });

  it("escapes slashes and whitespace without depending on display names", () => {
    expect(
      buildCcrModelKey({
        providerId: "Open Router",
        modelId: "openai/gpt-5.1",
      }),
    ).toBe("agentstudio/Open%20Router/openai%2Fgpt-5.1");
  });

  it("round trips generated keys", () => {
    const key = buildCcrModelKey({
      providerId: "conn one",
      modelId: "vendor/model",
    });
    expect(parseCcrModelKey(key)).toEqual({
      providerId: "conn one",
      modelId: "vendor/model",
    });
  });

  it("rejects non-Agent-Studio keys", () => {
    expect(parseCcrModelKey("gpt-5.1")).toBeNull();
    expect(parseCcrModelKey("agentstudio/only-provider")).toBeNull();
  });

  it("rejects empty segments before encoding", () => {
    expect(() => sanitizeCcrSegment("")).toThrow("ccr_model_key_empty_segment");
    expect(() => buildCcrModelKey({ providerId: "p", modelId: "" })).toThrow(
      "ccr_model_key_empty_segment",
    );
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/model-key.test.ts
```

Expected:

```text
error: Cannot find module './model-key'
```

- [ ] **Step 3：实现 helper**

Create `sidecar/src/ccr/model-key.ts`:

```ts
export const CCR_MODEL_KEY_PREFIX = "agentstudio";

export interface CcrModelKeyInput {
  providerId: string;
  modelId: string;
}

export function sanitizeCcrSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("ccr_model_key_empty_segment");
  return encodeURIComponent(trimmed);
}

export function buildCcrModelKey(input: CcrModelKeyInput): string {
  return [
    CCR_MODEL_KEY_PREFIX,
    sanitizeCcrSegment(input.providerId),
    sanitizeCcrSegment(input.modelId),
  ].join("/");
}

export function parseCcrModelKey(
  value: string,
): CcrModelKeyInput | null {
  const parts = value.split("/");
  if (parts.length !== 3 || parts[0] !== CCR_MODEL_KEY_PREFIX) return null;
  const providerId = decodeURIComponent(parts[1] ?? "").trim();
  const modelId = decodeURIComponent(parts[2] ?? "").trim();
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}
```

- [ ] **Step 4：运行测试确认通过**

Run:

```bash
cd sidecar && bun test src/ccr/model-key.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 5：提交**

```bash
git add sidecar/src/ccr/model-key.ts sidecar/src/ccr/model-key.test.ts
git commit -m "feat: add ccr model key helpers"
```

---

### Task 3：新增 Claude SDK 经 CCR 的 Route 类型

**Files:**
- Create: `sidecar/src/ccr/routes.ts`
- Create: `sidecar/src/ccr/routes.test.ts`
- Create: `sidecar/src/ccr/index.ts`

- [ ] **Step 1：写 route 解析测试**

Create `sidecar/src/ccr/routes.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { ResolvedProviderForRun } from "../services/providerSettings";
import { resolveCcrRuntimeRoute } from "./routes";

function provider(
  overrides: Partial<ResolvedProviderForRun>,
): ResolvedProviderForRun {
  return {
    presetId: "preset_1",
    presetName: "Preset",
    providerId: "conn_1",
    providerName: "OpenAI",
    managed: false,
    profileId: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-openai",
    customProtocol: "openai-compatible",
    models: [{ id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" }],
    remoteModelsFetchedAt: "",
    selectedModelId: null,
    modelId: "gpt-5.1",
    supportsRemoteModels: true,
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
    ...overrides,
  };
}

describe("resolveCcrRuntimeRoute", () => {
  it("routes OpenAI-compatible providers through CCR using a stable model key", () => {
    const route = resolveCcrRuntimeRoute(provider({}));

    expect(route).toEqual({
      runtime: "claude-agent-sdk",
      gateway: "claude-code-router",
      baseUrl: "http://127.0.0.1:3456",
      authMode: "x-api-key",
      apiKey: "agent-studio-ccr",
      model: "agentstudio/conn_1/gpt-5.1",
      upstream: {
        providerId: "conn_1",
        providerName: "OpenAI",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai",
        modelId: "gpt-5.1",
      },
    });
  });

  it("routes Anthropic providers through CCR by default", () => {
    const route = resolveCcrRuntimeRoute(
      provider({
        providerId: "conn_anthropic",
        providerName: "Anthropic",
        profileId: "anthropic",
        label: "Anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant",
        customProtocol: "anthropic",
        modelId: "claude-sonnet-4-6",
        agentRuntime: {
          protocol: "anthropic",
          baseUrl: "https://api.anthropic.com",
          auth: "x-api-key",
          capabilities: { text: true, tools: true, fileCheckpoint: true },
        },
      }),
    );

    expect(route.model).toBe("agentstudio/conn_anthropic/claude-sonnet-4-6");
    expect(route.upstream.protocol).toBe("anthropic");
  });

  it("throws when a run has no resolved model", () => {
    expect(() => resolveCcrRuntimeRoute(provider({ modelId: null }))).toThrow(
      "ccr_model_missing",
    );
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/routes.test.ts
```

Expected:

```text
error: Cannot find module './routes'
```

- [ ] **Step 3：实现 route resolution**

Create `sidecar/src/ccr/routes.ts`:

```ts
import type {
  CustomProviderProtocol,
  ResolvedProviderForRun,
} from "../services/providerSettings";
import { buildCcrModelKey } from "./model-key";

export type CcrGatewayAuthMode = "x-api-key";
export type CcrRuntime = "claude-agent-sdk";
export type CcrGateway = "claude-code-router";
export type CcrUpstreamProtocol = CustomProviderProtocol;

export interface CcrUpstreamRoute {
  providerId: string;
  providerName: string;
  protocol: CcrUpstreamProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export interface CcrRuntimeRoute {
  runtime: CcrRuntime;
  gateway: CcrGateway;
  baseUrl: string;
  authMode: CcrGatewayAuthMode;
  apiKey: string;
  model: string;
  upstream: CcrUpstreamRoute;
}

export interface ResolveCcrRuntimeRouteOptions {
  baseUrl?: string;
  apiKey?: string;
}

export const DEFAULT_CCR_BASE_URL = "http://127.0.0.1:3456";
export const DEFAULT_CCR_API_KEY = "agent-studio-ccr";

function upstreamProtocol(provider: ResolvedProviderForRun): CcrUpstreamProtocol {
  if (provider.customProtocol) return provider.customProtocol;
  return provider.agentRuntime.protocol === "anthropic"
    ? "anthropic"
    : "openai-compatible";
}

export function resolveCcrRuntimeRoute(
  provider: ResolvedProviderForRun,
  options: ResolveCcrRuntimeRouteOptions = {},
): CcrRuntimeRoute {
  if (!provider.modelId) throw new Error("ccr_model_missing");
  return {
    runtime: "claude-agent-sdk",
    gateway: "claude-code-router",
    baseUrl: options.baseUrl ?? DEFAULT_CCR_BASE_URL,
    authMode: "x-api-key",
    apiKey: options.apiKey ?? DEFAULT_CCR_API_KEY,
    model: buildCcrModelKey({
      providerId: provider.providerId,
      modelId: provider.modelId,
    }),
    upstream: {
      providerId: provider.providerId,
      providerName: provider.providerName,
      protocol: upstreamProtocol(provider),
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: provider.modelId,
    },
  };
}
```

Create `sidecar/src/ccr/index.ts`:

```ts
export * from "./model-key";
export * from "./routes";
```

- [ ] **Step 4：运行 route 测试**

Run:

```bash
cd sidecar && bun test src/ccr/model-key.test.ts src/ccr/routes.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 5：提交**

```bash
git add sidecar/src/ccr/model-key.ts sidecar/src/ccr/model-key.test.ts sidecar/src/ccr/routes.ts sidecar/src/ccr/routes.test.ts sidecar/src/ccr/index.ts
git commit -m "feat: resolve ccr runtime routes"
```

---

### Task 4：新增内部 CCR Config Builder

**Files:**
- Create: `sidecar/src/ccr/config.ts`
- Create: `sidecar/src/ccr/config.test.ts`

- [ ] **Step 1：写 config builder 测试**

Create `sidecar/src/ccr/config.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { CcrRuntimeRoute } from "./routes";
import {
  buildAgentStudioCcrConfig,
  redactAgentStudioCcrConfig,
} from "./config";

const openaiRoute: CcrRuntimeRoute = {
  runtime: "claude-agent-sdk",
  gateway: "claude-code-router",
  baseUrl: "http://127.0.0.1:3456",
  authMode: "x-api-key",
  apiKey: "router-key",
  model: "agentstudio/conn_openai/gpt-5.1",
  upstream: {
    providerId: "conn_openai",
    providerName: "OpenAI Main",
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-openai",
    modelId: "gpt-5.1",
  },
};

describe("buildAgentStudioCcrConfig", () => {
  it("keeps one upstream per route model key", () => {
    const config = buildAgentStudioCcrConfig([openaiRoute]);
    expect(config.models).toEqual([
      {
        key: "agentstudio/conn_openai/gpt-5.1",
        providerId: "conn_openai",
        providerName: "OpenAI Main",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai",
        modelId: "gpt-5.1",
      },
    ]);
  });

  it("deduplicates by model key and keeps the later route", () => {
    const next = {
      ...openaiRoute,
      upstream: { ...openaiRoute.upstream, apiKey: "sk-new" },
    };
    const config = buildAgentStudioCcrConfig([openaiRoute, next]);
    expect(config.models).toHaveLength(1);
    expect(config.models[0]?.apiKey).toBe("sk-new");
  });

  it("redacts API keys for logs", () => {
    const config = buildAgentStudioCcrConfig([openaiRoute]);
    expect(redactAgentStudioCcrConfig(config).models[0]?.apiKey).toBe("sk-...enai");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/config.test.ts
```

Expected:

```text
error: Cannot find module './config'
```

- [ ] **Step 3：实现内部 config**

Create `sidecar/src/ccr/config.ts`:

```ts
import type { CcrRuntimeRoute, CcrUpstreamProtocol } from "./routes";

export interface AgentStudioCcrModel {
  key: string;
  providerId: string;
  providerName: string;
  protocol: CcrUpstreamProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export interface AgentStudioCcrConfig {
  models: AgentStudioCcrModel[];
}

export function buildAgentStudioCcrConfig(
  routes: CcrRuntimeRoute[],
): AgentStudioCcrConfig {
  const byKey = new Map<string, AgentStudioCcrModel>();
  for (const route of routes) {
    byKey.set(route.model, {
      key: route.model,
      providerId: route.upstream.providerId,
      providerName: route.upstream.providerName,
      protocol: route.upstream.protocol,
      baseUrl: route.upstream.baseUrl,
      apiKey: route.upstream.apiKey,
      modelId: route.upstream.modelId,
    });
  }
  return { models: [...byKey.values()] };
}

function redactKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

export function redactAgentStudioCcrConfig(
  config: AgentStudioCcrConfig,
): AgentStudioCcrConfig {
  return {
    models: config.models.map((model) => ({
      ...model,
      apiKey: redactKey(model.apiKey),
    })),
  };
}
```

Update `sidecar/src/ccr/index.ts`:

```ts
export * from "./config";
export * from "./model-key";
export * from "./routes";
```

- [ ] **Step 4：运行测试**

Run:

```bash
cd sidecar && bun test src/ccr/config.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 5：提交**

```bash
git add sidecar/src/ccr/config.ts sidecar/src/ccr/config.test.ts sidecar/src/ccr/index.ts
git commit -m "feat: build ccr route config"
```

---

### Task 5：新增 CCR Manager 缝合层和禁用模式

**Files:**
- Create: `sidecar/src/ccr/manager.ts`
- Create: `sidecar/src/ccr/manager.test.ts`
- Modify: `sidecar/src/ccr/index.ts`

- [ ] **Step 1：写生命周期测试**

Create `sidecar/src/ccr/manager.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  CcrManager,
  type CcrProcessHandle,
  type CcrSpawn,
} from "./manager";
import type { AgentStudioCcrConfig } from "./config";

function config(): AgentStudioCcrConfig {
  return {
    models: [
      {
        key: "agentstudio/conn/gpt-5.1",
        providerId: "conn",
        providerName: "OpenAI",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk",
        modelId: "gpt-5.1",
      },
    ],
  };
}

describe("CcrManager", () => {
  it("reports disabled without spawning", async () => {
    let calls = 0;
    const manager = new CcrManager({
      enabled: false,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn: async () => {
        calls += 1;
        throw new Error("should_not_spawn");
      },
    });

    await manager.ensure(config());

    expect(calls).toBe(0);
    expect(manager.status()).toEqual({
      enabled: false,
      running: false,
      baseUrl: "http://127.0.0.1:3456",
      error: "ccr_disabled",
    });
  });

  it("spawns once and reuses the running process", async () => {
    let calls = 0;
    const handle: CcrProcessHandle = { pid: 42, kill: () => true };
    const spawn: CcrSpawn = async () => {
      calls += 1;
      return handle;
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
    });

    await manager.ensure(config());
    await manager.ensure(config());

    expect(calls).toBe(1);
    expect(manager.status()).toEqual({
      enabled: true,
      running: true,
      baseUrl: "http://127.0.0.1:3456",
      pid: 42,
    });
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/manager.test.ts
```

Expected:

```text
error: Cannot find module './manager'
```

- [ ] **Step 3：实现 manager seam**

Create `sidecar/src/ccr/manager.ts`:

```ts
import type { AgentStudioCcrConfig } from "./config";

export interface CcrProcessHandle {
  pid?: number;
  kill: () => boolean;
}

export type CcrSpawn = (input: {
  port: number;
  configDir: string;
  config: AgentStudioCcrConfig;
}) => Promise<CcrProcessHandle>;

export interface CcrManagerOptions {
  enabled: boolean;
  port: number;
  configDir: string;
  spawn: CcrSpawn;
}

export interface CcrStatus {
  enabled: boolean;
  running: boolean;
  baseUrl: string;
  pid?: number;
  error?: string;
}

export class CcrManager {
  private handle: CcrProcessHandle | null = null;
  private error: string | undefined;

  constructor(private readonly options: CcrManagerOptions) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`;
  }

  async ensure(config: AgentStudioCcrConfig): Promise<void> {
    if (!this.options.enabled) {
      this.error = "ccr_disabled";
      return;
    }
    if (this.handle) return;
    try {
      this.handle = await this.options.spawn({
        port: this.options.port,
        configDir: this.options.configDir,
        config,
      });
      this.error = undefined;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  status(): CcrStatus {
    return {
      enabled: this.options.enabled,
      running: this.handle !== null,
      baseUrl: this.baseUrl(),
      ...(this.handle?.pid ? { pid: this.handle.pid } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  stop(): void {
    this.handle?.kill();
    this.handle = null;
  }
}
```

Update `sidecar/src/ccr/index.ts`:

```ts
export * from "./config";
export * from "./manager";
export * from "./model-key";
export * from "./routes";
```

- [ ] **Step 4：运行测试**

Run:

```bash
cd sidecar && bun test src/ccr/manager.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 5：提交**

```bash
git add sidecar/src/ccr/manager.ts sidecar/src/ccr/manager.test.ts sidecar/src/ccr/index.ts
git commit -m "feat: add ccr manager seam"
```

---

### Task 6：Provider Factory 只保留 Claude SDK Runtime

**Files:**
- Modify: `sidecar/src/agui/provider-factory.ts`
- Modify: `sidecar/src/agui/provider-factory.test.ts`

- [ ] **Step 1：替换 provider factory 测试**

Replace `sidecar/src/agui/provider-factory.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createAgentProviderForRuntime } from "./provider-factory";

describe("createAgentProviderForRuntime", () => {
  it("creates a Claude provider for Anthropic runtimes", () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        auth: "x-api-key",
        capabilities: { text: true, tools: true, fileCheckpoint: true },
      },
      apiKey: "anthropic-key",
      defaultModel: "claude-sonnet-4-6",
      common: {
        resolveAllowedTools: () => [],
      },
    });

    expect(provider.name).toBe("claude-agent-sdk");
  });

  it("rejects OpenAI-compatible runtimes after CCR convergence", () => {
    expect(() =>
      createAgentProviderForRuntime({
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
      }),
    ).toThrow("agent_runtime_not_supported");
  });
});
```

- [ ] **Step 2：运行测试确认当前行为失败**

Run:

```bash
cd sidecar && bun test src/agui/provider-factory.test.ts
```

Expected:

```text
FAIL
```

第二个测试应失败，因为当前 factory 仍会创建 `openai-compatible` provider。

- [ ] **Step 3：移除 OpenAI runtime creation**

Replace `sidecar/src/agui/provider-factory.ts`:

```ts
import type { AgentRuntime } from "../lib/providerProfiles";
import type { AgentProvider } from "./core";
import {
  createClaudeProvider,
  type ClaudeProviderOptions,
} from "./provider-claude";

export interface ProviderFactoryInput {
  runtime: AgentRuntime;
  apiKey: string;
  defaultModel?: string;
  common: Omit<
    ClaudeProviderOptions,
    "apiKey" | "baseUrl" | "authMode" | "model"
  >;
}

export function createAgentProviderForRuntime(
  input: ProviderFactoryInput,
): AgentProvider {
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

  throw new Error("agent_runtime_not_supported");
}
```

- [ ] **Step 4：运行测试**

Run:

```bash
cd sidecar && bun test src/agui/provider-factory.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 5：提交**

```bash
git add sidecar/src/agui/provider-factory.ts sidecar/src/agui/provider-factory.test.ts
git commit -m "refactor: restrict agent runtime factory to claude sdk"
```

---

### Task 7：把 OpenAI-compatible Selection 解析为 CCR-routed Claude Runtime

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`
- Modify: `sidecar/src/lib/providerProfiles.ts`
- Modify: `sidecar/src/lib/providerProfiles.test.ts`

- [ ] **Step 1：添加 provider settings 回归测试**

在 `sidecar/src/services/providerSettings.test.ts` 现有 describe 中追加测试。复用该文件已有 DB setup helper，只新增下面断言：

```ts
it("resolves OpenAI-compatible selections as CCR-routed Anthropic runtime", () => {
  const state = createProviderSettings(db, {});
  const conn = state.createConnection({
    name: "OpenAI Main",
    profileId: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-openai",
  });
  state.updateConnection(conn.providerId, {
    remoteModels: [
      { id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" },
    ],
    remoteModelsProviderId: "openai",
    remoteModelsBaseUrl: "https://api.openai.com/v1",
    remoteModelsFetchedAt: "2026-06-21T00:00:00.000Z",
  });
  state.setEnabledModels(conn.providerId, ["gpt-5.1"], "gpt-5.1");

  const resolved = state.resolveSelection({
    providerId: conn.providerId,
    modelId: "gpt-5.1",
  });

  expect(resolved.agentRuntime.protocol).toBe("anthropic");
  expect(resolved.agentRuntime.baseUrl).toBe("ccr://agent-studio");
  expect(resolved.modelId).toBe("gpt-5.1");
  expect(resolved.customProtocol).toBe("openai-compatible");
});
```

- [ ] **Step 2：运行目标测试确认失败**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected:

```text
FAIL
```

新断言应失败，因为当前 OpenAI-compatible selection 仍解析为 `protocol: "openai-compatible"`。

- [ ] **Step 3：在 provider settings 中加入 CCR runtime helper**

在 `sidecar/src/services/providerSettings.ts` capability constants 附近添加：

```ts
const CCR_FULL_CAPABILITIES = {
  text: true,
  tools: true,
  fileCheckpoint: true,
} satisfies AgentRuntime["capabilities"];

function ccrRoutedRuntime(): AgentRuntime {
  return {
    protocol: "anthropic",
    baseUrl: "ccr://agent-studio",
    auth: "x-api-key",
    capabilities: CCR_FULL_CAPABILITIES,
  };
}
```

在 `resolve(persisted: ProviderPreset)` 中，把 custom OpenAI-compatible branch 从：

```ts
{
  protocol: "openai-compatible",
  baseUrl: normalizeOpenAICompatibleBaseUrl(persisted.baseUrl),
  auth: "bearer",
  capabilities: OPENAI_TEXT_CAPABILITIES,
}
```

改为：

```ts
ccrRoutedRuntime()
```

在构造 resolved provider 的位置，把 OpenAI-compatible profile runtime 覆盖成：

```ts
const runtime =
  resolved.customProtocol === "openai-compatible" ||
  resolved.agentRuntime.protocol === "openai-compatible"
    ? ccrRoutedRuntime()
    : resolved.agentRuntime;
```

返回对象使用：

```ts
agentRuntime: runtime
```

不要改 persisted data，只改运行时 resolve 结果。

- [ ] **Step 4：更新 built-in profile 兼容性文案**

在 `sidecar/src/lib/providerProfiles.ts` 中，把：

```ts
const RUNTIME_COMPATIBILITY_NOTE =
  "OpenAI-compatible runtime currently supports text streaming only; tool calls and file rewind are not connected yet.";
```

替换为：

```ts
const RUNTIME_COMPATIBILITY_NOTE =
  "OpenAI-compatible providers run through Agent Studio's managed Claude Code Router so they can share the Claude Agent SDK runtime. Tool reliability still depends on the selected upstream model.";
```

- [ ] **Step 5：运行 provider settings/profile 测试**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts src/lib/providerProfiles.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 6：提交**

```bash
git add sidecar/src/services/providerSettings.ts sidecar/src/services/providerSettings.test.ts sidecar/src/lib/providerProfiles.ts sidecar/src/lib/providerProfiles.test.ts
git commit -m "feat: resolve openai providers through ccr runtime"
```

---

### Task 8：把 CCR Route 接入 Server Provider Creation

**Files:**
- Modify: `sidecar/src/server.ts`
- Modify: `sidecar/src/agui/provider-claude/provider-env.test.ts`

- [ ] **Step 1：新增 provider env 回归测试**

在 `sidecar/src/agui/provider-claude/provider-env.test.ts` 追加：

```ts
it("can target the managed CCR endpoint with a route model", () => {
  const env = buildClaudeProviderEnv(
    {
      ANTHROPIC_BASE_URL: "https://stale.example",
      ANTHROPIC_MODEL: "stale-model",
    },
    {
      apiKey: "router-key",
      baseUrl: "http://127.0.0.1:3456",
      authMode: "x-api-key",
      model: "agentstudio/conn_openai/gpt-5.1",
    },
  );

  expect(env.ANTHROPIC_API_KEY).toBe("router-key");
  expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:3456");
  expect(env.ANTHROPIC_MODEL).toBe("agentstudio/conn_openai/gpt-5.1");
});
```

- [ ] **Step 2：运行 env 测试**

Run:

```bash
cd sidecar && bun test src/agui/provider-claude/provider-env.test.ts
```

Expected:

```text
0 fail
```

这个测试可能已经通过；它锁定 server 接入 CCR 时应传给 Claude SDK 的 env 形状。

- [ ] **Step 3：修改 server provider creation**

在 `sidecar/src/server.ts` 添加 import：

```ts
import {
  buildAgentStudioCcrConfig,
  CcrManager,
  resolveCcrRuntimeRoute,
} from "./ccr";
```

在 `providerSettings` 创建后添加：

```ts
const ccrManager = new CcrManager({
  enabled: process.env.AGENT_STUDIO_DISABLE_CCR !== "1",
  port: Number.parseInt(process.env.AGENT_STUDIO_CCR_PORT ?? "3456", 10),
  configDir: path.join(path.dirname(dbAbs), "ccr"),
  spawn: async () => {
    throw new Error("ccr_spawn_not_implemented");
  },
});
```

把 `providerCacheKey` 从：

```ts
return `${resolved.providerId}:${resolved.modelId ?? ""}:${resolved.apiKey}:${resolved.baseUrl}`;
```

改为：

```ts
const route = resolved.providerId === "official" ? null : resolveCcrRuntimeRoute(resolved, {
  baseUrl: ccrManager.baseUrl(),
});
return route
  ? `${resolved.providerId}:${route.model}:${route.baseUrl}:${resolved.apiKey}:${resolved.baseUrl}`
  : `${resolved.providerId}:${resolved.modelId ?? ""}:${resolved.apiKey}:${resolved.baseUrl}`;
```

在 `buildProviderForSelection` 中，调用 `createAgentProviderForRuntime` 前加入：

```ts
const route = resolveCcrRuntimeRoute(current, { baseUrl: ccrManager.baseUrl() });
void ccrManager.ensure(buildAgentStudioCcrConfig([route])).catch((err) => {
  console.error("[ccr] ensure failed:", err);
});
```

把 provider factory 参数从：

```ts
runtime: current.agentRuntime,
apiKey: current.apiKey,
defaultModel: current.modelId ?? process.env.ANTHROPIC_MODEL,
```

改为：

```ts
runtime: {
  protocol: "anthropic",
  baseUrl: route.baseUrl,
  auth: route.authMode,
  capabilities: current.agentRuntime.capabilities,
},
apiKey: route.apiKey,
defaultModel: route.model,
```

- [ ] **Step 4：运行 sidecar typecheck**

Run:

```bash
cd sidecar && bunx tsc --noEmit
```

Expected:

```text
no output
```

如果 `tsc` 报 `auth` 类型不接受 `route.authMode`，确认 `sidecar/src/ccr/routes.ts` 中 `route.authMode` 是字面量类型 `"x-api-key"`。

- [ ] **Step 5：提交**

```bash
git add sidecar/src/server.ts sidecar/src/agui/provider-claude/provider-env.test.ts
git commit -m "feat: route server providers through managed ccr"
```

---

### Task 9：把 CCR Spawn Stub 改成显式契约

**Files:**
- Modify: `sidecar/src/ccr/manager.ts`
- Modify: `sidecar/src/ccr/manager.test.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1：扩展 manager 测试，锁定 spawn 输入**

在 `sidecar/src/ccr/manager.test.ts` 添加：

```ts
it("passes port, configDir, and config to the spawn adapter", async () => {
  const seen: unknown[] = [];
  const manager = new CcrManager({
    enabled: true,
    port: 4567,
    configDir: "/tmp/ccr-private",
    spawn: async (input) => {
      seen.push(input);
      return { pid: 99, kill: () => true };
    },
  });

  const cfg = config();
  await manager.ensure(cfg);

  expect(seen).toEqual([
    {
      port: 4567,
      configDir: "/tmp/ccr-private",
      config: cfg,
    },
  ]);
});
```

- [ ] **Step 2：运行 manager 测试**

Run:

```bash
cd sidecar && bun test src/ccr/manager.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 3：添加显式 spawn adapter**

在 `sidecar/src/ccr/manager.ts` 底部添加：

```ts
export const CCR_SPAWN_NOT_CONFIGURED: CcrSpawn = async () => {
  throw new Error("ccr_spawn_not_configured");
};
```

在 `sidecar/src/server.ts` 更新 import：

```ts
import {
  buildAgentStudioCcrConfig,
  CcrManager,
  CCR_SPAWN_NOT_CONFIGURED,
  resolveCcrRuntimeRoute,
} from "./ccr";
```

把 `spawn` 改为：

```ts
spawn: CCR_SPAWN_NOT_CONFIGURED,
```

这里先把 server 和 manager 的边界变成显式契约。真实 spawn adapter 在下一任务中实现，并且必须以 Task 1 的 CLI probe 结论为准。

- [ ] **Step 4：运行 CCR 测试和 typecheck**

Run:

```bash
cd sidecar && bun test src/ccr && bunx tsc --noEmit
```

Expected:

```text
0 fail
```

并且 `tsc` 无输出。

- [ ] **Step 5：提交**

```bash
git add sidecar/src/ccr/manager.ts sidecar/src/ccr/manager.test.ts sidecar/src/server.ts
git commit -m "chore: make ccr spawn contract explicit"
```

---

### Task 10：实现私有 CCR Config 写盘和真实 Spawn Adapter

**Files:**
- Create: `sidecar/src/ccr/spawn.ts`
- Create: `sidecar/src/ccr/spawn.test.ts`
- Modify: `sidecar/src/ccr/index.ts`
- Modify: `sidecar/src/server.ts`
- Modify: `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`

- [ ] **Step 1：记录 CCR 私有 config 约束**

把 Task 1 CLI probe 的结论补进 `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`：

```markdown
## 私有运行时约束

- `@musistudio/claude-code-router@2.0.0` 顶层 CLI 暴露 `ccr start`，未暴露稳定的 `--config` 参数。
- CCR 默认读取 `$HOME/.claude-code-router/config.json`。
- Agent Studio 托管 CCR 时必须设置隔离 `HOME`，把配置写到 `<configDir>/.claude-code-router/config.json`，避免污染用户真实 home。
- 配置必须包含 `PORT`、`HOST: "127.0.0.1"`、`APIKEY`、`NON_INTERACTIVE_MODE: true`、`Providers`、`Router`。
- 发布态 sidecar 是 `bun build --compile` 单二进制，不能假设存在 `node_modules/.bin/ccr`；必须验证 CCR CLI 文件可从依赖解析，或被提取/复制到真实磁盘路径后再 spawn。
```

- [ ] **Step 2：先写失败测试，锁定私有 config 写盘**

Create `sidecar/src/ccr/spawn.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  ccrPrivateConfigPath,
  ccrPrivateHome,
  writeCcrPrivateConfig,
} from "./spawn";
import type { AgentStudioCcrConfig } from "./config";

function config(): AgentStudioCcrConfig {
  return {
    APIKEY: "router-key",
    HOST: "127.0.0.1",
    PORT: 4567,
    LOG: false,
    NON_INTERACTIVE_MODE: true,
    Providers: [
      {
        name: "conn-openai",
        api_base_url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk-openai",
        models: ["gpt-5.1"],
      },
    ],
    Router: {
      default: "conn-openai,gpt-5.1",
    },
  };
}

describe("CCR spawn adapter", () => {
  it("writes config under an isolated CCR home", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    try {
      await writeCcrPrivateConfig({ configDir: dir, config: config() });

      expect(ccrPrivateHome(dir)).toBe(dir);
      expect(ccrPrivateConfigPath(dir)).toBe(
        path.join(dir, ".claude-code-router", "config.json"),
      );

      const raw = await readFile(ccrPrivateConfigPath(dir), "utf8");
      expect(JSON.parse(raw)).toEqual(config());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3：运行 spawn 测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/spawn.test.ts
```

Expected:

```text
FAIL
```

失败原因应是 `Cannot find module './spawn'`。

- [ ] **Step 4：实现私有 config 写盘 helper**

Create `sidecar/src/ccr/spawn.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentStudioCcrConfig } from "./config";

export function ccrPrivateHome(configDir: string): string {
  return configDir;
}

export function ccrPrivateConfigPath(configDir: string): string {
  return path.join(ccrPrivateHome(configDir), ".claude-code-router", "config.json");
}

export async function writeCcrPrivateConfig(input: {
  configDir: string;
  config: AgentStudioCcrConfig;
}): Promise<string> {
  const configPath = ccrPrivateConfigPath(input.configDir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(input.config, null, 2)}\n`, "utf8");
  return configPath;
}
```

- [ ] **Step 5：运行 spawn 写盘测试**

Run:

```bash
cd sidecar && bun test src/ccr/spawn.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 6：先写失败测试，锁定 spawn 参数**

在 `sidecar/src/ccr/spawn.test.ts` 追加：

```ts
import { spawnManagedCcr } from "./spawn";

it("spawns ccr start with isolated HOME and router env", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
  const calls: unknown[] = [];
  try {
    const handle = await spawnManagedCcr(
      {
        port: 4567,
        configDir: dir,
        config: config(),
      },
      {
        cliPath: "/private/ccr/dist/cli.js",
        spawnProcess: (command, args, options) => {
          calls.push({ command, args, options });
          return {
            pid: 123,
            kill: () => true,
            once: () => undefined,
            unref: () => undefined,
          };
        },
      },
    );

    expect(handle.pid).toBe(123);
    expect(calls).toEqual([
      {
        command: process.execPath,
        args: ["/private/ccr/dist/cli.js", "start"],
        options: expect.objectContaining({
          detached: true,
          stdio: "ignore",
          env: expect.objectContaining({
            HOME: dir,
            USERPROFILE: dir,
            CCR_PRIVATE_HOME: dir,
            CI: "true",
            FORCE_COLOR: "0",
          }),
        }),
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 7：运行 spawn 参数测试确认失败**

Run:

```bash
cd sidecar && bun test src/ccr/spawn.test.ts
```

Expected:

```text
FAIL
```

失败原因应是 `spawnManagedCcr` 未实现。

- [ ] **Step 8：实现真实 spawn adapter**

在 `sidecar/src/ccr/spawn.ts` 中加入：

```ts
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { CcrSpawn, CcrSpawnInput, CcrProcessHandle } from "./manager";

type SpawnProcess = typeof spawn;

const require = createRequire(import.meta.url);

export function resolveCcrCliPath(): string {
  return require.resolve("@musistudio/claude-code-router/dist/cli.js");
}

export async function spawnManagedCcr(
  input: CcrSpawnInput,
  options: {
    cliPath?: string;
    spawnProcess?: SpawnProcess;
  } = {},
): Promise<CcrProcessHandle> {
  await writeCcrPrivateConfig({
    configDir: input.configDir,
    config: {
      ...input.config,
      PORT: input.port,
      HOST: "127.0.0.1",
      NON_INTERACTIVE_MODE: true,
    },
  });

  const cliPath = options.cliPath ?? resolveCcrCliPath();
  const spawnProcess = options.spawnProcess ?? spawn;
  const child = spawnProcess(process.execPath, [cliPath, "start"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      HOME: ccrPrivateHome(input.configDir),
      USERPROFILE: ccrPrivateHome(input.configDir),
      CCR_PRIVATE_HOME: ccrPrivateHome(input.configDir),
      CI: "true",
      FORCE_COLOR: "0",
    },
  });

  child.unref();

  return {
    pid: child.pid ?? 0,
    kill: (signal) => child.kill(signal),
  };
}

export const CCR_SPAWN_MANAGED: CcrSpawn = spawnManagedCcr;
```

如果 `bunx tsc --noEmit` 报 `SpawnProcess` 类型不兼容，则把 `spawnProcess` 收窄为当前测试实际需要的函数签名，不要引入 `any`。

- [ ] **Step 9：导出并接入 server**

在 `sidecar/src/ccr/index.ts` 添加：

```ts
export * from "./spawn";
```

在 `sidecar/src/server.ts` 中把 import 改为：

```ts
import {
  buildAgentStudioCcrConfig,
  CcrManager,
  CCR_SPAWN_MANAGED,
  resolveCcrRuntimeRoute,
} from "./ccr";
```

把 `spawn` 从 `CCR_SPAWN_NOT_CONFIGURED` 改为：

```ts
spawn: CCR_SPAWN_MANAGED,
```

- [ ] **Step 10：运行 CCR 测试和 typecheck**

Run:

```bash
cd sidecar && bun test src/ccr && bunx tsc --noEmit
```

Expected:

```text
0 fail
```

并且 `tsc` 无输出。

- [ ] **Step 11：发布态阻断检查**

Run:

```bash
bun run build:sidecar -- --host-only
```

Expected:

```text
Built sidecar
```

如果编译后的 sidecar 无法解析或启动 CCR CLI，停止本任务并保留 `provider-openai`，不要进入删除 adapter 的任务。必须在 PoC 文档记录失败原因和下一步方案。

- [ ] **Step 12：提交**

```bash
git add sidecar/src/ccr/spawn.ts sidecar/src/ccr/spawn.test.ts sidecar/src/ccr/index.ts sidecar/src/server.ts docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md
git commit -m "feat: spawn managed claude code router"
```

---

### Task 11：PoC Gate 通过后删除 OpenAI Runtime Adapter

**Files:**
- Delete: `sidecar/src/agui/provider-openai/provider.ts`
- Delete: `sidecar/src/agui/provider-openai/provider.test.ts`
- Delete: `sidecar/src/agui/provider-openai/bridge.ts`
- Delete: `sidecar/src/agui/provider-openai/bridge.test.ts`
- Delete: `sidecar/src/agui/provider-openai/error-map.ts`
- Delete: `sidecar/src/agui/provider-openai/index.ts`
- Modify: `sidecar/package.json`
- Modify: 实际变化的 lockfile

- [ ] **Step 1：确认 PoC gate**

打开 `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`，确认以下行不是 `Not run`，并且有通过证据：

```text
Text streaming
Read/Bash/Edit tool calls
HITL approve/deny
Session resume
Regenerate
File checkpoint rewind
Run-scoped model selection
Cancel
Error mapping
```

如果任意核心行缺少证据或失败，停止本任务，保留 `provider-openai`。

- [ ] **Step 2：确认 OpenAI runtime import 已清理**

Run:

```bash
rg -n "provider-openai|createOpenAICompatibleProvider|openai-compatible\"" sidecar/src/agui sidecar/src -g '*.ts'
```

Expected:

```text
```

provider settings/profile 中出现 `openai-compatible` 仅允许表示 upstream protocol 或 model-list strategy，不能表示 runtime creation。

- [ ] **Step 3：删除 adapter 文件**

Run:

```bash
rm -rf sidecar/src/agui/provider-openai
```

- [ ] **Step 4：移除未使用 runtime 依赖**

Run:

```bash
cd sidecar && bun remove @ai-sdk/openai-compatible
```

如果 sidecar 已不再 import `ai`，也移除它。先验证：

```bash
rg -n "from \"ai\"|from 'ai'|@ai-sdk/openai-compatible" sidecar/src sidecar/package.json
```

Expected:

```text
```

若无任何 sidecar import，再运行：

```bash
cd sidecar && bun remove ai
```

- [ ] **Step 5：运行 sidecar 完整验证**

Run:

```bash
cd sidecar && bun test && bunx tsc --noEmit
```

Expected:

```text
0 fail
```

并且 `tsc` 无输出。

- [ ] **Step 6：提交**

```bash
git add sidecar/package.json bun.lock sidecar/bun.lock sidecar/src/agui sidecar/src
git commit -m "refactor: remove openai agent runtime adapter"
```

只 add 实际变化的 lockfile。

---

### Task 12：最终验证和文档更新

**Files:**
- Modify: `docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md`
- Modify: `docs/superpowers/specs/2026-06-21-claude-code-router-unified-runtime-design.md`

- [ ] **Step 1：更新 PoC 矩阵**

把每一行改成下面格式之一：

```markdown
| Text streaming | Pass | Command/log/screenshot path |
```

可用结果：`Pass`、`Fail`、`Provider limitation`。Task 11 Step 1 列出的核心 runtime 行不能保留 `Not run`。

- [ ] **Step 2：给 spec 追加实施说明**

Append to `docs/superpowers/specs/2026-06-21-claude-code-router-unified-runtime-design.md`:

```markdown
## Implementation Notes

Phase 0-2 are implemented by `docs/superpowers/plans/2026-06-21-claude-code-router-unified-runtime.md`.

The OpenAI-compatible runtime adapter is removed only after the PoC matrix confirms:

- Run-scoped model routing through CCR without restart.
- Claude Agent SDK tool/HITL/session/checkpoint behavior remains usable through CCR.
- The sidecar can report CCR disabled/unavailable as a diagnostic runtime error.

Image input and audio transcription remain separate follow-up workstreams.
```

- [ ] **Step 3：运行仓库验证**

Run:

```bash
bun test
cd sidecar && bun test && bunx tsc --noEmit
```

Expected:

```text
0 fail
```

并且 `tsc` 无输出。

- [ ] **Step 4：检查最终 diff**

Run:

```bash
git status --short
git diff --stat
```

提交前 `git diff --stat` 应只包含 CCR runtime、provider settings/factory、文档和 lockfile 相关变化。最终提交后 `git status --short` 应为空。

- [ ] **Step 5：提交**

```bash
git add docs/superpowers/manual-smoke/2026-06-21-ccr-runtime-poc.md docs/superpowers/specs/2026-06-21-claude-code-router-unified-runtime-design.md docs/superpowers/plans/2026-06-21-claude-code-router-unified-runtime.md
git commit -m "docs: record ccr runtime migration evidence"
```

---

## 后续独立计划

本计划完成后，再分别创建以下计划：

- 图片输入：`PromptInput.files`、`/runs` message parts、Claude SDK `SDKUserMessage` content blocks、CCR image block PoC。
- 语音转写：transcription provider/model settings、音频上传校验、transcript 持久化、transcript-to-run 注入。
- Settings UX copy：把“runtime protocol”改成“upstream protocol”，并展示模型能力标签。

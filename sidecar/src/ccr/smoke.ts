import { tmpdir } from "node:os";
import path from "node:path";
import type { EventType } from "@ag-ui/core";
import type { AgentRuntime } from "../lib/providerProfiles";
import {
  buildAgentStudioCcrConfig,
  redactAgentStudioCcrConfig,
  type AgentStudioCcrConfig,
} from "./config";
import type { CcrRuntimeRoute } from "./routes";
import { resolveCcrRuntimeRoute } from "./routes";

export type CcrSmokeProtocol = "openai-compatible" | "anthropic";

export interface CcrSmokeInput {
  upstreamBaseUrl?: string;
  upstreamApiKey?: string;
  upstreamModel?: string;
  upstreamProtocol: CcrSmokeProtocol;
  upstreamProviderId: string;
  upstreamProviderName: string;
  routerApiKey: string;
  routerPort: number;
  configDir: string;
  cwd: string;
  prompt: string;
}

export interface CcrSmokePlan {
  route: CcrRuntimeRoute;
  redactedRoute: CcrRuntimeRoute;
  config: AgentStudioCcrConfig;
  redactedConfig: AgentStudioCcrConfig;
}

type EnvLike = Record<string, string | undefined>;

function envString(env: EnvLike, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function envInt(env: EnvLike, name: string, fallback: number): number {
  const value = envString(env, name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redactKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

function redactRoute(route: CcrRuntimeRoute): CcrRuntimeRoute {
  // Smoke 输出会被复制进人工验证文档，所以 route 级别也要脱敏；
  // config.ts 只负责 CCR config 脱敏，不能覆盖这里的运行时 route。
  return {
    ...route,
    apiKey: redactKey(route.apiKey),
    upstream: {
      ...route.upstream,
      apiKey: redactKey(route.upstream.apiKey),
    },
  };
}

export function buildCcrSmokeInputFromEnv(env: EnvLike): CcrSmokeInput {
  const protocol = envString(env, "AGENT_STUDIO_CCR_POC_PROTOCOL");
  // PoC 脚本只读取专用 AGENT_STUDIO_CCR_POC_* 环境变量，避免误用用户
  // 真实 shell 中已有的 ANTHROPIC_* / OPENAI_* 配置造成不可复现的结果。
  return {
    upstreamBaseUrl: envString(env, "AGENT_STUDIO_CCR_POC_BASE_URL"),
    upstreamApiKey: envString(env, "AGENT_STUDIO_CCR_POC_API_KEY"),
    upstreamModel: envString(env, "AGENT_STUDIO_CCR_POC_MODEL"),
    upstreamProtocol:
      protocol === "anthropic" ? "anthropic" : "openai-compatible",
    upstreamProviderId:
      envString(env, "AGENT_STUDIO_CCR_POC_PROVIDER_ID") ?? "ccr_poc",
    upstreamProviderName:
      envString(env, "AGENT_STUDIO_CCR_POC_PROVIDER_NAME") ??
      "CCR PoC Provider",
    routerApiKey:
      envString(env, "AGENT_STUDIO_CCR_POC_ROUTER_API_KEY") ??
      "agent-studio-ccr-poc",
    routerPort: envInt(env, "AGENT_STUDIO_CCR_POC_ROUTER_PORT", 3456),
    configDir:
      envString(env, "AGENT_STUDIO_CCR_POC_CONFIG_DIR") ??
      path.join(tmpdir(), "agent-studio-ccr-poc"),
    cwd: envString(env, "AGENT_STUDIO_CCR_POC_CWD") ?? process.cwd(),
    prompt:
      envString(env, "AGENT_STUDIO_CCR_POC_PROMPT") ??
      "用一句中文回复：CCR text streaming smoke ok",
  };
}

export function validateCcrSmokeInput(input: CcrSmokeInput): string[] {
  const missing: string[] = [];
  if (!input.upstreamBaseUrl) missing.push("AGENT_STUDIO_CCR_POC_BASE_URL");
  if (!input.upstreamApiKey) missing.push("AGENT_STUDIO_CCR_POC_API_KEY");
  if (!input.upstreamModel) missing.push("AGENT_STUDIO_CCR_POC_MODEL");
  return missing;
}

export function buildCcrSmokePlan(input: CcrSmokeInput): CcrSmokePlan {
  const missing = validateCcrSmokeInput(input);
  if (missing.length > 0) {
    throw new Error(`ccr_smoke_missing_env:${missing.join(",")}`);
  }

  // 这里模拟 ProviderSettings.resolveSelection 的输出形状，但不读 DB。
  // OpenAI-compatible 与 Anthropic 的 auth 能力不同，拆成两个窄分支让
  // TypeScript 持续校验 smoke 构造的数据和真实 provider contract 一致。
  const agentRuntime: AgentRuntime =
    input.upstreamProtocol === "anthropic"
      ? {
          protocol: "anthropic",
          baseUrl: input.upstreamBaseUrl!,
          auth: "x-api-key",
          capabilities: {
            text: true,
            tools: true,
            fileCheckpoint: true,
          },
        }
      : {
          protocol: "openai-compatible",
          baseUrl: input.upstreamBaseUrl!,
          auth: "bearer",
          capabilities: {
            text: true,
            tools: false,
            fileCheckpoint: false,
          },
        };

  const route = resolveCcrRuntimeRoute(
    {
      presetId: "ccr_poc",
      presetName: "CCR PoC",
      providerId: input.upstreamProviderId,
      providerName: input.upstreamProviderName,
      managed: false,
      profileId: "custom",
      label: input.upstreamProviderName,
      baseUrl: input.upstreamBaseUrl!,
      apiKey: input.upstreamApiKey!,
      customProtocol: input.upstreamProtocol,
      models: [
        {
          id: input.upstreamModel!,
          displayName: input.upstreamModel!,
          description: "CCR PoC model",
        },
      ],
      remoteModelsFetchedAt: "",
      selectedModelId: null,
      modelId: input.upstreamModel!,
      supportsRemoteModels: true,
      agentRuntime,
    },
    {
      baseUrl: `http://127.0.0.1:${input.routerPort}`,
      apiKey: input.routerApiKey,
    },
  );
  const config = buildAgentStudioCcrConfig([route]);

  return {
    route,
    redactedRoute: redactRoute(route),
    config,
    redactedConfig: redactAgentStudioCcrConfig(config),
  };
}

export interface CcrSmokeSummary {
  totalEvents: number;
  eventTypes: Partial<Record<EventType | string, number>>;
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    model?: string;
  };
}

export function createEmptyCcrSmokeSummary(): CcrSmokeSummary {
  // 真实 smoke 只记录可公开的验证证据：事件类型计数、聚合文本和 usage。
  // 不记录 prompt、API key、完整 provider config，避免把凭据带进日志。
  return {
    totalEvents: 0,
    eventTypes: {},
    text: "",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    },
  };
}

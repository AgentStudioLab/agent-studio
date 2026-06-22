import type {
  CustomProviderProtocol,
  ResolvedProviderForRun,
} from "../services/providerSettings";
import { buildCcrModelKey } from "./model-key";

export interface CcrRuntimeRoute {
  runtime: "claude-agent-sdk";
  gateway: "claude-code-router";
  baseUrl: string;
  authMode: "x-api-key";
  apiKey: string;
  model: string;
  upstream: {
    providerId: string;
    providerName: string;
    protocol: CustomProviderProtocol;
    baseUrl: string;
    apiKey: string;
    modelId: string;
  };
}

export interface ResolveCcrRuntimeRouteOptions {
  baseUrl?: string;
  apiKey?: string;
}

export function resolveCcrRuntimeRoute(
  provider: ResolvedProviderForRun,
  options: ResolveCcrRuntimeRouteOptions = {},
): CcrRuntimeRoute {
  if (!provider.modelId) {
    throw new Error("ccr_model_missing");
  }

  const protocol =
    provider.customProtocol === "openai-compatible" ||
    provider.agentRuntime.protocol === "openai-compatible"
      ? "openai-compatible"
      : undefined;

  if (protocol !== "openai-compatible") {
    throw new Error("ccr_protocol_unsupported");
  }

  return {
    runtime: "claude-agent-sdk",
    gateway: "claude-code-router",
    baseUrl: options.baseUrl ?? "http://127.0.0.1:3456",
    authMode: "x-api-key",
    apiKey: options.apiKey ?? "agent-studio-ccr",
    model: buildCcrModelKey({
      providerId: provider.providerId,
      modelId: provider.modelId,
    }),
    upstream: {
      providerId: provider.providerId,
      providerName: provider.providerName,
      protocol,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: provider.modelId,
    },
  };
}

import type { CcrRuntimeRoute } from "./routes";

export interface AgentStudioCcrProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: {
    use: string[];
  };
}

export interface AgentStudioCcrConfig {
  APIKEY: string;
  HOST: "127.0.0.1";
  PORT: number;
  LOG: boolean;
  NON_INTERACTIVE_MODE: boolean;
  Providers: AgentStudioCcrProvider[];
  Router: {
    default: string;
  };
}

function ccrProviderNameForRoute(route: CcrRuntimeRoute): string {
  return route.model.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function openAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

function providerForRoute(route: CcrRuntimeRoute): AgentStudioCcrProvider {
  const provider: AgentStudioCcrProvider = {
    name: ccrProviderNameForRoute(route),
    api_base_url:
      route.upstream.protocol === "anthropic"
        ? route.upstream.baseUrl.replace(/\/+$/, "")
        : openAIChatCompletionsUrl(route.upstream.baseUrl),
    api_key: route.upstream.apiKey,
    models: [route.upstream.modelId],
  };

  if (route.upstream.protocol === "anthropic") {
    provider.transformer = { use: ["Anthropic"] };
  }

  return provider;
}

function defaultRouterValue(route: CcrRuntimeRoute): string {
  return `${ccrProviderNameForRoute(route)},${route.upstream.modelId}`;
}

export function buildAgentStudioCcrConfig(
  routes: CcrRuntimeRoute[],
): AgentStudioCcrConfig {
  if (routes.length === 0) {
    throw new Error("ccr_routes_empty");
  }

  const byKey = new Map<string, CcrRuntimeRoute>();
  for (const route of routes) {
    byKey.set(route.model, route);
  }

  const dedupedRoutes = [...byKey.values()];
  const first = dedupedRoutes[0];
  if (!first) throw new Error("ccr_routes_empty");

  return {
    APIKEY: first.apiKey,
    HOST: "127.0.0.1",
    PORT: Number(new URL(first.baseUrl).port || "3456"),
    LOG: false,
    NON_INTERACTIVE_MODE: true,
    Providers: dedupedRoutes.map(providerForRoute),
    Router: {
      default: defaultRouterValue(first),
    },
  };
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
    ...config,
    APIKEY: redactKey(config.APIKEY),
    Providers: config.Providers.map((provider) => ({
      ...provider,
      api_key: redactKey(provider.api_key),
    })),
  };
}

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

import { describe, expect, it } from "bun:test";
import { listModelsForProvider } from "./modelCatalog";
import type { ModelFetchImpl } from "./modelCatalog";
import { getBuiltInProfile, type ProviderProfile } from "../lib/providerProfiles";

function openAIProfile(): ProviderProfile {
  return {
    id: "openai",
    label: "OpenAI",
    region: "Global",
    baseUrl: "https://api.openai.test/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.test/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
    supportsRemoteModels: true,
    models: [],
  };
}

describe("modelCatalog", () => {
  it("fetches Anthropic model catalogs with Anthropic headers", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({
          data: [
            { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
            { id: "claude-haiku-4-5" },
          ],
        }),
      );
    };
    const profile = getBuiltInProfile("anthropic");
    expect(profile).toBeDefined();
    if (!profile) throw new Error("missing Anthropic profile");

    const result = await listModelsForProvider({
      profile,
      baseUrl: "https://api.anthropic.test",
      apiKey: "anthropic-key",
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.anthropic.test/v1/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      "anthropic-version": "2023-06-01",
      "x-api-key": "anthropic-key",
    });
    expect(result).toMatchObject({
      ok: true,
      models: [
        {
          id: "claude-sonnet-4-6",
          displayName: "Claude Sonnet 4.6",
          description: "Remote model",
        },
        {
          id: "claude-haiku-4-5",
          displayName: "claude-haiku-4-5",
          description: "Remote model",
        },
      ],
    });
  });

  it("normalizes OpenAI-compatible model responses", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ data: [{ id: "gpt-5.1" }, { id: "gpt-4.1-mini" }] }),
      );
    };

    const result = await listModelsForProvider({
      profile: openAIProfile(),
      baseUrl: "https://api.openai.test/v1/",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.openai.test/v1/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer test-key",
    });
    expect(result).toMatchObject({
      ok: true,
      models: [
        {
          id: "gpt-5.1",
          displayName: "gpt-5.1",
          description: "Remote model",
        },
        {
          id: "gpt-4.1-mini",
          displayName: "gpt-4.1-mini",
          description: "Remote model",
        },
      ],
    });
    expect(result.ok && Date.parse(result.fetchedAt)).not.toBeNaN();
  });

  it("defaults root OpenAI-compatible base URLs to /v1/models", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.1" }] }));
    };

    await listModelsForProvider({
      profile: openAIProfile(),
      baseUrl: "https://api.openai.test",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(calls[0]?.[0]).toBe("https://api.openai.test/v1/models");
  });

  it("refreshes DeepSeek models from the OpenAI catalog while preserving its Anthropic runtime base URL", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({
          data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
        }),
      );
    };
    const profile = getBuiltInProfile("deepseek");
    expect(profile).toBeDefined();
    if (!profile) throw new Error("missing DeepSeek profile");

    const result = await listModelsForProvider({
      profile,
      baseUrl: "https://api.deepseek.com/anthropic",
      apiKey: "deepseek-key",
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.deepseek.com/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer deepseek-key",
    });
    expect(result).toMatchObject({
      ok: true,
      models: [
        {
          id: "deepseek-chat",
          displayName: "deepseek-chat",
          description: "Remote model",
        },
        {
          id: "deepseek-reasoner",
          displayName: "deepseek-reasoner",
          description: "Remote model",
        },
      ],
    });
  });

  it("returns missing_api_key before fetch for blank keys", async () => {
    let fetchCalled = false;
    const fetchImpl: ModelFetchImpl = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.1" }] }));
    };

    const result = await listModelsForProvider({
      profile: openAIProfile(),
      baseUrl: "https://api.openai.test/v1",
      apiKey: "   ",
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(fetchCalled).toBe(false);
  });

  it("rejects empty remote model lists as invalid provider responses", async () => {
    const fetchImpl: ModelFetchImpl = async () =>
      new Response(JSON.stringify({ data: [] }));

    const result = await listModelsForProvider({
      profile: openAIProfile(),
      baseUrl: "https://api.openai.test/v1",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, error: "invalid_provider_response" });
  });

  it("does not fetch static strategy providers", async () => {
    let fetchCalled = false;
    const fetchImpl: ModelFetchImpl = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [{ id: "claude" }] }));
    };

    const result = await listModelsForProvider({
      profile: {
        ...openAIProfile(),
        id: "anthropic",
        modelList: { strategy: "static" },
        supportsRemoteModels: false,
      },
      baseUrl: "https://api.anthropic.test",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      error: "unsupported_remote_models",
    });
    expect(fetchCalled).toBe(false);
  });

  it("normalizes Gemini model names by stripping the models prefix", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ models: [{ name: "models/gemini-2.5-pro" }] }),
      );
    };

    const result = await listModelsForProvider({
      profile: {
        ...openAIProfile(),
        id: "gemini",
        modelList: { strategy: "gemini" },
      },
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/",
      apiKey: "gemini key",
      fetchImpl,
    });

    expect(calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?key=gemini%20key",
    );
    expect(result).toMatchObject({
      ok: true,
      models: [
        {
          id: "gemini-2.5-pro",
          displayName: "gemini-2.5-pro",
          description: "Remote model",
        },
      ],
    });
  });

  it("uses the built-in Gemini v1beta catalog endpoint", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ models: [{ name: "models/gemini-2.5-pro" }] }),
      );
    };
    const profile = getBuiltInProfile("gemini");
    expect(profile).toBeDefined();
    if (!profile) throw new Error("missing Gemini profile");

    await listModelsForProvider({
      profile,
      baseUrl: profile.baseUrl,
      apiKey: "gemini-key",
      fetchImpl,
    });

    expect(calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
    );
  });
});

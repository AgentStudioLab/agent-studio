import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { createProviderSettings } from "./providerSettings";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("providerSettings", () => {
  it("defaults to anthropic with empty model cache", () => {
    const settings = createProviderSettings(makeDb(), {});
    expect(settings.current()).toMatchObject({
      profileId: "anthropic",
      selectedModelId: null,
      remoteModelsFetchedAt: "",
    });
    expect("customModelSource" in settings.current()).toBe(false);
    expect("customModels" in settings.current()).toBe(false);
    expect(settings.current().models.length).toBeGreaterThan(0);
  });

  it("reads legacy provider rows without losing existing fields", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        profileId: "deepseek",
        baseUrl: "",
        apiKey: "k",
        customModels: [],
      }),
    );
    const settings = createProviderSettings(db, {});
    expect(settings.current().profileId).toBe("deepseek");
    expect(settings.current().apiKey).toBe("k");
    expect(settings.current().selectedModelId).toBe(null);
  });

  it("does not hydrate legacy custom models as selectable models", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        profileId: "custom",
        baseUrl: "https://custom.example",
        apiKey: "custom-key",
        customModels: [
          {
            id: "local-model",
            displayName: "Local Model",
            description: "Manual model",
          },
        ],
      }),
    );

    const current = createProviderSettings(db, {}).current();

    expect(current.profileId).toBe("custom");
    expect(current.models).toEqual([]);
    expect("customModelSource" in current).toBe(false);
    expect("customModels" in current).toBe(false);
  });

  it("falls back to env defaults for corrupt provider rows with invalid scalar fields", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        profileId: "anthropic",
        baseUrl: 42,
        apiKey: false,
        customModels: [],
      }),
    );

    const current = createProviderSettings(db, {
      apiKey: "env-key",
      baseUrl: "https://env.example",
    }).current();

    expect(current.profileId).toBe("anthropic");
    expect(current.apiKey).toBe("env-key");
    expect(current.baseUrl).toBe("https://env.example");
  });

  it("persists selected model and remote cache for the active provider", () => {
    const settings = createProviderSettings(makeDb(), {});
    settings.update({
      profileId: "openai",
      selectedModelId: "gpt-4.1-mini",
      remoteModels: [
        {
          id: "gpt-4.1-mini",
          displayName: "gpt-4.1-mini",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });
    const current = settings.current();
    expect(current.profileId).toBe("openai");
    expect(current.selectedModelId).toBe("gpt-4.1-mini");
    expect(current.models[0]).toEqual({
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      description: "Remote model",
    });
  });

  it("does not expose remote cache after switching providers", () => {
    const settings = createProviderSettings(makeDb(), {});
    settings.update({
      profileId: "openai",
      remoteModels: [
        {
          id: "gpt-4.1-mini",
          displayName: "gpt-4.1-mini",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });
    settings.update({ profileId: "gemini" });
    const current = settings.current();
    expect(current.profileId).toBe("gemini");
    expect(current.models.some((m) => m.id === "gpt-4.1-mini")).toBe(false);
    expect(current.remoteModelsFetchedAt).toBe("");
    expect(current.selectedModelId).toBe(null);
  });

  it("does not expose remote cache after changing base URL", () => {
    const settings = createProviderSettings(makeDb(), {});
    settings.update({
      profileId: "custom",
      baseUrl: "https://a.example/v1",
      remoteModels: [
        {
          id: "model-from-a",
          displayName: "Model From A",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "custom",
      remoteModelsBaseUrl: "https://a.example/v1",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });

    settings.update({ baseUrl: "https://b.example/v1" });

    const current = settings.current();
    expect(current.baseUrl).toBe("https://b.example/v1");
    expect(current.models.some((m) => m.id === "model-from-a")).toBe(false);
    expect(current.remoteModelsFetchedAt).toBe("");
  });

  it("does not expose remote cache after changing API key", () => {
    const settings = createProviderSettings(makeDb(), {});
    settings.update({
      profileId: "openai",
      apiKey: "key-a",
      remoteModels: [
        {
          id: "entitled-model",
          displayName: "Entitled Model",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });

    settings.update({ apiKey: "key-b" });

    const current = settings.current();
    expect(current.models.some((m) => m.id === "entitled-model")).toBe(false);
    expect(current.remoteModelsFetchedAt).toBe("");
  });

  it("resolves SiliconFlow runtime through its OpenAI-compatible /v1 base URL", () => {
    const settings = createProviderSettings(makeDb(), {});

    settings.update({
      profileId: "siliconflow-cn",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sf-key",
    });

    const current = settings.current();
    expect(current.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(current.agentRuntime).toMatchObject({
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
      auth: "bearer",
    });
  });

  it("resolves OpenAI-compatible runtime for OpenAI providers", () => {
    const settings = createProviderSettings(makeDb(), {});

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

  it("normalizes custom baseUrl as OpenAI-compatible runtime for custom providers", () => {
    const settings = createProviderSettings(makeDb(), {});

    settings.update({
      profileId: "custom",
      baseUrl: "https://gateway.example",
      apiKey: "custom-key",
    });

    expect(settings.current().agentRuntime).toMatchObject({
      protocol: "openai-compatible",
      baseUrl: "https://gateway.example/v1",
      auth: "bearer",
    });

    settings.update({ baseUrl: "https://gateway.example/v1" });

    expect(settings.current().agentRuntime).toMatchObject({
      protocol: "openai-compatible",
      baseUrl: "https://gateway.example/v1",
      auth: "bearer",
    });
  });
});

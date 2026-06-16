import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import {
  OFFICIAL_PROVIDER_ID,
  createProviderSettings,
} from "./providerSettings";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function readProviderRow(db: Database) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("provider") as { value: string } | undefined;
  if (!row) throw new Error("missing provider row");
  return JSON.parse(row.value) as { activePresetId?: string };
}

describe("providerSettings", () => {
  it("defaults to anthropic with empty model cache", () => {
    const settings = createProviderSettings(makeDb(), {});
    expect(settings.current()).toMatchObject({
      profileId: "anthropic",
      presetName: "Anthropic",
      selectedModelId: null,
      remoteModelsFetchedAt: "",
    });
    expect(typeof settings.current().presetId).toBe("string");
    expect("customModelSource" in settings.current()).toBe(false);
    expect("customModels" in settings.current()).toBe(false);
    expect(settings.current().models.length).toBeGreaterThan(0);
  });

  it("migrates a legacy single provider row into an active preset", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        profileId: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
        remoteModels: [
          { id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" },
        ],
        remoteModelsProviderId: "openai",
        remoteModelsBaseUrl: "https://api.openai.com/v1",
        remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
        selectedModelId: "gpt-5.1",
      }),
    );

    const settings = createProviderSettings(db, {});
    const current = settings.current();

    expect(current).toMatchObject({
      profileId: "openai",
      presetName: "OpenAI",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
      remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(typeof current.presetId).toBe("string");
    expect(settings.listPresets()).toHaveLength(1);
    expect(settings.listPresets()[0]).toMatchObject({
      id: current.presetId,
      name: "OpenAI",
      selectedModelId: "gpt-5.1",
    });
  });

  it("persists migrated legacy preset ids before the next update", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        profileId: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
        remoteModels: [],
        remoteModelsProviderId: "",
        remoteModelsBaseUrl: "",
        remoteModelsFetchedAt: "",
        selectedModelId: null,
      }),
    );

    const firstSettings = createProviderSettings(db, {});
    const firstPresetId = firstSettings.current().presetId;

    const secondSettings = createProviderSettings(db, {});

    expect(secondSettings.current().presetId).toBe(firstPresetId);
    expect(secondSettings.listPresets()[0]?.id).toBe(firstPresetId);
  });

  it("creates a default Anthropic preset when the provider row is missing", () => {
    const settings = createProviderSettings(makeDb(), {
      apiKey: "env-key",
      baseUrl: "https://env.example",
    });

    expect(settings.current()).toMatchObject({
      profileId: "anthropic",
      presetName: "Anthropic",
      apiKey: "env-key",
      baseUrl: "https://env.example",
    });
    expect(settings.listPresets()).toHaveLength(1);
  });

  it("migrates v2 presets into v3 provider connections with enabled models", () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        version: 2,
        activePresetId: "preset-openai",
        presets: [
          {
            id: "preset-openai",
            name: "OpenAI",
            profileId: "openai",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "openai-key",
            remoteModels: [
              {
                id: "gpt-5.1",
                displayName: "GPT-5.1",
                description: "Remote",
              },
              {
                id: "gpt-5.1-mini",
                displayName: "GPT-5.1 Mini",
                description: "Remote",
              },
            ],
            remoteModelsProviderId: "openai",
            remoteModelsBaseUrl: "https://api.openai.com/v1",
            remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
            selectedModelId: "gpt-5.1",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
        ],
      }),
    );

    const settings = createProviderSettings(db, {});

    expect(settings.currentStoreVersion()).toBe(3);
    expect(settings.getDefaultSelection()).toEqual({
      providerId: "preset-openai",
      modelId: "gpt-5.1",
    });
    expect(
      settings.listConnections().find((item) => item.id === "preset-openai"),
    ).toMatchObject({
      id: "preset-openai",
      name: "OpenAI",
      profileId: "openai",
      enabled: true,
      modelCount: 2,
      enabledModelCount: 1,
      defaultModelId: "gpt-5.1",
    });
    expect(settings.listEnabledModelSelections()).toContainEqual(
      expect.objectContaining({
        providerId: "preset-openai",
        modelId: "gpt-5.1",
        providerName: "OpenAI",
        modelLabel: "GPT-5.1",
      }),
    );
  });

  it("creates a default Anthropic connection with env fallback", () => {
    const settings = createProviderSettings(makeDb(), {
      apiKey: "env-key",
      baseUrl: "https://env.example",
    });

    const connection = settings
      .listConnections()
      .find((item) => item.profileId === "anthropic");
    expect(connection).toMatchObject({
      name: "Anthropic",
      profileId: "anthropic",
      enabled: true,
      hasApiKey: true,
    });
    expect(settings.resolveSelection()).toMatchObject({
      providerId: connection?.id,
      modelId: connection?.defaultModelId,
      apiKey: "env-key",
      baseUrl: "https://env.example",
    });
  });

  it("always exposes a managed official provider with all official models enabled", () => {
    const settings = createProviderSettings(makeDb(), {}, {
      getModels: () => [
        {
          id: "official-a",
          displayName: "Official A",
          description: "Official model",
        },
        {
          id: "official-b",
          displayName: "Official B",
          description: "Official model",
        },
      ],
      getFetchedAt: () => "2026-06-17T00:00:00.000Z",
    });

    const [official] = settings.listConnections();

    expect(official).toMatchObject({
      id: OFFICIAL_PROVIDER_ID,
      name: "官方服务商",
      managed: true,
      enabled: true,
      modelCount: 2,
      enabledModelCount: 2,
      defaultModelId: "official-a",
      remoteModelsFetchedAt: "2026-06-17T00:00:00.000Z",
    });
    expect(settings.listEnabledModelSelections().slice(0, 2)).toEqual([
      expect.objectContaining({
        providerId: OFFICIAL_PROVIDER_ID,
        modelId: "official-a",
        managed: true,
      }),
      expect.objectContaining({
        providerId: OFFICIAL_PROVIDER_ID,
        modelId: "official-b",
        managed: true,
      }),
    ]);
    expect(
      settings.resolveSelection({
        providerId: OFFICIAL_PROVIDER_ID,
        modelId: "official-b",
      }),
    ).toMatchObject({
      providerId: OFFICIAL_PROVIDER_ID,
      providerName: "官方服务商",
      managed: true,
      modelId: "official-b",
      apiKey: "",
    });
  });

  it("does not allow users to edit, delete, or disable the official provider", () => {
    const settings = createProviderSettings(makeDb(), {});

    expect(() =>
      settings.updateConnection(OFFICIAL_PROVIDER_ID, { name: "Custom name" }),
    ).toThrow("official_provider_readonly");
    expect(() =>
      settings.setEnabledModels(OFFICIAL_PROVIDER_ID, []),
    ).toThrow("official_provider_readonly");
    expect(settings.deleteConnection(OFFICIAL_PROVIDER_ID)).toEqual({
      ok: false,
      error: "cannot_delete_official_provider",
    });
  });

  it("heals stale v2 active preset ids during initialization and mutation", () => {
    const db = makeDb();
    const preset = {
      id: "preset-1",
      name: "Preset One",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      profileId: "anthropic",
      baseUrl: "",
      apiKey: "preset-key",
      remoteModels: [],
      remoteModelsProviderId: "",
      remoteModelsBaseUrl: "",
      remoteModelsFetchedAt: "",
      selectedModelId: null,
    };
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "provider",
      JSON.stringify({
        version: 2,
        activePresetId: "missing",
        presets: [preset],
      }),
    );

    const settings = createProviderSettings(db, {});

    expect(settings.current().presetId).toBe("preset-1");
    expect(settings.listPresets()[0]?.id).toBe("preset-1");
    expect(readProviderRow(db).activePresetId).toBe("preset-1");

    const reloaded = createProviderSettings(db, {});
    expect(reloaded.current().presetId).toBe("preset-1");
    expect(readProviderRow(db).activePresetId).toBe("preset-1");

    let notifications = 0;
    reloaded.onChange(() => {
      notifications += 1;
    });
    reloaded.updatePreset("preset-1", { apiKey: "updated-key" });

    expect(reloaded.current().apiKey).toBe("updated-key");
    expect(readProviderRow(db).activePresetId).toBe("preset-1");
    expect(notifications).toBe(1);
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

  it("resolves custom Anthropic-compatible providers to the full Claude runtime", () => {
    const settings = createProviderSettings(makeDb(), {});
    const connection = settings.createConnection({
      name: "Custom Anthropic Gateway",
      profileId: "custom",
      baseUrl: "https://anthropic-gateway.example",
      apiKey: "gateway-key",
      customProtocol: "anthropic",
    });

    expect(connection.profileId).toBe("custom");
    expect(connection.agentRuntime).toEqual({
      protocol: "anthropic",
      baseUrl: "https://anthropic-gateway.example",
      auth: "x-api-key",
      capabilities: {
        text: true,
        tools: true,
        fileCheckpoint: true,
      },
    });
    expect(connection.customProtocol).toBe("anthropic");

    const resolved = settings.resolveSelection({
      providerId: connection.providerId,
      modelId: connection.defaultModelId ?? "",
    });
    expect(resolved.agentRuntime.protocol).toBe("anthropic");
  });

  it("clears custom model cache when custom protocol changes", () => {
    const settings = createProviderSettings(makeDb(), {});
    const connection = settings.createConnection({
      profileId: "custom",
      baseUrl: "https://gateway.example",
      apiKey: "gateway-key",
      customProtocol: "openai-compatible",
    });
    const refreshed = settings.updateConnection(connection.providerId, {
      remoteModels: [
        {
          id: "openai-model",
          displayName: "OpenAI Model",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "custom",
      remoteModelsBaseUrl: "https://gateway.example",
      remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(refreshed?.models.map((model) => model.id)).toEqual([
      "openai-model",
    ]);

    const updated = settings.updateConnection(connection.providerId, {
      customProtocol: "anthropic",
    });

    expect(updated?.customProtocol).toBe("anthropic");
    expect(updated?.models).toEqual([]);
    expect(updated?.remoteModelsFetchedAt).toBe("");
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

  it("binds remote cache writes to the built-in provider effective base URL", () => {
    const settings = createProviderSettings(makeDb(), {});

    settings.update({
      profileId: "openai",
      remoteModels: [
        {
          id: "gpt-5.1",
          displayName: "GPT-5.1",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });

    const current = settings.current();
    expect(current.baseUrl).toBe("https://api.openai.com/v1");
    expect(current.remoteModelsFetchedAt).toBe("2026-05-29T00:00:00.000Z");
    expect(current.models.map((model) => model.id)).toEqual(["gpt-5.1"]);
  });

  it("preserves selected model when base URL or API key changes", () => {
    const settings = createProviderSettings(makeDb(), {});

    settings.update({
      profileId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key-a",
      selectedModelId: "gpt-5.1",
    });

    settings.update({ baseUrl: "https://gateway.example/v1" });
    expect(settings.current().selectedModelId).toBe("gpt-5.1");

    settings.update({ apiKey: "key-b" });
    expect(settings.current().selectedModelId).toBe("gpt-5.1");
  });

  it("uses stale selected model ids as preset summary labels after cache invalidation", () => {
    const settings = createProviderSettings(makeDb(), {});

    settings.update({
      profileId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key-a",
      selectedModelId: "missing-selected-model",
      remoteModels: [
        {
          id: "available-before-cache-clear",
          displayName: "Available Before Cache Clear",
          description: "Remote model",
        },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
    });

    settings.update({ apiKey: "key-b" });

    const [summary] = settings.listPresets();
    expect(settings.current().selectedModelId).toBe("missing-selected-model");
    expect(settings.current().remoteModelsFetchedAt).toBe("");
    expect(summary?.selectedModelId).toBe("missing-selected-model");
    expect(summary?.selectedModelLabel).toBe("missing-selected-model");
  });

  it("creates a preset by copying active settings without activating it", () => {
    const db = makeDb();
    const settings = createProviderSettings(db, {});
    settings.update({
      profileId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
      remoteModels: [
        { id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
    });
    const active = settings.current();
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    const created = settings.createPreset({ name: "OpenAI Backup" });

    expect(created).toMatchObject({
      presetName: "OpenAI Backup",
      profileId: "openai",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
      remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(created.presetId).not.toBe(active.presetId);
    expect(settings.current().presetId).toBe(active.presetId);
    expect(settings.listPresets()).toHaveLength(2);
    expect(notifications).toBe(0);

    const reloaded = createProviderSettings(db, {});
    expect(reloaded.getPreset(created.presetId)?.presetName).toBe(
      "OpenAI Backup",
    );
  });

  it("creates a preset by copying a valid non-active source preset", () => {
    const settings = createProviderSettings(makeDb(), {});
    const originalActiveId = settings.current().presetId;
    const source = settings.createPreset({ name: "Source Preset" });
    settings.updatePreset(source.presetId, {
      profileId: "openai",
      apiKey: "source-key",
      selectedModelId: "source-model",
    });

    const created = settings.createPreset({
      copyFromPresetId: source.presetId,
      name: "Copied From Source",
    });

    expect(created).toMatchObject({
      presetName: "Copied From Source",
      profileId: "openai",
      apiKey: "source-key",
      selectedModelId: "source-model",
    });
    expect(created.presetId).not.toBe(source.presetId);
    expect(settings.current().presetId).toBe(originalActiveId);
  });

  it("falls back to the active preset when createPreset copy source is invalid", () => {
    const settings = createProviderSettings(makeDb(), {});
    settings.update({
      profileId: "deepseek",
      apiKey: "active-key",
      selectedModelId: "deepseek-chat",
    });
    const activeId = settings.current().presetId;
    const inactive = settings.createPreset({ name: "Inactive Preset" });
    settings.updatePreset(inactive.presetId, {
      profileId: "openai",
      apiKey: "inactive-key",
    });

    const created = settings.createPreset({
      copyFromPresetId: "missing",
      name: "Copied From Active",
    });

    expect(created).toMatchObject({
      presetName: "Copied From Active",
      profileId: "deepseek",
      apiKey: "active-key",
      selectedModelId: "deepseek-chat",
    });
    expect(settings.current().presetId).toBe(activeId);
  });

  it("creates and activates a preset while notifying listeners once", () => {
    const settings = createProviderSettings(makeDb(), {});
    const originalActiveId = settings.current().presetId;
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    const created = settings.createPreset({
      name: "Activated Copy",
      activate: true,
    });

    expect(created.presetId).not.toBe(originalActiveId);
    expect(settings.current().presetId).toBe(created.presetId);
    expect(notifications).toBe(1);
  });

  it("activates a preset and notifies listeners once", () => {
    const settings = createProviderSettings(makeDb(), {});
    const created = settings.createPreset({ name: "Second Preset" });
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    const activated = settings.activatePreset(created.presetId);
    const activatedAgain = settings.activatePreset(created.presetId);

    expect(activated?.presetId).toBe(created.presetId);
    expect(activatedAgain?.presetId).toBe(created.presetId);
    expect(settings.current().presetId).toBe(created.presetId);
    expect(notifications).toBe(1);
  });

  it("updates a non-active preset without notifying or changing current", () => {
    const settings = createProviderSettings(makeDb(), {});
    const activeId = settings.current().presetId;
    const created = settings.createPreset({ name: "Inactive" });
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    const updated = settings.updatePreset(created.presetId, {
      name: "  Inactive OpenAI  ",
      profileId: "openai",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
    });

    expect(updated).toMatchObject({
      presetId: created.presetId,
      presetName: "Inactive OpenAI",
      profileId: "openai",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
    });
    expect(settings.current().presetId).toBe(activeId);
    expect(settings.current().profileId).toBe("anthropic");
    expect(notifications).toBe(0);
  });

  it("persists non-active updatePreset changes after reloading settings", () => {
    const db = makeDb();
    const settings = createProviderSettings(db, {});
    const activeId = settings.current().presetId;
    const inactive = settings.createPreset({ name: "Inactive" });

    settings.updatePreset(inactive.presetId, {
      name: "Inactive DeepSeek",
      profileId: "deepseek",
      apiKey: "inactive-key",
      selectedModelId: "deepseek-chat",
    });

    const reloaded = createProviderSettings(db, {});

    expect(reloaded.current().presetId).toBe(activeId);
    expect(reloaded.getPreset(inactive.presetId)).toMatchObject({
      presetId: inactive.presetId,
      presetName: "Inactive DeepSeek",
      profileId: "deepseek",
      apiKey: "inactive-key",
      selectedModelId: "deepseek-chat",
    });
  });

  it("updates an active preset, notifies, and persists name and provider fields", () => {
    const db = makeDb();
    const settings = createProviderSettings(db, {});
    const activeId = settings.current().presetId;
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    const updated = settings.updatePreset(activeId, {
      name: "  DeepSeek Main  ",
      profileId: "deepseek",
      apiKey: "deepseek-key",
      baseUrl: "",
    });
    const invalidRename = settings.updatePreset(activeId, { name: "   " });

    expect(updated).toMatchObject({
      presetId: activeId,
      presetName: "DeepSeek Main",
      profileId: "deepseek",
      apiKey: "deepseek-key",
    });
    expect(invalidRename?.presetName).toBe("DeepSeek Main");
    expect(settings.current()).toMatchObject({
      presetId: activeId,
      presetName: "DeepSeek Main",
      profileId: "deepseek",
      apiKey: "deepseek-key",
    });
    expect(notifications).toBe(2);

    const reloaded = createProviderSettings(db, {});
    expect(reloaded.current()).toMatchObject({
      presetId: activeId,
      presetName: "DeepSeek Main",
      profileId: "deepseek",
      apiKey: "deepseek-key",
    });
  });

  it("rejects deleting the final preset", () => {
    const settings = createProviderSettings(makeDb(), {});

    expect(settings.deletePreset(settings.current().presetId)).toEqual({
      ok: false,
      error: "cannot_delete_last_preset",
    });
    expect(settings.listPresets()).toHaveLength(1);
  });

  it("deletes an active preset by switching to a remaining preset and notifying", () => {
    const settings = createProviderSettings(makeDb(), {});
    const firstId = settings.current().presetId;
    const second = settings.createPreset({ name: "Second Preset" });
    settings.activatePreset(second.presetId);
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    expect(settings.deletePreset(second.presetId)).toEqual({ ok: true });

    expect(settings.current().presetId).toBe(firstId);
    expect(settings.listPresets().map((preset) => preset.id)).toEqual([firstId]);
    expect(notifications).toBe(1);
  });

  it("deletes a non-active preset without notifying", () => {
    const settings = createProviderSettings(makeDb(), {});
    const activeId = settings.current().presetId;
    const second = settings.createPreset({ name: "Second Preset" });
    let notifications = 0;
    settings.onChange(() => {
      notifications += 1;
    });

    expect(settings.deletePreset(second.presetId)).toEqual({ ok: true });

    expect(settings.current().presetId).toBe(activeId);
    expect(settings.listPresets().map((preset) => preset.id)).toEqual([activeId]);
    expect(notifications).toBe(0);
  });

  it("returns null or preset_not_found for missing preset mutations", () => {
    const settings = createProviderSettings(makeDb(), {});

    expect(settings.updatePreset("missing", { name: "Missing" })).toBeNull();
    expect(settings.activatePreset("missing")).toBeNull();
    expect(settings.deletePreset("missing")).toEqual({
      ok: false,
      error: "preset_not_found",
    });
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

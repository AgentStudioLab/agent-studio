import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { createProviderSettings } from "../services/providerSettings";
import { createUserProfileSettings } from "../services/userProfileSettings";
import { buildSettingsRoutes } from "./settings";
import type { ModelFetchImpl } from "../services/modelCatalog";

function makeApp(options: { fetchImpl?: ModelFetchImpl } = {}) {
  const db = new Database(":memory:");
  migrate(db);
  const provider = createProviderSettings(db, {});
  const userProfile = createUserProfileSettings(db);
  const app = new Hono();
  app.route("/", buildSettingsRoutes(provider, userProfile, options));
  return { app, provider };
}

describe("settings provider routes", () => {
  it("GET /settings/provider returns the expanded built-in provider catalog", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider");
    const body = (await res.json()) as {
      activePresetId: string;
      builtIn: { id: string }[];
      current: { presetId: string; profileId: string };
      presets: { id: string; name: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.current.profileId).toBe("anthropic");
    expect(body.activePresetId).toBe(body.current.presetId);
    expect(body.presets).toHaveLength(1);
    expect(body.presets[0]).toMatchObject({
      id: body.current.presetId,
      name: "Anthropic",
    });
    expect(body.builtIn.map((p) => p.id)).toContain("openai");
    expect(body.builtIn.map((p) => p.id)).toContain("gemini");
  });

  it("GET /settings/provider returns v3 connections and enabled models", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider");
    const body = (await res.json()) as {
      version: number;
      defaultSelection: { providerId: string; modelId: string } | null;
      connections: Array<{
        id: string;
        modelCount: number;
        enabledModelCount: number;
      }>;
      enabledModels: Array<{ providerId: string; modelId: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.version).toBe(3);
    expect(body.connections.length).toBeGreaterThan(0);
    expect(body.connections[0]?.modelCount).toBeGreaterThan(0);
    expect(body.connections[0]?.enabledModelCount).toBeGreaterThan(0);
    expect(body.enabledModels.length).toBeGreaterThan(0);
    const firstEnabledModel = body.enabledModels[0];
    if (!firstEnabledModel) throw new Error("missing enabled model");
    expect(body.defaultSelection).toEqual({
      providerId: firstEnabledModel.providerId,
      modelId: firstEnabledModel.modelId,
    });
  });

  it("POST /settings/provider accepts OpenAI, api key, and selected model id", async () => {
    const { app, provider } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "openai",
        apiKey: "openai-key",
        selectedModelId: "gpt-5.1",
      }),
    });
    const body = (await res.json()) as {
      current: { profileId: string; apiKey: string; selectedModelId: string };
    };

    expect(res.status).toBe(200);
    expect(body.current).toMatchObject({
      profileId: "openai",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
    });
    expect(provider.current().selectedModelId).toBe("gpt-5.1");
  });

  it("returns agent runtime metadata for SiliconFlow and OpenAI providers", async () => {
    const { app } = makeApp();

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

    const sfBody = (await (
      await app.request("/settings/provider")
    ).json()) as {
      current: {
        agentRuntime: { protocol: string; baseUrl?: string; auth?: string };
      };
    };
    expect(sfBody.current.agentRuntime).toMatchObject({
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
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

    const openaiBody = (await (
      await app.request("/settings/provider")
    ).json()) as {
      current: {
        agentRuntime: { protocol: string; baseUrl?: string; auth?: string };
      };
    };
    expect(openaiBody.current.agentRuntime).toMatchObject({
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
    });
  });

  it("POST /settings/provider rejects model source fields", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customModelSource: "remote" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_model_source" });
  });

  it("POST /settings/provider rejects manual custom model lists", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customModels: [
          { id: "manual", displayName: "Manual", description: "Manual model" },
        ],
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_custom_models" });
  });

  it("POST /settings/provider rejects array JSON bodies", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("POST /settings/provider rejects primitive JSON bodies", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(true),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("POST /settings/provider rejects invalid selected model id", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedModelId: 42 }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_selected_model_id" });
  });

  it("creates, reads, updates, activates, and deletes provider presets", async () => {
    const { app } = makeApp();
    const initial = (await (
      await app.request("/settings/provider")
    ).json()) as {
      activePresetId: string;
      current: { presetId: string };
    };

    const create = await app.request("/settings/provider/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OpenAI Preset",
        copyFromPresetId: initial.activePresetId,
      }),
    });
    const createdBody = (await create.json()) as {
      activePresetId: string;
      current: { presetId: string };
      preset: { presetId: string; presetName: string; profileId: string };
      presets: { id: string; name: string }[];
    };
    expect(create.status).toBe(200);
    expect(createdBody.preset).toMatchObject({
      presetName: "OpenAI Preset",
      profileId: "anthropic",
    });
    expect(createdBody.preset.presetId).not.toBe(initial.activePresetId);
    expect(createdBody.activePresetId).toBe(initial.activePresetId);
    expect(createdBody.current.presetId).toBe(initial.activePresetId);
    expect(createdBody.presets).toHaveLength(2);

    const get = await app.request(
      `/settings/provider/presets/${createdBody.preset.presetId}`,
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      preset: {
        presetId: createdBody.preset.presetId,
        presetName: "OpenAI Preset",
      },
    });

    const update = await app.request(
      `/settings/provider/presets/${createdBody.preset.presetId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "OpenAI Updated",
          profileId: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "openai-key",
          selectedModelId: "gpt-5.1",
        }),
      },
    );
    const updatedBody = (await update.json()) as {
      activePresetId: string;
      current: { presetId: string; profileId: string };
      preset: {
        presetId: string;
        presetName: string;
        profileId: string;
        apiKey: string;
        selectedModelId: string;
      };
      presets: { id: string; name: string; profileId: string }[];
    };
    expect(update.status).toBe(200);
    expect(updatedBody.preset).toMatchObject({
      presetId: createdBody.preset.presetId,
      presetName: "OpenAI Updated",
      profileId: "openai",
      apiKey: "openai-key",
      selectedModelId: "gpt-5.1",
    });
    expect(updatedBody.current.presetId).toBe(initial.activePresetId);
    expect(updatedBody.activePresetId).toBe(initial.activePresetId);

    const activate = await app.request(
      `/settings/provider/presets/${createdBody.preset.presetId}/activate`,
      { method: "POST" },
    );
    const activatedBody = (await activate.json()) as {
      activePresetId: string;
      current: { presetId: string; profileId: string };
      presets: { id: string }[];
    };
    expect(activate.status).toBe(200);
    expect(activatedBody.activePresetId).toBe(createdBody.preset.presetId);
    expect(activatedBody.current).toMatchObject({
      presetId: createdBody.preset.presetId,
      profileId: "openai",
    });

    const remove = await app.request(
      `/settings/provider/presets/${initial.activePresetId}`,
      { method: "DELETE" },
    );
    const removedBody = (await remove.json()) as {
      activePresetId: string;
      current: { presetId: string };
      presets: { id: string }[];
    };
    expect(remove.status).toBe(200);
    expect(removedBody.activePresetId).toBe(createdBody.preset.presetId);
    expect(removedBody.current.presetId).toBe(createdBody.preset.presetId);
    expect(removedBody.presets.map((preset) => preset.id)).toEqual([
      createdBody.preset.presetId,
    ]);
  });

  it("refreshes models for a non-default provider connection", async () => {
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ data: [{ id: "gpt-non-default" }] }),
      );
    };
    const { app, provider } = makeApp({ fetchImpl });
    const created = provider.createConnection({
      name: "Inactive OpenAI",
      profileId: "openai",
      apiKey: "key-b",
      enabled: true,
    });
    const defaultProviderId = provider.getDefaultSelection()?.providerId;

    const res = await app.request(
      `/settings/provider/connections/${created.providerId}/models/refresh`,
      { method: "POST" },
    );
    const body = (await res.json()) as {
      connection: { providerId: string; models: Array<{ id: string }> };
      enabledModels: Array<{ providerId: string; modelId: string }>;
      defaultSelection: { providerId: string; modelId: string } | null;
    };

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer key-b",
    });
    expect(body.connection.providerId).toBe(created.providerId);
    expect(body.connection.models.map((model) => model.id)).toEqual([
      "gpt-non-default",
    ]);
    expect(provider.getConnection(created.providerId)?.models.map((m) => m.id)).toEqual([
      "gpt-non-default",
    ]);
    expect(body.defaultSelection?.providerId).toBe(defaultProviderId);
    expect(provider.getDefaultSelection()?.providerId).toBe(defaultProviderId);
  });

  it("POST /settings/provider compatibility route updates the active preset", async () => {
    const { app } = makeApp();
    const create = await app.request("/settings/provider/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Second", activate: true }),
    });
    const created = (await create.json()) as {
      activePresetId: string;
      preset: { presetId: string };
    };

    const res = await app.request("/settings/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "openai",
        apiKey: "active-openai-key",
        selectedModelId: "gpt-5.1",
      }),
    });
    const body = (await res.json()) as {
      current: {
        presetId: string;
        profileId: string;
        apiKey: string;
        selectedModelId: string;
      };
    };

    expect(res.status).toBe(200);
    expect(created.activePresetId).toBe(created.preset.presetId);
    expect(body.current).toMatchObject({
      presetId: created.preset.presetId,
      profileId: "openai",
      apiKey: "active-openai-key",
      selectedModelId: "gpt-5.1",
    });

    const provider = (await (
      await app.request("/settings/provider")
    ).json()) as {
      activePresetId: string;
      current: { presetId: string; profileId: string };
      presets: { id: string; profileId: string }[];
    };
    expect(provider.activePresetId).toBe(created.preset.presetId);
    expect(provider.current.profileId).toBe("openai");
    expect(
      provider.presets.find((preset) => preset.id !== created.preset.presetId)
        ?.profileId,
    ).toBe("anthropic");
  });

  it("returns provider preset route validation errors", async () => {
    const { app } = makeApp();

    const invalidCreateBody = await app.request("/settings/provider/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });
    expect(invalidCreateBody.status).toBe(400);
    expect(await invalidCreateBody.json()).toEqual({ error: "invalid_body" });

    const invalidName = await app.request("/settings/provider/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(invalidName.status).toBe(400);
    expect(await invalidName.json()).toEqual({ error: "invalid_preset_name" });

    const invalidCopySource = await app.request("/settings/provider/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyFromPresetId: 42 }),
    });
    expect(invalidCopySource.status).toBe(404);
    expect(await invalidCopySource.json()).toEqual({
      error: "preset_not_found",
    });

    const missingGet = await app.request("/settings/provider/presets/missing");
    expect(missingGet.status).toBe(404);
    expect(await missingGet.json()).toEqual({ error: "preset_not_found" });

    const invalidUpdateBody = await app.request(
      "/settings/provider/presets/missing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(true),
      },
    );
    expect(invalidUpdateBody.status).toBe(400);
    expect(await invalidUpdateBody.json()).toEqual({ error: "invalid_body" });

    const invalidProfile = await app.request(
      "/settings/provider/presets/missing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "bad-provider" }),
      },
    );
    expect(invalidProfile.status).toBe(400);
    expect(await invalidProfile.json()).toEqual({
      error: "invalid_profile_id",
    });

    const missingUpdate = await app.request(
      "/settings/provider/presets/missing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Missing" }),
      },
    );
    expect(missingUpdate.status).toBe(404);
    expect(await missingUpdate.json()).toEqual({ error: "preset_not_found" });

    const missingActivate = await app.request(
      "/settings/provider/presets/missing/activate",
      { method: "POST" },
    );
    expect(missingActivate.status).toBe(404);
    expect(await missingActivate.json()).toEqual({ error: "preset_not_found" });

    const missingDelete = await app.request("/settings/provider/presets/missing", {
      method: "DELETE",
    });
    expect(missingDelete.status).toBe(404);
    expect(await missingDelete.json()).toEqual({ error: "preset_not_found" });

    const current = (await (
      await app.request("/settings/provider")
    ).json()) as { activePresetId: string };
    const deleteLast = await app.request(
      `/settings/provider/presets/${current.activePresetId}`,
      { method: "DELETE" },
    );
    expect(deleteLast.status).toBe(400);
    expect(await deleteLast.json()).toEqual({
      error: "cannot_delete_last_preset",
    });
  });
});

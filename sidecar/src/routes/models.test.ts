import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import type { ModelFetchImpl } from "../services/modelCatalog";
import { createProviderSettings } from "../services/providerSettings";
import { buildModelsRoutes } from "./models";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const provider = createProviderSettings(db, {});
  const app = new Hono();
  return { app, provider };
}

describe("models routes", () => {
  it("GET /models returns data and uses selectedModelId as default when present", async () => {
    const { app, provider } = makeApp();
    provider.update({
      profileId: "openai",
      remoteModels: [
        { id: "model-a", displayName: "Model A", description: "Manual A" },
        { id: "model-b", displayName: "Model B", description: "Manual B" },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
      selectedModelId: "model-b",
    });
    app.route("/", buildModelsRoutes(provider));

    const res = await app.request("/models");
    const body = (await res.json()) as {
      data: { id: string }[];
      defaultModelId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.data.map((m) => m.id)).toEqual(["model-a", "model-b"]);
    expect(body.defaultModelId).toBe("model-b");
  });

  it("GET /models falls back to the first model when selectedModelId is absent from the list", async () => {
    const { app, provider } = makeApp();
    provider.update({
      profileId: "openai",
      remoteModels: [
        { id: "model-a", displayName: "Model A", description: "Manual A" },
        { id: "model-b", displayName: "Model B", description: "Manual B" },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-05-29T00:00:00.000Z",
      selectedModelId: "missing-model",
    });
    app.route("/", buildModelsRoutes(provider));

    const res = await app.request("/models");
    const body = (await res.json()) as { defaultModelId: string | null };

    expect(res.status).toBe(200);
    expect(body.defaultModelId).toBe("model-a");
  });

  it("GET /models returns null defaultModelId when there are no models", async () => {
    const { app, provider } = makeApp();
    provider.update({
      profileId: "custom",
    });
    app.route("/", buildModelsRoutes(provider));

    const res = await app.request("/models");
    const body = (await res.json()) as {
      data: { id: string }[];
      defaultModelId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.defaultModelId).toBe(null);
  });

  it("POST /models/refresh writes remote models and fetched timestamp", async () => {
    const { app, provider } = makeApp();
    provider.update({ profileId: "openai", apiKey: "openai-key" });
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ data: [{ id: "gpt-5.1" }, { id: "gpt-4.1-mini" }] }),
      );
    };
    app.route("/", buildModelsRoutes(provider, { fetchImpl }));

    const res = await app.request("/models/refresh", { method: "POST" });
    const body = (await res.json()) as {
      data: { id: string; displayName: string; description: string }[];
      defaultModelId: string | null;
      fetchedAt: string;
    };

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer openai-key",
    });
    expect(body.data.map((m) => m.id)).toEqual(["gpt-5.1", "gpt-4.1-mini"]);
    expect(body.defaultModelId).toBe("gpt-5.1");
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();
    expect(provider.current().remoteModelsFetchedAt).toBe(body.fetchedAt);
  });

  it("POST /models/refresh fetches custom remote OpenAI-compatible models", async () => {
    const { app, provider } = makeApp();
    provider.update({
      profileId: "custom",
      baseUrl: "https://custom.example/v1",
      apiKey: "custom-key",
    });
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async (url, init) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ data: [{ id: "custom-model" }] }));
    };
    app.route("/", buildModelsRoutes(provider, { fetchImpl }));

    const res = await app.request("/models/refresh", { method: "POST" });
    const body = (await res.json()) as {
      data: { id: string; displayName: string; description: string }[];
      defaultModelId: string | null;
      fetchedAt: string;
    };
    const current = provider.current();

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://custom.example/v1/models");
    expect(calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer custom-key",
    });
    expect(body.data).toEqual([
      {
        id: "custom-model",
        displayName: "custom-model",
        description: "Remote model",
      },
    ]);
    expect(body.defaultModelId).toBe("custom-model");
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();
    expect(current.remoteModelsFetchedAt).toBeTruthy();
    expect(current.models[0]?.id).toBe("custom-model");
  });

  it("POST /models/refresh returns 400 missing_api_key before fetching", async () => {
    const { app, provider } = makeApp();
    provider.update({ profileId: "openai", apiKey: "" });
    let fetchCalled = false;
    const fetchImpl: ModelFetchImpl = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.1" }] }));
    };
    app.route("/", buildModelsRoutes(provider, { fetchImpl }));

    const res = await app.request("/models/refresh", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_api_key" });
    expect(fetchCalled).toBe(false);
  });

  it("POST /models/refresh maps remote provider failures to 502", async () => {
    const { app, provider } = makeApp();
    provider.update({ profileId: "openai", apiKey: "openai-key" });
    const fetchImpl: ModelFetchImpl = async () =>
      new Response(JSON.stringify({ error: "upstream" }), { status: 500 });
    app.route("/", buildModelsRoutes(provider, { fetchImpl }));

    const res = await app.request("/models/refresh", { method: "POST" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "remote_models_failed" });
  });

  it("POST /models/refresh always fetches custom providers remotely", async () => {
    const { app, provider } = makeApp();
    provider.update({
      profileId: "custom",
      apiKey: "custom-key",
      baseUrl: "https://custom.example/v1",
    });
    const calls: Parameters<ModelFetchImpl>[] = [];
    const fetchImpl: ModelFetchImpl = async () => {
      calls.push(["https://custom.example/v1/models"]);
      return new Response(JSON.stringify({ data: [{ id: "remote" }] }));
    };
    app.route("/", buildModelsRoutes(provider, { fetchImpl }));

    const res = await app.request("/models/refresh", { method: "POST" });
    const body = (await res.json()) as { data: { id: string }[] };

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(body.data.map((m) => m.id)).toEqual(["remote"]);
  });
});

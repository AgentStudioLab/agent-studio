import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { createProviderSettings } from "../services/providerSettings";
import { createUserProfileSettings } from "../services/userProfileSettings";
import { buildSettingsRoutes } from "./settings";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const provider = createProviderSettings(db, {});
  const userProfile = createUserProfileSettings(db);
  const app = new Hono();
  app.route("/", buildSettingsRoutes(provider, userProfile));
  return { app, provider };
}

describe("settings provider routes", () => {
  it("GET /settings/provider returns the expanded built-in provider catalog", async () => {
    const { app } = makeApp();

    const res = await app.request("/settings/provider");
    const body = (await res.json()) as {
      builtIn: { id: string }[];
      current: { profileId: string };
    };

    expect(res.status).toBe(200);
    expect(body.current.profileId).toBe("anthropic");
    expect(body.builtIn.map((p) => p.id)).toContain("openai");
    expect(body.builtIn.map((p) => p.id)).toContain("gemini");
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
});

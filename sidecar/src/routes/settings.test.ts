import { afterEach, describe, expect, it, mock } from "bun:test";
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
  return app;
}

afterEach(() => {
  mock.restore();
});

describe("settings provider routes", () => {
  it("rejects array bodies when fetching provider models", async () => {
    const app = makeApp();

    const res = await app.request("/settings/provider/fetch-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("fetches provider models, persists them as custom models, and returns the selected provider", async () => {
    const app = makeApp();
    const fetchMock = mock(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://provider.example/v1/models");
      return new Response(
        JSON.stringify({
          data: [
            { id: "alpha-model", display_name: "Alpha Model" },
            { id: "beta-model" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request("/settings/provider/fetch-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "custom",
        baseUrl: "https://provider.example",
        apiKey: "secret-key",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      current: { profileId: string; models: unknown[] };
    };
    expect(body.current.profileId).toBe("custom");
    expect(body.current.models).toEqual([
      {
        id: "alpha-model",
        displayName: "Alpha Model",
        description: "Fetched from provider",
      },
      {
        id: "beta-model",
        displayName: "beta-model",
        description: "Fetched from provider",
      },
    ]);

    const provider = await app.request("/settings/provider");
    const providerBody = (await provider.json()) as {
      current: { profileId: string; models: unknown[] };
    };
    expect(providerBody.current.profileId).toBe("custom");
    expect(providerBody.current.models).toEqual(body.current.models);
  });

  it("fetches built-in provider models without converting the active preset to custom", async () => {
    const app = makeApp();
    const fetchMock = mock(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.openai.com/v1/models");
      return new Response(
        JSON.stringify({
          data: [{ id: "gpt-5.1", display_name: "GPT-5.1" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request("/settings/provider/fetch-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      current: {
        profileId: string;
        selectedModelId: string;
        remoteModelsFetchedAt: string;
        models: unknown[];
      };
    };
    expect(body.current.profileId).toBe("openai");
    expect(body.current.selectedModelId).toBe("gpt-5.1");
    expect(body.current.remoteModelsFetchedAt).not.toBe("");
    expect(body.current.models).toEqual([
      {
        id: "gpt-5.1",
        displayName: "GPT-5.1",
        description: "Fetched from provider",
      },
    ]);

    const provider = await app.request("/settings/provider");
    const providerBody = (await provider.json()) as {
      current: { profileId: string; models: unknown[] };
      presets: {
        profileId: string;
        selectedModelId: string;
        selectedModelLabel: string;
        remoteModelsFetchedAt: string;
      }[];
    };
    expect(providerBody.current.profileId).toBe("openai");
    expect(providerBody.current.models).toEqual(body.current.models);
    expect(providerBody.presets[0]).toMatchObject({
      profileId: "openai",
      selectedModelId: "gpt-5.1",
      selectedModelLabel: "GPT-5.1",
    });
    expect(providerBody.presets[0]?.remoteModelsFetchedAt).not.toBe("");
  });
});

import { afterEach, describe, expect, it, mock } from "bun:test";
import { createOfficialService } from "./officialService";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("officialService", () => {
  it("accepts http origins and strips trailing slashes", () => {
    const service = createOfficialService();

    const snapshot = service.setWebsiteOrigin("http://127.0.0.1:3000///");

    expect(snapshot.websiteOrigin).toBe("http://127.0.0.1:3000");
  });

  it("rejects non-http origins", () => {
    const service = createOfficialService();

    expect(() => service.setWebsiteOrigin("ftp://example.com")).toThrow(
      "invalid_official_service_origin",
    );
  });

  it("returns fallback models when no website origin is configured", () => {
    const service = createOfficialService();

    expect(service.getModels().length).toBeGreaterThan(0);
    expect(service.getSnapshot()).toMatchObject({
      websiteOrigin: "",
      source: "fallback",
    });
  });

  it("refreshes and caches models from the website desktop api", async () => {
    const fetchMock = mock(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://www.agentstudio.chat/api/desktop/ai/models");
      return Response.json({
        code: 0,
        message: "ok",
        data: {
          models: [
            {
              id: "gpt-5-mini",
              displayName: "GPT-5 mini",
              description: "Official model",
            },
          ],
        },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = createOfficialService();
    service.setWebsiteOrigin("https://www.agentstudio.chat");

    const snapshot = await service.refreshModels();

    expect(snapshot.source).toBe("remote");
    expect(snapshot.models).toEqual([
      {
        id: "gpt-5-mini",
        displayName: "GPT-5 mini",
        description: "Official model",
      },
    ]);
    expect(service.getModels().map((model) => model.id)).toEqual([
      "gpt-5-mini",
    ]);
  });
});

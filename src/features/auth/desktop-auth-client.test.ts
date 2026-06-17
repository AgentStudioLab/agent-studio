import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  buildAuthorizeUrl,
  consumeDesktopCredits,
  exchangeAuthCode,
  fetchDesktopMe,
  getWebsiteOrigin,
  syncOfficialService,
} from "./desktop-auth-client";

const originalFetch = globalThis.fetch;
const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;

function setWebsiteOrigin(origin: string): void {
  import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = origin;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("desktop auth client", () => {
  beforeEach(() => {
    setWebsiteOrigin("https://example.test/");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
  });

  it("builds authorize and API URLs without double slashes when origin has a trailing slash", async () => {
    const fetchSpy = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "access-token",
          expiresIn: 3600,
          refreshToken: "refresh-token",
          refreshExpiresIn: 7200,
          user: {
            id: "user-1",
            credits: { remainingCredits: 10 },
          },
        },
      }),
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    const authorizeUrl = buildAuthorizeUrl({
      state: "state",
      codeChallenge: "challenge",
      deviceId: "device-1",
    });
    await exchangeAuthCode({
      code: "code",
      codeVerifier: "verifier",
      deviceId: "device-1",
    });

    const fetchUrl = fetchSpy.mock.calls[0]?.[0];
    expect(new URL(authorizeUrl).pathname).toBe("/desktop/authorize");
    expect(authorizeUrl).toStartWith("https://example.test/desktop/authorize?");
    expect(fetchUrl).toBe("https://example.test/api/desktop/oauth/token");
  });

  it("uses a locale-prefixed authorize URL for non-default desktop languages", () => {
    const authorizeUrl = buildAuthorizeUrl({
      state: "state",
      codeChallenge: "challenge",
      deviceId: "device-1",
      locale: "en",
    });

    const url = new URL(authorizeUrl);
    expect(url.pathname).toBe("/en/desktop/authorize");
  });

  it("uses the unprefixed authorize URL for the default desktop language", () => {
    const authorizeUrl = buildAuthorizeUrl({
      state: "state",
      codeChallenge: "challenge",
      deviceId: "device-1",
      locale: "zh",
    });

    const url = new URL(authorizeUrl);
    expect(url.pathname).toBe("/desktop/authorize");
  });

  it("keeps authorize redirect URI but uses localhost for token loopback redirects", async () => {
    const fetchSpy = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "access-token",
          expiresIn: 3600,
          refreshToken: "refresh-token",
          refreshExpiresIn: 7200,
          user: {
            id: "user-1",
            credits: { remainingCredits: 10 },
          },
        },
      }),
    );
    globalThis.fetch = fetchSpy as typeof fetch;
    const redirectUri = "http://127.0.0.1:49152/auth/callback";

    const authorizeUrl = buildAuthorizeUrl({
      state: "state",
      codeChallenge: "challenge",
      deviceId: "device-1",
      redirectUri,
    });
    await exchangeAuthCode({
      code: "code",
      codeVerifier: "verifier",
      deviceId: "device-1",
      redirectUri,
    });

    const tokenBody = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(tokenBody.redirect_uri).toBe("http://localhost:49152/auth/callback");
  });

  it("resolves relative user avatar URLs against the configured website origin", async () => {
    const fetchSpy = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "access-token",
          expiresIn: 3600,
          refreshToken: "refresh-token",
          refreshExpiresIn: 7200,
          user: {
            id: "user-1",
            image: "/uploads/avatar.png",
            credits: { remainingCredits: 10 },
          },
        },
      }),
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    const result = await exchangeAuthCode({
      code: "code",
      codeVerifier: "verifier",
      deviceId: "device-1",
    });

    expect(result.user.image).toBe("https://example.test/uploads/avatar.png");
  });

  it("keeps an empty desktop user avatar empty so the UI can show the default avatar", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          id: "user-1",
          image: "   ",
          credits: { remainingCredits: 10 },
        },
      }),
    ) as typeof fetch;

    const user = await fetchDesktopMe("access-token");

    expect(user.image).toBeNull();
  });

  it("requires the website origin to be configured by environment", () => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "";

    expect(() => getWebsiteOrigin()).toThrow("desktop_api_missing_website_origin");
  });

  it("syncs the official website origin to the sidecar", async () => {
    const sidecarFetch = mock(async () =>
      jsonResponse({
        officialService: {
          websiteOrigin: "https://example.test",
        },
      }),
    );

    await syncOfficialService(undefined, sidecarFetch as never);

    expect(sidecarFetch).toHaveBeenCalledWith(
      "/settings/official-service",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteOrigin: "https://example.test/" }),
      }),
    );
  });

  it("throws a stable status error for non-JSON HTTP errors", async () => {
    globalThis.fetch = mock(async () => new Response("<h1>oops</h1>", { status: 500 })) as typeof fetch;

    await expect(
      exchangeAuthCode({
        code: "code",
        codeVerifier: "verifier",
        deviceId: "device-1",
      }),
    ).rejects.toThrow("desktop_api_500");
  });

  it("rejects malformed token responses before creating token expiry timestamps", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          refreshExpiresIn: 7200,
          user: {
            id: "user-1",
            credits: { remainingCredits: 10 },
          },
        },
      }),
    ) as typeof fetch;

    await expect(
      exchangeAuthCode({
        code: "code",
        codeVerifier: "verifier",
        deviceId: "device-1",
      }),
    ).rejects.toThrow("desktop_api_invalid_token_response");
  });

  it("rejects token responses with malformed user credits", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "access-token",
          expiresIn: 3600,
          refreshToken: "refresh-token",
          refreshExpiresIn: 7200,
          user: {
            id: "user-1",
          },
        },
      }),
    ) as typeof fetch;

    await expect(
      exchangeAuthCode({
        code: "code",
        codeVerifier: "verifier",
        deviceId: "device-1",
      }),
    ).rejects.toThrow("desktop_api_invalid_token_response");
  });

  it("fails fast and does not fetch when consume amount is invalid", async () => {
    const fetchSpy = mock(async () => jsonResponse({ code: 0, data: { remainingCredits: 9 } }));
    globalThis.fetch = fetchSpy as typeof fetch;

    await expect(
      consumeDesktopCredits({
        accessToken: "access-token",
        amount: Number.NaN,
        scene: "test",
        idempotencyKey: "key-1",
      }),
    ).rejects.toThrow("desktop_api_invalid_credit_amount");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  buildAuthorizeUrl,
  consumeDesktopCredits,
  exchangeAuthCode,
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

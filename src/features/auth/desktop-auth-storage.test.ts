import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { loadStoredAuthTokens, saveStoredAuthTokens } from "./desktop-auth-storage";

describe("desktop auth storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("clears corrupt browser fallback storage and returns null", async () => {
    window.localStorage.setItem("desktop_auth", "{not-json");

    await expect(loadStoredAuthTokens()).resolves.toBeNull();
    expect(window.localStorage.getItem("desktop_auth")).toBeNull();
  });

  it("clears legacy-shaped browser fallback storage and returns null", async () => {
    window.localStorage.setItem(
      "desktop_auth",
      JSON.stringify({
        access_token: "old-access-token",
        access_token_expires_at: Date.now() + 1000,
        refresh_token: "old-refresh-token",
        refresh_token_expires_at: Date.now() + 2000,
      }),
    );

    await expect(loadStoredAuthTokens()).resolves.toBeNull();
    expect(window.localStorage.getItem("desktop_auth")).toBeNull();
  });

  it("loads valid browser fallback tokens", async () => {
    const tokens = {
      accessToken: "access-token",
      accessTokenExpiresAt: Date.now() + 1000,
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: Date.now() + 2000,
    };

    await saveStoredAuthTokens(tokens);

    await expect(loadStoredAuthTokens()).resolves.toEqual(tokens);
  });
});

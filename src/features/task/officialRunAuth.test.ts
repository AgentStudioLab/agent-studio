import { afterEach, describe, expect, it, mock } from "bun:test";
import type { AuthContextValue } from "@/features/auth/AuthContext";
import {
  OFFICIAL_PROVIDER_ID,
  buildOfficialRunAuthFields,
} from "./officialRunAuth";

const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;

function makeAuth() {
  return {
    ensureAuthenticated: mock(async () => ({
      tokens: {
        accessToken: "session-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      },
      user: {
        id: "user-1",
        credits: { remainingCredits: 3 },
      },
    })),
    getValidAccessToken: mock(async () => "fresh-access-token"),
  } satisfies Pick<
    AuthContextValue,
    "ensureAuthenticated" | "getValidAccessToken"
  >;
}

describe("official run auth", () => {
  afterEach(() => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
  });

  it("requires website auth and returns token fields for the official provider", async () => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    const auth = makeAuth();

    const fields = await buildOfficialRunAuthFields({
      auth,
      providerSelection: { providerId: OFFICIAL_PROVIDER_ID, modelId: "gpt-5.1" },
      defaultSelection: null,
    });

    expect(auth.ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(auth.getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(fields).toEqual({
      officialAuthToken: "fresh-access-token",
      officialWebsiteOrigin: "https://example.test",
    });
  });

  it("uses the default provider selection when the user did not explicitly choose a model", async () => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    const auth = makeAuth();

    const fields = await buildOfficialRunAuthFields({
      auth,
      providerSelection: null,
      defaultSelection: { providerId: OFFICIAL_PROVIDER_ID, modelId: "gpt-5.1" },
    });

    expect(auth.ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(fields.officialAuthToken).toBe("fresh-access-token");
  });

  it("does not authenticate custom provider runs", async () => {
    const auth = makeAuth();

    const fields = await buildOfficialRunAuthFields({
      auth,
      providerSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
      defaultSelection: { providerId: OFFICIAL_PROVIDER_ID, modelId: "gpt-5.1" },
    });

    expect(auth.ensureAuthenticated).not.toHaveBeenCalled();
    expect(auth.getValidAccessToken).not.toHaveBeenCalled();
    expect(fields).toEqual({});
  });
});

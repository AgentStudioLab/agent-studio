import { afterEach, describe, expect, it, mock } from "bun:test";
import type { AuthContextValue } from "@/features/auth/AuthContext";
import { OFFICIAL_PROVIDER_ID } from "./officialRunAuth";
import { buildProviderRunOptions } from "./providerRunOptions";

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

afterEach(() => {
  import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
});

describe("buildProviderRunOptions", () => {
  it("includes the default provider selection when the user did not explicitly pick a model", async () => {
    const result = await buildProviderRunOptions({
      auth: makeAuth(),
      providerSelection: null,
      resolveDefaultProviderSelection: mock(async () => ({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      })),
    });

    expect(result.providerSelection).toEqual({
      providerId: "conn-sf",
      modelId: "deepseek-ai/DeepSeek-V3.2",
    });
  });

  it("includes the default official selection together with official auth fields", async () => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    const auth = makeAuth();
    const onOfficialRunPending = mock(() => {});

    const result = await buildProviderRunOptions({
      auth,
      providerSelection: null,
      resolveDefaultProviderSelection: mock(async () => ({
        providerId: OFFICIAL_PROVIDER_ID,
        modelId: "gpt-5.1",
      })),
      onOfficialRunPending,
    });

    expect(result).toMatchObject({
      providerSelection: {
        providerId: OFFICIAL_PROVIDER_ID,
        modelId: "gpt-5.1",
      },
      officialAuthToken: "fresh-access-token",
      officialWebsiteOrigin: "https://example.test",
    });
    expect(auth.ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(onOfficialRunPending).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit model selection over the default selection", async () => {
    const resolveDefaultProviderSelection = mock(async () => ({
      providerId: OFFICIAL_PROVIDER_ID,
      modelId: "gpt-5.1",
    }));

    const result = await buildProviderRunOptions({
      auth: makeAuth(),
      providerSelection: {
        providerId: "conn-openai",
        modelId: "gpt-5.1",
      },
      resolveDefaultProviderSelection,
    });

    expect(result.providerSelection).toEqual({
      providerId: "conn-openai",
      modelId: "gpt-5.1",
    });
    expect(resolveDefaultProviderSelection).not.toHaveBeenCalled();
  });
});

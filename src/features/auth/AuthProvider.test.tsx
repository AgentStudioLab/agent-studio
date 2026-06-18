import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DesktopAuthTokens, DesktopUser } from "./auth-types";

const open = mock(async (_url: string): Promise<void> => {});
const invoke = mock(async (_command: string): Promise<string | null> => null);
let eventHandler: ((event: { payload: string }) => void | Promise<void>) | null = null;
const unlisten = mock(() => {});
const listen = mock(
  async (
    _eventName: string,
    handler: (event: { payload: string }) => void | Promise<void>,
  ): Promise<() => void> => {
    eventHandler = handler;
    return unlisten;
  },
);

const loadStoredAuthTokens = mock(async (): Promise<DesktopAuthTokens | null> => null);
const saveStoredAuthTokens = mock(async (_tokens: DesktopAuthTokens): Promise<void> => {});
const clearStoredAuthTokens = mock(async (): Promise<void> => {});
const fetchSidecar = mock(async (): Promise<Response> =>
  jsonResponse({ officialService: { websiteOrigin: "https://example.test" } }),
);

const createPkcePair = mock(async () => ({
  verifier: "verifier-1",
  challenge: "challenge-1",
}));
const randomBase64Url = mock((_byteLength = 32) => "random");
let currentLanguage = "zh";

mock.module("@tauri-apps/plugin-shell", () => ({ open }));
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen }));
mock.module("@/lib/sidecar-client", () => ({ fetchSidecar }));
mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    i18n: { language: currentLanguage },
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "settings.provider.title": "Model Provider",
        "settings.provider.description": "Manage provider connections",
        "settings.provider.connectionsTitle": "Provider connections",
        "settings.provider.addModel": "Add model",
        "settings.provider.edit": "Edit",
        "settings.provider.delete": "Delete",
        "settings.provider.cancel": "Cancel",
        "settings.provider.defaultModelBadge": "Default",
        "settings.provider.setDefault": "Set default",
        "settings.provider.enabledModels": "Enabled models",
        "settings.provider.disabled": "Disabled",
        "settings.provider.missingApiKey": "Missing key",
        "settings.provider.managed": "Official",
        "settings.provider.connectionAddTitle": "Add model provider",
        "settings.provider.connectionEditTitle": "Edit model provider",
        "settings.provider.connectionDialogDescription": "Configure endpoint",
        "settings.provider.connectionNameLabel": "Connection name",
        "settings.provider.profileLabel": "Provider",
        "settings.provider.profile.custom": "Custom",
        "settings.provider.customProtocolLabel": "Protocol",
        "settings.provider.customProtocolOpenAI": "OpenAI-compatible",
        "settings.provider.customProtocolAnthropic": "Anthropic Messages-compatible",
        "settings.provider.baseUrlLabel": "Base URL",
        "settings.provider.baseUrlPlaceholder": "https://api.example.com",
        "settings.provider.apiKeyLabel": "API Key",
        "settings.apiKey.placeholder": "sk-ant-...",
        "settings.provider.showApiKey": "Show API key",
        "settings.provider.hideApiKey": "Hide API key",
        "settings.provider.connectionEnabled": "Enabled for conversations",
        "settings.provider.refreshModels": "Refresh models",
        "settings.provider.refreshingModels": "Refreshing...",
        "settings.provider.refreshSuccess": "Model list refreshed",
        "settings.provider.refreshError": "Model refresh failed",
        "settings.provider.refreshMissingKey": "Enter an API key first",
        "settings.provider.refreshUnsupported": "Unsupported",
        "settings.provider.save": "Save",
        "settings.provider.saved": "Saved",
        "settings.provider.saveError": "Save failed",
        "settings.provider.connectionDeleteLastError": "Keep at least one connection",
        "settings.provider.modelsLabel": "Models",
        "settings.provider.modelSearch": "Search models",
        "settings.provider.modelEmpty": "No models found",
        "settings.provider.defaultModelLabel": "Default model",
        "task.askUser.pageOf": `${String(params?.page ?? "")} of ${String(params?.total ?? "")}`,
        "task.askUser.somethingElse": "Something else",
        "task.askUser.somethingElsePlaceholder": "type",
        "task.askUser.selectedCount": `${String(params?.count ?? "")} selected`,
        "task.askUser.skip": "Skip",
        "task.askUser.send": "Send",
        "task.askUser.next": "Next",
        "task.askUser.close": "Close",
        "task.askUser.prevPage": "Prev",
        "task.askUser.nextPage": "Next page",
        "task.error.insufficientCredits":
          "Not enough credits. Please top up on the website.",
        "task.error.topUpCredits": "Top up on the website",
      };
      return translations[key] ?? key;
    },
  }),
}));
mock.module("./desktop-auth-storage", () => ({
  clearStoredAuthTokens,
  loadStoredAuthTokens,
  saveStoredAuthTokens,
}));
mock.module("./pkce", () => ({
  createPkcePair,
  randomBase64Url,
}));

const signedInUser: DesktopUser = {
  id: "user-1",
  name: "Ada",
  email: "ada@example.test",
  image: null,
  credits: { remainingCredits: 42 },
};

const signedInTokens: DesktopAuthTokens = {
  accessToken: "server-access-token",
  accessTokenExpiresAt: Date.now() + 3_600_000,
  refreshToken: "server-refresh-token",
  refreshTokenExpiresAt: Date.now() + 7_200_000,
};

const originalFetch = globalThis.fetch;
const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;
let queryClient: QueryClient;

function wrap({ children }: { children: ReactNode }) {
  const { AuthProvider } = require("./AuthProvider") as typeof import("./AuthProvider");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function useAuthForTest() {
  const { useAuth } = require("./useAuth") as typeof import("./useAuth");
  return useAuth();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function expectSignedInTokens(tokens: DesktopAuthTokens | null) {
  expect(tokens).toMatchObject({
    accessToken: signedInTokens.accessToken,
    refreshToken: signedInTokens.refreshToken,
  });
  expect(tokens?.accessTokenExpiresAt).toBeGreaterThan(Date.now());
  expect(tokens?.refreshTokenExpiresAt).toBeGreaterThan(Date.now());
}

function createExpiredAccessTokens(): DesktopAuthTokens {
  return {
    accessToken: "expired-access-token",
    accessTokenExpiresAt: Date.now() - 1_000,
    refreshToken: "stored-refresh-token",
    refreshTokenExpiresAt: Date.now() + 7_200_000,
  };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    window.localStorage.clear();
    currentLanguage = "zh";
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    globalThis.fetch = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: signedInTokens.accessToken,
          expiresIn: 3600,
          refreshToken: signedInTokens.refreshToken,
          refreshExpiresIn: 7200,
          user: signedInUser,
        },
      }),
    ) as typeof fetch;
    eventHandler = null;
    open.mockClear();
    invoke.mockClear();
    invoke.mockImplementation(async () => null);
    listen.mockClear();
    listen.mockImplementation(async (_eventName, handler) => {
      eventHandler = handler;
      return unlisten;
    });
    unlisten.mockClear();
    loadStoredAuthTokens.mockClear();
    loadStoredAuthTokens.mockImplementation(async () => null);
    saveStoredAuthTokens.mockClear();
    saveStoredAuthTokens.mockImplementation(async () => {});
    clearStoredAuthTokens.mockClear();
    clearStoredAuthTokens.mockImplementation(async () => {});
    fetchSidecar.mockClear();
    fetchSidecar.mockImplementation(async () =>
      jsonResponse({ officialService: { websiteOrigin: "https://example.test" } }),
    );
    createPkcePair.mockClear();
    createPkcePair.mockImplementation(async () => ({
      verifier: "verifier-1",
      challenge: "challenge-1",
    }));
    randomBase64Url.mockClear();
    let randomIndex = 0;
    randomBase64Url.mockImplementation(() => {
      const values = ["device-1", "state-1"];
      return values[randomIndex++] ?? `random-${randomIndex}`;
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    window.localStorage.clear();
    globalThis.fetch = originalFetch;
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
  });

  it("exposes signed-out status to consumers after startup without tokens", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(result.current.user).toBeNull();
    expect(result.current.tokens).toBeNull();
  });

  it("refreshes cached model picker data after syncing the official service", async () => {
    queryClient.setQueryData(["provider"], {
      enabledModels: [
        {
          providerId: "official",
          modelId: "gpt-5.1",
          modelLabel: "GPT-5.1",
          modelDescription: "Official fallback model",
        },
      ],
    });
    queryClient.setQueryData(["models"], {
      data: [
        {
          id: "gpt-5.1",
          displayName: "GPT-5.1",
          description: "Official fallback model",
        },
      ],
    });

    renderHook(() => useAuthForTest(), { wrapper: wrap });

    await waitFor(() => expect(fetchSidecar).toHaveBeenCalled());
    await waitFor(() =>
      expect(queryClient.getQueryState(["provider"])?.isInvalidated).toBe(true),
    );
    expect(queryClient.getQueryState(["models"])?.isInvalidated).toBe(true);
  });

  it("opens the authorize URL with generated PKCE state and a stable device id", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });

    const deviceId = window.localStorage.getItem("agent_studio_device_id");
    const openedUrl = open.mock.calls[0]?.[0];
    expect(deviceId).toBe("device-1");
    expect(openedUrl).toBeTruthy();
    const url = new URL(openedUrl as string);
    expect(url.origin).toBe("https://example.test");
    expect(url.pathname).toBe("/desktop/authorize");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("device_id")).toBe(deviceId);
    expect(result.current.loginRequest?.authorizeUrl).toBe(openedUrl);
    expect(result.current.loginError).toBeNull();
  });

  it("opens the English website authorization page when the desktop language is English", async () => {
    currentLanguage = "en";
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });

    const url = new URL(open.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/en/desktop/authorize");
  });

  it("uses a loopback redirect URI from Tauri when available in development", async () => {
    invoke.mockImplementation(async (command) => {
      if (command === "get_desktop_auth_redirect_uri") {
        return "http://127.0.0.1:49152/auth/callback";
      }
      return null;
    });
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "http://127.0.0.1:49152/auth/callback?code=code-1&state=state-1",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    const authorizeUrl = new URL(open.mock.calls[0]?.[0] as string);
    const fetchCall = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const tokenBody = JSON.parse((fetchCall?.[1] as RequestInit).body as string);
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:49152/auth/callback",
    );
    expect(tokenBody.redirect_uri).toBe("http://localhost:49152/auth/callback");
  });

  it("reopens the current browser authorization without creating a new login request", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    const openedUrl = open.mock.calls[0]?.[0] as string;

    await act(async () => {
      await result.current.reopenLogin();
    });

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[0]).toBe(openedUrl);
    expect(createPkcePair).toHaveBeenCalledTimes(1);
    expect(result.current.loginRequest?.authorizeUrl).toBe(openedUrl);
  });

  it("cancels a pending browser authorization and ignores its later callback", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      result.current.cancelLogin();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });

    expect(result.current.loginRequest).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signed-out");
  });

  it("exchanges a matching callback for tokens and signs in", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(result.current.loginRequest).toBeNull();
    const fetchCall = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    expect(fetchCall?.[0]).toBe("https://example.test/api/desktop/oauth/token");
    expect(JSON.parse((fetchCall?.[1] as RequestInit).body as string)).toMatchObject({
      code: "code-1",
      code_verifier: "verifier-1",
      device_id: "device-1",
      grant_type: "authorization_code",
    });
    expectSignedInTokens(saveStoredAuthTokens.mock.calls[0]?.[0] ?? null);
    expect(result.current.user).toEqual(signedInUser);
    expectSignedInTokens(result.current.tokens);
  });

  it("does not let stale bootstrap sign-out overwrite a successful callback", async () => {
    const bootstrap = createDeferred<DesktopAuthTokens | null>();
    loadStoredAuthTokens.mockImplementationOnce(async () => bootstrap.promise);
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    await act(async () => {
      bootstrap.resolve(null);
      await bootstrap.promise;
    });

    expect(result.current.status).toBe("signed-in");
    expect(result.current.user).toEqual(signedInUser);
    expectSignedInTokens(result.current.tokens);
  });

  it("does not let a stale refresh write tokens after logout", async () => {
    const refresh = createDeferred<Response>();
    let tokenExchangeResolved = false;
    globalThis.fetch = mock(async (input) => {
      if (String(input).endsWith("/api/desktop/oauth/token")) {
        tokenExchangeResolved = true;
        return jsonResponse({
          code: 0,
          data: {
            accessToken: "server-access-token",
            expiresIn: 0,
            refreshToken: signedInTokens.refreshToken,
            refreshExpiresIn: 7200,
            user: signedInUser,
          },
        });
      }
      if (String(input).endsWith("/api/desktop/oauth/refresh")) {
        return refresh.promise;
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(tokenExchangeResolved).toBe(true);

    const validTokenPromise = result.current.getValidAccessToken().catch((error) => error);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.test/api/desktop/oauth/refresh",
        expect.any(Object),
      );
    });
    const initialSaveCount = saveStoredAuthTokens.mock.calls.length;

    await act(async () => {
      await result.current.logout();
    });
    refresh.resolve(
      jsonResponse({
        code: 0,
        data: { accessToken: "late-access-token", expiresIn: 3600 },
      }),
    );
    const staleError = await validTokenPromise;

    expect(staleError).toBeInstanceOf(Error);
    expect(staleError.message).toBe("auth_stale");
    expect(result.current.status).toBe("signed-out");
    expect(result.current.tokens).toBeNull();
    expect(saveStoredAuthTokens).toHaveBeenCalledTimes(initialSaveCount);
  });

  it("serializes storage so logout clear wins over an in-flight refresh save", async () => {
    const save = createDeferred<void>();
    let saveStarted = false;
    saveStoredAuthTokens.mockImplementationOnce(async () => {});
    saveStoredAuthTokens.mockImplementationOnce(async () => {
      saveStarted = true;
      return save.promise;
    });
    globalThis.fetch = mock(async (input) => {
      if (String(input).endsWith("/api/desktop/oauth/token")) {
        return jsonResponse({
          code: 0,
          data: {
            accessToken: "server-access-token",
            expiresIn: 0,
            refreshToken: signedInTokens.refreshToken,
            refreshExpiresIn: 7200,
            user: signedInUser,
          },
        });
      }
      if (String(input).endsWith("/api/desktop/oauth/refresh")) {
        return jsonResponse({
          code: 0,
          data: { accessToken: "refresh-save-race-token", expiresIn: 3600 },
        });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    const validTokenPromise = result.current.getValidAccessToken().catch((error) => error);
    await waitFor(() => expect(saveStarted).toBe(true));
    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = result.current.logout();
    });
    expect(clearStoredAuthTokens).not.toHaveBeenCalled();

    save.resolve();
    const staleError = await validTokenPromise;
    await act(async () => {
      await logoutPromise;
    });

    expect(staleError).toBeInstanceOf(Error);
    expect(staleError.message).toBe("auth_stale");
    expect(clearStoredAuthTokens).toHaveBeenCalledTimes(1);
    expect(saveStoredAuthTokens).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("signed-out");
    expect(result.current.tokens).toBeNull();
  });

  it("does not let queued logout clear invalidate a newer callback login", async () => {
    const clear = createDeferred<void>();
    clearStoredAuthTokens.mockImplementationOnce(async () => clear.promise);
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = result.current.logout();
    });
    await waitFor(() => expect(clearStoredAuthTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback?code=code-1&state=state-1",
      });
    });

    clear.resolve();
    await act(async () => {
      await logoutPromise;
    });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    expect(result.current.status).toBe("signed-in");
    expect(result.current.user).toEqual(signedInUser);
    expectSignedInTokens(result.current.tokens);
  });

  it("keeps an existing session when refreshUser hits a transient API failure", async () => {
    loadStoredAuthTokens.mockImplementationOnce(async () => signedInTokens);
    globalThis.fetch = mock(async () => jsonResponse({ code: 0, data: signedInUser })) as typeof fetch;
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    globalThis.fetch = mock(async () => new Response("upstream", { status: 503 })) as typeof fetch;
    await expect(result.current.refreshUser()).rejects.toThrow("desktop_api_503");

    expect(result.current.status).toBe("signed-in");
    expect(result.current.user).toEqual(signedInUser);
    expectSignedInTokens(result.current.tokens);
    expect(clearStoredAuthTokens).not.toHaveBeenCalled();
  });

  it("ignores callbacks with the wrong desktop URL shape", async () => {
    const { result } = renderHook(() => useAuthForTest(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await eventHandler?.({
        payload: "agent-studio://auth/callback/extra?code=code-1&state=state-1",
      });
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signed-out");
  });
});

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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

const createPkcePair = mock(async () => ({
  verifier: "verifier-1",
  challenge: "challenge-1",
}));
const randomBase64Url = mock((_byteLength = 32) => "random");

mock.module("@tauri-apps/plugin-shell", () => ({ open }));
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen }));
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

function wrap({ children }: { children: ReactNode }) {
  const { AuthProvider } = require("./AuthProvider") as typeof import("./AuthProvider");
  return <AuthProvider>{children}</AuthProvider>;
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

describe("AuthProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});

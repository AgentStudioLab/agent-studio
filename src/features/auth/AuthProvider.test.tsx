import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DesktopUser } from "./auth-types";

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

mock.module("@tauri-apps/plugin-shell", () => ({ open }));
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen }));

const originalFetch = globalThis.fetch;
const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;

const signedInUser: DesktopUser = {
  id: "user-1",
  name: "Ada",
  email: "ada@example.test",
  image: null,
  credits: { remainingCredits: 42 },
};

function wrap({ children }: { children: ReactNode }) {
  const { AuthProvider } = require("./AuthProvider") as typeof import("./AuthProvider");
  return <AuthProvider>{children}</AuthProvider>;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    globalThis.fetch = mock(async () =>
      jsonResponse({
        code: 0,
        data: {
          accessToken: "server-access-token",
          expiresIn: 3600,
          refreshToken: "server-refresh-token",
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
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    globalThis.fetch = originalFetch;
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
  });

  it("exposes signed-out status to consumers after startup without tokens", async () => {
    const { useAuth } = require("./useAuth") as typeof import("./useAuth");
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(result.current.user).toBeNull();
    expect(result.current.tokens).toBeNull();
  });

  it("opens the authorize URL with generated PKCE state and a stable device id", async () => {
    const { useAuth } = require("./useAuth") as typeof import("./useAuth");
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });

    const deviceId = window.localStorage.getItem("agent_studio_device_id");
    const openedUrl = open.mock.calls[0]?.[0];
    expect(deviceId).toBeTruthy();
    expect(openedUrl).toBeTruthy();
    const url = new URL(openedUrl as string);
    expect(url.origin).toBe("https://example.test");
    expect(url.pathname).toBe("/desktop/authorize");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("device_id")).toBe(deviceId);
  });

  it("exchanges a matching callback for tokens and signs in", async () => {
    const { useAuth } = require("./useAuth") as typeof import("./useAuth");
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.login();
    });
    const openedUrl = new URL(open.mock.calls[0]?.[0] as string);
    const state = openedUrl.searchParams.get("state");
    const deviceId = openedUrl.searchParams.get("device_id");
    await act(async () => {
      await eventHandler?.({
        payload: `agent-studio://auth/callback?code=code-1&state=${state}`,
      });
    });

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    const fetchCall = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    expect(fetchCall?.[0]).toBe("https://example.test/api/desktop/oauth/token");
    expect(JSON.parse((fetchCall?.[1] as RequestInit).body as string)).toMatchObject({
      code: "code-1",
      device_id: deviceId,
      grant_type: "authorization_code",
    });
    expect(result.current.user).toEqual(signedInUser);
    expect(result.current.tokens?.accessToken).toBe("server-access-token");
    expect(result.current.tokens?.refreshToken).toBe("server-refresh-token");
  });
});

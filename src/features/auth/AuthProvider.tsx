import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthStatus, DesktopAuthSession, DesktopAuthTokens, DesktopUser } from "./auth-types";
import {
  buildAuthorizeUrl,
  exchangeAuthCode,
  fetchDesktopMe,
  refreshAccessToken,
  revokeRefreshToken,
} from "./desktop-auth-client";
import {
  clearStoredAuthTokens,
  loadStoredAuthTokens,
  saveStoredAuthTokens,
} from "./desktop-auth-storage";
import { createPkcePair, randomBase64Url } from "./pkce";

const DEVICE_ID_STORAGE_KEY = "agent_studio_device_id";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface PendingLogin {
  state: string;
  verifier: string;
  deviceId: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: DesktopUser | null;
  tokens: DesktopAuthTokens | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  ensureAuthenticated: () => Promise<DesktopAuthSession>;
  refreshUser: () => Promise<DesktopUser>;
  getValidAccessToken: () => Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isRefreshTokenExpired(tokens: DesktopAuthTokens, now = Date.now()): boolean {
  return tokens.refreshTokenExpiresAt <= now;
}

function isAccessTokenExpiring(tokens: DesktopAuthTokens, now = Date.now()): boolean {
  return tokens.accessTokenExpiresAt <= now + TOKEN_REFRESH_BUFFER_MS;
}

function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const deviceId = randomBase64Url(32);
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

function parseCallbackUrl(callbackUrl: string): { code: string; state: string } | null {
  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return null;
    return { code, state };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<DesktopUser | null>(null);
  const [tokens, setTokens] = useState<DesktopAuthTokens | null>(null);
  const tokensRef = useRef<DesktopAuthTokens | null>(null);
  const userRef = useRef<DesktopUser | null>(null);
  const pendingLoginRef = useRef<PendingLogin | null>(null);
  const authVersionRef = useRef(0);

  const applySignedOut = useCallback(() => {
    authVersionRef.current += 1;
    tokensRef.current = null;
    userRef.current = null;
    setTokens(null);
    setUser(null);
    setStatus("signed-out");
  }, []);

  const applySession = useCallback((nextTokens: DesktopAuthTokens, nextUser: DesktopUser) => {
    authVersionRef.current += 1;
    tokensRef.current = nextTokens;
    userRef.current = nextUser;
    setTokens(nextTokens);
    setUser(nextUser);
    setStatus("signed-in");
  }, []);

  const clearSession = useCallback(async () => {
    await clearStoredAuthTokens();
    applySignedOut();
  }, [applySignedOut]);

  const clearSessionBestEffort = useCallback(async () => {
    try {
      await clearSession();
    } catch {
      applySignedOut();
    }
  }, [applySignedOut, clearSession]);

  const refreshTokens = useCallback(async (currentTokens: DesktopAuthTokens) => {
    const refreshed = await refreshAccessToken(currentTokens.refreshToken);
    const nextTokens = { ...currentTokens, ...refreshed };
    await saveStoredAuthTokens(nextTokens);
    tokensRef.current = nextTokens;
    setTokens(nextTokens);
    return nextTokens;
  }, []);

  const getValidAccessToken = useCallback(async () => {
    const currentTokens = tokensRef.current;
    if (!currentTokens || isRefreshTokenExpired(currentTokens)) {
      await clearSession();
      throw new Error("auth_required");
    }

    if (!isAccessTokenExpiring(currentTokens)) {
      return currentTokens.accessToken;
    }

    try {
      const nextTokens = await refreshTokens(currentTokens);
      return nextTokens.accessToken;
    } catch (error) {
      await clearSession();
      throw error;
    }
  }, [clearSession, refreshTokens]);

  const refreshUser = useCallback(async () => {
    try {
      const accessToken = await getValidAccessToken();
      const nextUser = await fetchDesktopMe(accessToken);
      userRef.current = nextUser;
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      await clearSession();
      throw error;
    }
  }, [clearSession, getValidAccessToken]);

  const login = useCallback(async () => {
    const deviceId = getDeviceId();
    const [{ verifier, challenge }, state] = await Promise.all([
      createPkcePair(),
      Promise.resolve(randomBase64Url(32)),
    ]);

    pendingLoginRef.current = { state, verifier, deviceId };
    const authorizeUrl = buildAuthorizeUrl({
      state,
      codeChallenge: challenge,
      deviceId,
    });
    await open(authorizeUrl);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokensRef.current?.refreshToken;
    await clearSession();
    if (!refreshToken) return;

    try {
      await revokeRefreshToken(refreshToken);
    } catch {
      // Revocation is best-effort; local state is already cleared.
    }
  }, [clearSession]);

  const ensureAuthenticated = useCallback(async () => {
    if (tokensRef.current && userRef.current && status === "signed-in") {
      return { tokens: tokensRef.current, user: userRef.current };
    }

    await login();
    throw new Error("auth_required");
  }, [login, status]);

  const handleCallback = useCallback(
    async (callbackUrl: string) => {
      const callback = parseCallbackUrl(callbackUrl);
      const pendingLogin = pendingLoginRef.current;
      if (!callback || !pendingLogin || callback.state !== pendingLogin.state) {
        return;
      }

      pendingLoginRef.current = null;
      try {
        const session = await exchangeAuthCode({
          code: callback.code,
          codeVerifier: pendingLogin.verifier,
          deviceId: pendingLogin.deviceId,
        });
        await saveStoredAuthTokens(session.tokens);
        applySession(session.tokens, session.user);
      } catch {
        await clearSessionBestEffort();
      }
    },
    [applySession, clearSessionBestEffort],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const bootstrapVersion = authVersionRef.current;
      const isStale = () => cancelled || authVersionRef.current !== bootstrapVersion;
      try {
        const storedTokens = await loadStoredAuthTokens();
        if (isStale()) return;

        if (!storedTokens || isRefreshTokenExpired(storedTokens)) {
          if (storedTokens) {
            await clearStoredAuthTokens();
          }
          if (!isStale()) applySignedOut();
          return;
        }

        let usableTokens = storedTokens;
        if (isAccessTokenExpiring(storedTokens)) {
          const refreshed = await refreshAccessToken(storedTokens.refreshToken);
          if (isStale()) return;
          usableTokens = { ...storedTokens, ...refreshed };
          await saveStoredAuthTokens(usableTokens);
          if (isStale()) return;
        }

        const nextUser = await fetchDesktopMe(usableTokens.accessToken);
        if (!isStale()) applySession(usableTokens, nextUser);
      } catch {
        if (!isStale()) {
          await clearSessionBestEffort();
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySession, applySignedOut, clearSessionBestEffort, refreshTokens]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void listen<string>("desktop-auth-callback", (event) => {
      void handleCallback(event.payload).catch(() => {});
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch(() => {});

    void invoke<string | null>("get_pending_auth_callback")
      .then((callbackUrl) => {
        if (!cancelled && callbackUrl) {
          void handleCallback(callbackUrl).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [handleCallback]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      tokens,
      login,
      logout,
      ensureAuthenticated,
      refreshUser,
      getValidAccessToken,
    }),
    [ensureAuthenticated, getValidAccessToken, login, logout, refreshUser, status, tokens, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

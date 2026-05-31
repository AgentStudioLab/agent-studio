import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  AuthStatus,
  DesktopAuthTokens,
  DesktopLoginRequest,
  DesktopUser,
} from "./auth-types";
import { AuthContext, type AuthContextValue } from "./AuthContext";
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
  redirectUri: string;
}

export { AuthContext, type AuthContextValue } from "./AuthContext";

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
    const isDesktopCallback =
      url.protocol !== "agent-studio:" ||
      url.hostname !== "auth" ||
      url.pathname !== "/callback";
    const isLoopbackCallback =
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.pathname === "/auth/callback" &&
      Boolean(url.port);
    if (isDesktopCallback && !isLoopbackCallback) {
      return null;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return null;
    return { code, state };
  } catch {
    return null;
  }
}

function createAuthStaleError(): Error {
  return new Error("auth_stale");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldClearSessionForAuthError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message === "auth_required" ||
    message === "desktop_api_401" ||
    message === "desktop_api_invalid_token_response" ||
    message.includes("invalid_grant") ||
    message.includes("invalid_refresh")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<DesktopUser | null>(null);
  const [tokens, setTokens] = useState<DesktopAuthTokens | null>(null);
  const [loginRequest, setLoginRequest] = useState<DesktopLoginRequest | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const tokensRef = useRef<DesktopAuthTokens | null>(null);
  const userRef = useRef<DesktopUser | null>(null);
  const pendingLoginRef = useRef<PendingLogin | null>(null);
  const authVersionRef = useRef(0);
  const mountedRef = useRef(true);
  const storageQueueRef = useRef(Promise.resolve());

  const canApplyAuthResult = useCallback(
    (operationVersion: number, refreshToken?: string) =>
      mountedRef.current &&
      authVersionRef.current === operationVersion &&
      (!refreshToken || tokensRef.current?.refreshToken === refreshToken),
    [],
  );

  const applySignedOut = useCallback(() => {
    authVersionRef.current += 1;
    tokensRef.current = null;
    userRef.current = null;
    pendingLoginRef.current = null;
    if (mountedRef.current) {
      setTokens(null);
      setUser(null);
      setStatus("signed-out");
      setLoginRequest(null);
      setLoginError(null);
    }
  }, []);

  const applySession = useCallback((nextTokens: DesktopAuthTokens, nextUser: DesktopUser) => {
    authVersionRef.current += 1;
    tokensRef.current = nextTokens;
    userRef.current = nextUser;
    pendingLoginRef.current = null;
    if (mountedRef.current) {
      setTokens(nextTokens);
      setUser(nextUser);
      setStatus("signed-in");
      setLoginRequest(null);
      setLoginError(null);
    }
  }, []);

  const enqueueStorageOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = storageQueueRef.current.then(operation, operation);
    storageQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const saveStoredAuthTokensQueued = useCallback(
    (nextTokens: DesktopAuthTokens) =>
      enqueueStorageOperation(() => saveStoredAuthTokens(nextTokens)),
    [enqueueStorageOperation],
  );

  const clearStoredAuthTokensQueued = useCallback(
    () => enqueueStorageOperation(clearStoredAuthTokens),
    [enqueueStorageOperation],
  );

  const clearSession = useCallback(async () => {
    applySignedOut();
    await clearStoredAuthTokensQueued();
  }, [applySignedOut, clearStoredAuthTokensQueued]);

  const clearSessionBestEffort = useCallback(async () => {
    try {
      await clearSession();
    } catch {
      applySignedOut();
    }
  }, [applySignedOut, clearSession]);

  const refreshTokens = useCallback(async (
    currentTokens: DesktopAuthTokens,
    operationVersion: number,
  ) => {
    const refreshed = await refreshAccessToken(currentTokens.refreshToken);
    if (!canApplyAuthResult(operationVersion, currentTokens.refreshToken)) {
      throw createAuthStaleError();
    }

    const nextTokens = { ...currentTokens, ...refreshed };
    await saveStoredAuthTokensQueued(nextTokens);
    if (!canApplyAuthResult(operationVersion, currentTokens.refreshToken)) {
      throw createAuthStaleError();
    }

    tokensRef.current = nextTokens;
    if (mountedRef.current) {
      setTokens(nextTokens);
    }
    return nextTokens;
  }, [canApplyAuthResult, saveStoredAuthTokensQueued]);

  const getValidAccessToken = useCallback(async () => {
    const currentTokens = tokensRef.current;
    const operationVersion = authVersionRef.current;
    if (!currentTokens || isRefreshTokenExpired(currentTokens)) {
      await clearSession();
      throw new Error("auth_required");
    }

    if (!isAccessTokenExpiring(currentTokens)) {
      return currentTokens.accessToken;
    }

    try {
      const nextTokens = await refreshTokens(currentTokens, operationVersion);
      return nextTokens.accessToken;
    } catch (error) {
      if (shouldClearSessionForAuthError(error)) {
        await clearSession();
      }
      throw error;
    }
  }, [clearSession, refreshTokens]);

  const refreshUser = useCallback(async () => {
    const operationVersion = authVersionRef.current;
    try {
      const accessToken = await getValidAccessToken();
      const nextUser = await fetchDesktopMe(accessToken);
      if (!canApplyAuthResult(operationVersion)) {
        throw createAuthStaleError();
      }
      userRef.current = nextUser;
      if (mountedRef.current) {
        setUser(nextUser);
      }
      return nextUser;
    } catch (error) {
      if (shouldClearSessionForAuthError(error)) {
        await clearSession();
      }
      throw error;
    }
  }, [canApplyAuthResult, clearSession, getValidAccessToken]);

  const login = useCallback(async () => {
    const deviceId = getDeviceId();
    const redirectUri =
      (await invoke<string | null>("get_desktop_auth_redirect_uri").catch(() => null)) ||
      "agent-studio://auth/callback";
    const [{ verifier, challenge }, state] = await Promise.all([
      createPkcePair(),
      Promise.resolve(randomBase64Url(32)),
    ]);

    pendingLoginRef.current = { state, verifier, deviceId, redirectUri };
    const authorizeUrl = buildAuthorizeUrl({
      state,
      codeChallenge: challenge,
      deviceId,
      redirectUri,
      locale: i18n.language,
    });
    if (mountedRef.current) {
      setLoginRequest({ authorizeUrl, startedAt: Date.now() });
      setLoginError(null);
    }

    try {
      await open(authorizeUrl);
    } catch (error) {
      if (mountedRef.current) {
        setLoginError(getErrorMessage(error));
      }
      throw error;
    }
  }, [i18n.language]);

  const reopenLogin = useCallback(async () => {
    const authorizeUrl = loginRequest?.authorizeUrl;
    if (!authorizeUrl) return;

    try {
      await open(authorizeUrl);
      if (mountedRef.current) {
        setLoginError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setLoginError(getErrorMessage(error));
      }
      throw error;
    }
  }, [loginRequest?.authorizeUrl]);

  const cancelLogin = useCallback(() => {
    pendingLoginRef.current = null;
    if (mountedRef.current) {
      setLoginRequest(null);
      setLoginError(null);
    }
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
      if (mountedRef.current) {
        setLoginError(null);
      }
      const operationVersion = authVersionRef.current;
      try {
        const session = await exchangeAuthCode({
          code: callback.code,
          codeVerifier: pendingLogin.verifier,
          deviceId: pendingLogin.deviceId,
          redirectUri: pendingLogin.redirectUri,
        });
        if (!canApplyAuthResult(operationVersion)) {
          throw createAuthStaleError();
        }
        await saveStoredAuthTokensQueued(session.tokens);
        if (!canApplyAuthResult(operationVersion)) {
          throw createAuthStaleError();
        }
        applySession(session.tokens, session.user);
      } catch (error) {
        if (shouldClearSessionForAuthError(error)) {
          await clearSessionBestEffort();
        }
        if (mountedRef.current) {
          setLoginRequest(null);
          setLoginError(getErrorMessage(error));
        }
      }
    },
    [applySession, canApplyAuthResult, clearSessionBestEffort, saveStoredAuthTokensQueued],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      authVersionRef.current += 1;
    };
  }, []);

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
            await clearStoredAuthTokensQueued();
          }
          if (!isStale()) applySignedOut();
          return;
        }

        let usableTokens = storedTokens;
        if (isAccessTokenExpiring(storedTokens)) {
          const refreshed = await refreshAccessToken(storedTokens.refreshToken);
          if (isStale()) return;
          usableTokens = { ...storedTokens, ...refreshed };
          await saveStoredAuthTokensQueued(usableTokens);
          if (isStale()) return;
        }

        const nextUser = await fetchDesktopMe(usableTokens.accessToken);
        if (!isStale()) applySession(usableTokens, nextUser);
      } catch {
        if (!isStale()) {
          applySignedOut();
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySession, applySignedOut, clearStoredAuthTokensQueued, saveStoredAuthTokensQueued]);

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
      loginRequest,
      loginError,
      login,
      reopenLogin,
      cancelLogin,
      logout,
      ensureAuthenticated,
      refreshUser,
      getValidAccessToken,
    }),
    [
      cancelLogin,
      ensureAuthenticated,
      getValidAccessToken,
      login,
      loginError,
      loginRequest,
      logout,
      refreshUser,
      reopenLogin,
      status,
      tokens,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

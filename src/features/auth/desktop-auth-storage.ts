import { invoke } from "@tauri-apps/api/core";
import type { DesktopAuthTokens } from "./auth-types";

const STORAGE_KEY = "desktop_auth";

interface StoredDesktopAuthTokens {
  access_token: string;
  access_token_expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
}

function toRust(tokens: DesktopAuthTokens): StoredDesktopAuthTokens {
  return {
    access_token: tokens.accessToken,
    access_token_expires_at: tokens.accessTokenExpiresAt,
    refresh_token: tokens.refreshToken,
    refresh_token_expires_at: tokens.refreshTokenExpiresAt,
  };
}

function fromRust(tokens: StoredDesktopAuthTokens): DesktopAuthTokens {
  return {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: tokens.access_token_expires_at,
    refreshToken: tokens.refresh_token,
    refreshTokenExpiresAt: tokens.refresh_token_expires_at,
  };
}

function isStoredDesktopAuthTokens(value: unknown): value is DesktopAuthTokens {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DesktopAuthTokens).accessToken === "string" &&
    Number.isFinite((value as DesktopAuthTokens).accessTokenExpiresAt) &&
    typeof (value as DesktopAuthTokens).refreshToken === "string" &&
    Number.isFinite((value as DesktopAuthTokens).refreshTokenExpiresAt)
  );
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export async function loadStoredAuthTokens(): Promise<DesktopAuthTokens | null> {
  if (isTauri()) {
    const tokens = await invoke<StoredDesktopAuthTokens | null>("get_desktop_auth");
    return tokens ? fromRust(tokens) : null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const tokens: unknown = JSON.parse(raw);
    if (isStoredDesktopAuthTokens(tokens)) {
      return tokens;
    }
  } catch {
    // Fall through to clear bad browser fallback state.
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return null;
}

export async function saveStoredAuthTokens(tokens: DesktopAuthTokens): Promise<void> {
  if (isTauri()) {
    await invoke("store_desktop_auth", { tokens: toRust(tokens) });
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export async function clearStoredAuthTokens(): Promise<void> {
  if (isTauri()) {
    await invoke("clear_desktop_auth");
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

# Desktop OSS Login Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop-side login, token storage, user display, and paid-credit authorization gates to Agent Studio.

**Architecture:** The desktop app remains usable while logged out. When a paid credit feature needs account access, React starts a website authorization flow, Tauri receives the `agent-studio://auth/callback` deep link, and React exchanges the authorization code for desktop-scoped tokens.

**Tech Stack:** Tauri v2, Rust, React 19, React Router hash routing, TanStack Query, Bun test runner, TypeScript, existing shadcn/Radix UI.

---

## File Structure

- Modify: `src-tauri/Cargo.toml`
  - Add deep link dependency if using `tauri-plugin-deep-link`.
- Modify: `src-tauri/tauri.conf.json`
  - Register `agent-studio` URL scheme.
- Modify: `src-tauri/capabilities/default.json`
  - Add permissions required for opening login URLs and any deep link plugin.
- Modify: `src-tauri/src/lib.rs`
  - Listen for deep links, store pending callback, expose commands for auth credential storage.
- Create: `src/features/auth/auth-types.ts`
  - Shared auth and user types.
- Create: `src/features/auth/pkce.ts`
  - PKCE and random state helpers.
- Create: `src/features/auth/pkce.test.ts`
  - Tests for base64url, state, verifier, and challenge generation.
- Create: `src/features/auth/desktop-auth-storage.ts`
  - Frontend wrappers around Tauri auth commands and browser-dev localStorage fallback.
- Create: `src/features/auth/desktop-auth-client.ts`
  - Website desktop API client with token exchange, refresh, revoke, me, credits, and consume methods.
- Create: `src/features/auth/AuthProvider.tsx`
  - App-level auth state and `ensureAuthenticated`.
- Create: `src/features/auth/useAuth.ts`
  - Hook for consumers.
- Modify: `src/App.tsx`
  - Mount `AuthProvider`.
- Modify: `src/features/sidebar/UserBar.tsx`
  - Render logged-out, loading, and logged-in account states.
- Modify: `src/features/sidebar/UserPopover.tsx`
  - Show credits and sign in/out actions.
- Modify: `src/features/sidebar/SidebarContent.tsx`
  - Wire user bar to `useAuth`.
- Modify: `src/i18n/locales/en/sidebar.json`
  - Add login and credit strings.
- Modify: `src/i18n/locales/zh/sidebar.json`
  - Add login and credit strings.
- Create: `src/features/auth/AuthProvider.test.tsx`
  - Auth state behavior tests.
- Modify: `src/features/sidebar/UserBar.stories.tsx`
  - Add logged-out and logged-in stories.
- Create: `src/features/billing/paid-feature-gate.ts`
  - Reusable `ensurePaidFeatureAccess` wrapper around auth and credit consumption.
- Create: `src/features/billing/paid-feature-gate.test.ts`
  - Tests for auth-before-consume behavior.

## Task 1: Add Tauri Deep Link and Auth Storage Commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add deep link dependency**

In `src-tauri/Cargo.toml`, add:

```toml
tauri-plugin-deep-link = "2"
```

Keep existing dependencies unchanged.

- [ ] **Step 2: Register the desktop URL scheme intent**

Keep `src-tauri/tauri.conf.json` bundle fields intact and add the desktop scheme registration for platforms supported by the installed plugin version. Start with the macOS key because the current project is mac-first:

```json
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis"],
    "externalBin": ["binaries/agent-studio-sidecar"],
    "resources": ["../built-in/**/*"],
    "iOS": {
      "urlSchemes": ["agent-studio"]
    },
    "macOS": {
      "urlSchemes": ["agent-studio"]
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Do not add the sample `windows.webviewInstallMode` block unless it already exists in the file. The required callback URL is:

```text
agent-studio://auth/callback
```

- [ ] **Step 3: Add auth state structs and commands**

In `src-tauri/src/lib.rs`, add:

```rust
#[derive(Default)]
struct PendingAuthCallback(Mutex<Option<String>>);

#[derive(Clone, Serialize, serde::Deserialize)]
pub struct DesktopAuthTokens {
    access_token: String,
    access_token_expires_at: i64,
    refresh_token: String,
    refresh_token_expires_at: i64,
}

#[tauri::command]
async fn get_pending_auth_callback(
    state: State<'_, PendingAuthCallback>,
) -> Result<Option<String>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.take())
}

#[tauri::command]
async fn store_desktop_auth(
    app: tauri::AppHandle,
    tokens: DesktopAuthTokens,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("desktop_auth", serde_json::to_value(tokens).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_desktop_auth(
    app: tauri::AppHandle,
) -> Result<Option<DesktopAuthTokens>, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let Some(value) = store.get("desktop_auth") else {
        return Ok(None);
    };
    serde_json::from_value(value).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_desktop_auth(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.delete("desktop_auth");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
```

This uses existing Tauri store as an interim storage level. Replace with secure OS storage before production hardening.

- [ ] **Step 4: Wire deep link event**

In `run()`, add `.manage(PendingAuthCallback::default())`, register the deep link plugin, and on every received URL:

1. Accept only URLs beginning with `agent-studio://auth/callback`.
2. Store the URL into `PendingAuthCallback`.
3. Emit a frontend event named `desktop-auth-callback`.

Implementation shape:

```rust
let pending = app.state::<PendingAuthCallback>();
*pending.0.lock().map_err(|e| e.to_string())? = Some(url.to_string());
let _ = app.emit("desktop-auth-callback", url.to_string());
```

The expected plugin wiring shape is:

```rust
.plugin(tauri_plugin_deep_link::init())
```

and an event handler that receives URL strings or URL lists. Normalize the payload into strings before applying the three rules above.

- [ ] **Step 5: Add commands to invoke handler**

Add these commands to `tauri::generate_handler!`:

```rust
get_pending_auth_callback,
store_desktop_auth,
get_desktop_auth,
clear_desktop_auth
```

- [ ] **Step 6: Rust typecheck**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/src/lib.rs
git commit -m "feat: add desktop auth deep link plumbing"
```

## Task 2: Add Auth Types and PKCE Helpers

**Files:**
- Create: `src/features/auth/auth-types.ts`
- Create: `src/features/auth/pkce.ts`
- Create: `src/features/auth/pkce.test.ts`

- [ ] **Step 1: Add auth types**

Create `auth-types.ts`:

```ts
export interface DesktopUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  credits: {
    remainingCredits: number;
  };
}

export interface DesktopAuthTokens {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

export interface DesktopAuthSession {
  tokens: DesktopAuthTokens;
  user: DesktopUser;
}

export type AuthStatus = "loading" | "signed-out" | "signed-in";
```

- [ ] **Step 2: Add PKCE helpers**

Create `pkce.ts`:

```ts
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = randomBase64Url(48);
  return {
    verifier,
    challenge: await sha256Base64Url(verifier),
  };
}
```

- [ ] **Step 3: Add PKCE tests**

Create `pkce.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { base64UrlEncode, createPkcePair, sha256Base64Url } from "./pkce";

describe("pkce helpers", () => {
  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 255]))).toBe("-___");
  });

  it("creates a SHA-256 challenge", async () => {
    const challenge = await sha256Base64Url("abc");
    expect(challenge).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3FzV5IaWkPiDF0");
  });

  it("creates verifier and challenge pair", async () => {
    const pair = await createPkcePair();
    expect(pair.verifier.length).toBeGreaterThan(40);
    expect(pair.challenge).toBe(await sha256Base64Url(pair.verifier));
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test src/features/auth/pkce.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/auth-types.ts src/features/auth/pkce.ts src/features/auth/pkce.test.ts
git commit -m "feat: add desktop auth pkce helpers"
```

## Task 3: Add Desktop Auth Storage and Website API Client

**Files:**
- Create: `src/features/auth/desktop-auth-storage.ts`
- Create: `src/features/auth/desktop-auth-client.ts`

- [ ] **Step 1: Implement storage wrapper**

Create `desktop-auth-storage.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { DesktopAuthTokens } from "./auth-types";

const STORAGE_KEY = "desktop_auth";

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

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

export async function loadStoredAuthTokens(): Promise<DesktopAuthTokens | null> {
  if (isTauri) {
    const tokens = await invoke<StoredDesktopAuthTokens | null>("get_desktop_auth");
    return tokens ? fromRust(tokens) : null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as DesktopAuthTokens) : null;
}

export async function saveStoredAuthTokens(tokens: DesktopAuthTokens): Promise<void> {
  if (isTauri) {
    await invoke("store_desktop_auth", { tokens: toRust(tokens) });
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export async function clearStoredAuthTokens(): Promise<void> {
  if (isTauri) {
    await invoke("clear_desktop_auth");
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 2: Implement website API client**

Create `desktop-auth-client.ts`:

```ts
import type { DesktopAuthTokens, DesktopUser } from "./auth-types";

const DEFAULT_WEBSITE_ORIGIN = "https://agentstudio.chat";

export function getWebsiteOrigin(): string {
  return import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN || DEFAULT_WEBSITE_ORIGIN;
}

async function readApiResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `desktop_api_${res.status}`);
  }
  return json.data as T;
}

export function buildAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  deviceId: string;
}): string {
  const url = new URL("/desktop/authorize", getWebsiteOrigin());
  url.searchParams.set("client_id", "agent-studio-desktop");
  url.searchParams.set("redirect_uri", "agent-studio://auth/callback");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("device_id", input.deviceId);
  return url.toString();
}

export async function exchangeAuthCode(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
}): Promise<{ tokens: DesktopAuthTokens; user: DesktopUser }> {
  const data = await fetch(`${getWebsiteOrigin()}/api/desktop/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: "agent-studio-desktop",
      redirect_uri: "agent-studio://auth/callback",
      code: input.code,
      code_verifier: input.codeVerifier,
      device_id: input.deviceId,
    }),
  }).then(readApiResponse<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
    user: DesktopUser;
  }>);

  const now = Date.now();
  return {
    tokens: {
      accessToken: data.accessToken,
      accessTokenExpiresAt: now + data.expiresIn * 1000,
      refreshToken: data.refreshToken,
      refreshTokenExpiresAt: now + data.refreshExpiresIn * 1000,
    },
    user: data.user,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<Pick<DesktopAuthTokens, "accessToken" | "accessTokenExpiresAt">> {
  const data = await fetch(`${getWebsiteOrigin()}/api/desktop/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  }).then(readApiResponse<{ accessToken: string; expiresIn: number }>);
  return {
    accessToken: data.accessToken,
    accessTokenExpiresAt: Date.now() + data.expiresIn * 1000,
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(`${getWebsiteOrigin()}/api/desktop/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).then(readApiResponse);
}

export async function fetchDesktopMe(accessToken: string): Promise<DesktopUser> {
  return fetch(`${getWebsiteOrigin()}/api/desktop/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(readApiResponse<DesktopUser>);
}

export async function consumeDesktopCredits(input: {
  accessToken: string;
  amount: number;
  scene: string;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ remainingCredits: number }> {
  return fetch(`${getWebsiteOrigin()}/api/desktop/credits/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      scene: input.scene,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    }),
  }).then(readApiResponse<{ remainingCredits: number }>);
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
bun run build
```

Expected: TypeScript accepts auth storage and API client.

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/desktop-auth-storage.ts src/features/auth/desktop-auth-client.ts
git commit -m "feat: add desktop auth api client"
```

## Task 4: Add AuthProvider and Callback Handling

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/useAuth.ts`
- Create: `src/features/auth/AuthProvider.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement AuthProvider**

Create `AuthProvider.tsx`:

```tsx
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthStatus, DesktopAuthSession, DesktopAuthTokens, DesktopUser } from "./auth-types";
import { buildAuthorizeUrl, exchangeAuthCode, fetchDesktopMe, refreshAccessToken, revokeRefreshToken } from "./desktop-auth-client";
import { clearStoredAuthTokens, loadStoredAuthTokens, saveStoredAuthTokens } from "./desktop-auth-storage";
import { createPkcePair, randomBase64Url } from "./pkce";

interface PendingLogin {
  state: string;
  verifier: string;
  deviceId: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: DesktopUser | null;
  tokens: DesktopAuthTokens | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  ensureAuthenticated: () => Promise<DesktopAuthSession>;
  refreshUser: () => Promise<void>;
  getValidAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createDeviceId(): string {
  const key = "agent_studio_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = randomBase64Url(24);
  window.localStorage.setItem(key, next);
  return next;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [tokens, setTokens] = useState<DesktopAuthTokens | null>(null);
  const [user, setUser] = useState<DesktopUser | null>(null);
  const pendingLogin = useRef<PendingLogin | null>(null);

  const applySession = useCallback(async (session: DesktopAuthSession) => {
    setTokens(session.tokens);
    setUser(session.user);
    setStatus("signed-in");
    await saveStoredAuthTokens(session.tokens);
  }, []);

  const clearSession = useCallback(async () => {
    setTokens(null);
    setUser(null);
    setStatus("signed-out");
    await clearStoredAuthTokens();
  }, []);

  const getValidAccessToken = useCallback(async () => {
    if (!tokens) throw new Error("not_authenticated");
    if (Date.now() < tokens.accessTokenExpiresAt - 60_000) {
      return tokens.accessToken;
    }
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    const next = { ...tokens, ...refreshed };
    setTokens(next);
    await saveStoredAuthTokens(next);
    return next.accessToken;
  }, [tokens]);

  const refreshUser = useCallback(async () => {
    const accessToken = await getValidAccessToken();
    setUser(await fetchDesktopMe(accessToken));
  }, [getValidAccessToken]);

  const handleCallbackUrl = useCallback(
    async (url: string) => {
      const pending = pendingLogin.current;
      if (!pending) return;
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code") || "";
      const state = parsed.searchParams.get("state") || "";
      if (!code || state !== pending.state) {
        throw new Error("invalid_auth_callback_state");
      }
      const session = await exchangeAuthCode({
        code,
        codeVerifier: pending.verifier,
        deviceId: pending.deviceId,
      });
      pendingLogin.current = null;
      await applySession(session);
    },
    [applySession],
  );

  const login = useCallback(async () => {
    const pair = await createPkcePair();
    const pending = {
      state: randomBase64Url(24),
      verifier: pair.verifier,
      deviceId: createDeviceId(),
    };
    pendingLogin.current = pending;
    await open(buildAuthorizeUrl({
      state: pending.state,
      codeChallenge: pair.challenge,
      deviceId: pending.deviceId,
    }));
  }, []);

  const ensureAuthenticated = useCallback(async () => {
    if (tokens && user) return { tokens, user };
    await login();
    throw new Error("auth_required");
  }, [login, tokens, user]);

  const logout = useCallback(async () => {
    const refreshToken = tokens?.refreshToken;
    await clearSession();
    if (refreshToken) {
      await revokeRefreshToken(refreshToken).catch(() => undefined);
    }
  }, [clearSession, tokens?.refreshToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadStoredAuthTokens();
      if (cancelled) return;
      if (!stored || Date.now() >= stored.refreshTokenExpiresAt) {
        setStatus("signed-out");
        return;
      }
      setTokens(stored);
      setStatus("signed-in");
      try {
        const accessToken =
          Date.now() < stored.accessTokenExpiresAt - 60_000
            ? stored.accessToken
            : (await refreshAccessToken(stored.refreshToken)).accessToken;
        if (!cancelled) setUser(await fetchDesktopMe(accessToken));
      } catch {
        if (!cancelled) await clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("desktop-auth-callback", (event) => {
      void handleCallbackUrl(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [handleCallbackUrl]);

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

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
```

- [ ] **Step 2: Add hook**

Create `useAuth.ts`:

```ts
export { useAuthContext as useAuth } from "./AuthProvider";
```

- [ ] **Step 3: Mount provider**

In `src/App.tsx`, import and wrap inside `QueryClientProvider` scope:

```tsx
import { AuthProvider } from "@/features/auth/AuthProvider";
```

Wrap the current shell:

```tsx
<AuthProvider>
  <HashRouter>
    ...
  </HashRouter>
</AuthProvider>
```

Keep `HashRouter` behavior unchanged.

- [ ] **Step 4: Add provider smoke test**

Create `AuthProvider.test.tsx` with a render smoke test that mounts `AuthProvider` and confirms a consumer can read `status`. Mock Tauri modules with `mock.module` from `bun:test` before importing the provider.

- [ ] **Step 5: Run tests and build**

Run:

```bash
bun test src/features/auth/pkce.test.ts src/features/auth/AuthProvider.test.tsx
bun run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/AuthProvider.tsx src/features/auth/useAuth.ts src/features/auth/AuthProvider.test.tsx src/App.tsx
git commit -m "feat: add desktop auth provider"
```

## Task 5: Wire Sidebar User UI

**Files:**
- Modify: `src/features/sidebar/UserBar.tsx`
- Modify: `src/features/sidebar/UserPopover.tsx`
- Modify: `src/features/sidebar/SidebarContent.tsx`
- Modify: `src/i18n/locales/en/sidebar.json`
- Modify: `src/i18n/locales/zh/sidebar.json`
- Modify: `src/features/sidebar/UserBar.stories.tsx`
- Modify: `src/features/sidebar/UserPopover.stories.tsx`

- [ ] **Step 1: Update i18n strings**

Add:

```json
"user": {
  "settings": "Settings",
  "login": "Sign in",
  "logout": "Logout",
  "signedOut": "Not signed in",
  "credits": "{{count}} credits"
}
```

Chinese:

```json
"user": {
  "settings": "设置",
  "login": "登录",
  "logout": "退出登录",
  "signedOut": "未登录",
  "credits": "{{count}} 积分"
}
```

Merge with existing `user` keys instead of duplicating the object.

- [ ] **Step 2: Update UserPopover props**

Change props to:

```ts
interface UserPopoverProps {
  email?: string;
  credits?: number;
  signedIn: boolean;
  onLogin?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
```

Render login action when `signedIn` is false, and render credits plus logout when `signedIn` is true.

- [ ] **Step 3: Update UserBar props and display**

Change props to:

```ts
interface UserBarProps {
  name?: string | null;
  initials?: string;
  email?: string | null;
  credits?: number;
  signedIn: boolean;
  loading?: boolean;
  onLogin?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}
```

Display:

- loading: name text `...`, secondary empty.
- signed out: `sidebar.user.signedOut`.
- signed in: user name or email and `sidebar.user.credits`.

- [ ] **Step 4: Wire SidebarContent to useAuth**

In `SidebarContent.tsx`, import `useAuth`:

```ts
import { useAuth } from "@/features/auth/useAuth";
```

Inside component:

```ts
const auth = useAuth();
```

Pass:

```tsx
<UserBar
  signedIn={auth.status === "signed-in"}
  loading={auth.status === "loading"}
  name={auth.user?.name}
  email={auth.user?.email}
  credits={auth.user?.credits.remainingCredits}
  onLogin={() => void auth.login()}
  onSettings={() => navigate("/settings/account")}
  onLogout={() => void auth.logout() }
/>
```

Replace any existing static `UserBar` invocation.

- [ ] **Step 5: Update stories**

Add stories:

- `SignedOut`
- `SignedInWithCredits`
- `Loading`

Each story should pass explicit props and avoid relying on AuthProvider.

- [ ] **Step 6: Run tests and Storybook build**

Run:

```bash
bun test src/features/auth/pkce.test.ts src/features/auth/AuthProvider.test.tsx
bun run build-storybook
bun run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/sidebar/UserBar.tsx src/features/sidebar/UserPopover.tsx src/features/sidebar/SidebarContent.tsx src/i18n/locales/en/sidebar.json src/i18n/locales/zh/sidebar.json src/features/sidebar/UserBar.stories.tsx src/features/sidebar/UserPopover.stories.tsx
git commit -m "feat: show desktop auth state in sidebar"
```

## Task 6: Add Paid Feature Gate Helper

**Files:**
- Create: `src/features/billing/paid-feature-gate.ts`
- Create: `src/features/billing/paid-feature-gate.test.ts`

- [ ] **Step 1: Create gate helper**

Create:

```ts
import { consumeDesktopCredits } from "@/features/auth/desktop-auth-client";
import type { DesktopAuthSession } from "@/features/auth/auth-types";

export interface PaidFeatureAuth {
  ensureAuthenticated: () => Promise<DesktopAuthSession>;
  getValidAccessToken: () => Promise<string>;
  refreshUser: () => Promise<void>;
}

export async function ensurePaidFeatureAccess(input: {
  auth: PaidFeatureAuth;
  amount: number;
  scene: string;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  await input.auth.ensureAuthenticated();
  const accessToken = await input.auth.getValidAccessToken();
  const result = await consumeDesktopCredits({
    accessToken,
    amount: input.amount,
    scene: input.scene,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });
  await input.auth.refreshUser();
  return result;
}
```

- [ ] **Step 2: Add gate test**

Create test with `mock.module("@/features/auth/desktop-auth-client", ...)` to assert `ensureAuthenticated` is called before `consumeDesktopCredits`.

Test cases:

```ts
it("authenticates before consuming credits", async () => {
  const calls: string[] = [];
  // mock consumeDesktopCredits pushes "consume"
  // auth.ensureAuthenticated pushes "auth"
  // auth.getValidAccessToken pushes "token"
  // auth.refreshUser pushes "refresh"
  await ensurePaidFeatureAccess(...);
  expect(calls).toEqual(["auth", "token", "consume", "refresh"]);
});
```

```ts
it("does not consume credits when authentication fails", async () => {
  // ensureAuthenticated throws
  // assert consumeDesktopCredits was not called
});
```

- [ ] **Step 3: Run tests**

Run:

```bash
bun test src/features/billing/paid-feature-gate.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/billing/paid-feature-gate.ts src/features/billing/paid-feature-gate.test.ts
git commit -m "feat: add paid feature credit gate"
```

## Task 7: Identify and Connect Paid Credit Entry Points

**Files:**
- Modify: the files that introduce actual paid feature actions.

- [ ] **Step 1: Search for candidate entry points**

Run:

```bash
rg -n "paid|credit|credits|billing|subscription|consume|usage|收费|积分|pro|premium" src sidecar/src
```

Expected today: no concrete paid-credit feature entry point is wired yet.

- [ ] **Step 2: If a paid feature entry point exists, gate it**

For each concrete paid action, add:

```ts
await ensurePaidFeatureAccess({
  auth,
  amount: 1,
  scene: "desktop_paid_feature",
  description: "Use paid desktop feature",
  idempotencyKey: crypto.randomUUID(),
  metadata: { feature: "feature_id" },
});
```

Use a stable operation id instead of `crypto.randomUUID()` when the action can be retried.

- [ ] **Step 3: If no paid feature exists yet, add integration note**

If Step 1 finds no real paid feature, create `docs/superpowers/specs/2026-05-31-paid-feature-auth-integration-note.md` in this repo with:

```md
# Paid Feature Auth Integration Note

Paid feature entry points are not present in the current desktop codebase. New paid features must call `ensurePaidFeatureAccess` before invoking the feature and must use a stable `idempotencyKey` for retryable operations.
```

Do not invent a fake paid feature just to consume credits.

- [ ] **Step 4: Build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/billing src/features/auth src/features/sidebar src/i18n/locales/en/sidebar.json src/i18n/locales/zh/sidebar.json src/App.tsx
git commit -m "feat: gate paid desktop features behind auth"
```

If there are no code changes because no paid feature exists, commit the note instead:

```bash
git add docs/superpowers/specs/2026-05-31-paid-feature-auth-integration-note.md
git commit -m "docs: document paid feature auth integration point"
```

## Task 8: Run Client Verification

**Files:**
- No code changes unless verification finds defects.

- [ ] **Step 1: Run focused auth tests**

Run:

```bash
bun test src/features/auth/pkce.test.ts src/features/auth/AuthProvider.test.tsx src/features/billing/paid-feature-gate.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Run Rust typecheck**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 4: Run app build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 5: Manual deep link smoke test**

Run the app:

```bash
bun run tauri:dev
```

In another terminal, trigger a callback with a deliberately invalid state:

```bash
open 'agent-studio://auth/callback?code=fake-code&state=fake-state'
```

Expected: app remains open and does not become signed in. No crash.

- [ ] **Step 6: Commit verification fixes if needed**

If verification required fixes:

```bash
git status --short
git add src-tauri src/features/auth src/features/billing src/features/sidebar src/i18n src/App.tsx
git commit -m "fix: stabilize desktop auth client"
```

If no fixes were needed, do not create an empty commit.

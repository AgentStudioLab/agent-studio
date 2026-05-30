import type { DesktopAuthTokens, DesktopUser } from "./auth-types";

const DEFAULT_WEBSITE_ORIGIN = "https://agentstudio.chat";
const CLIENT_ID = "agent-studio-desktop";
const REDIRECT_URI = "agent-studio://auth/callback";

interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: DesktopUser;
}

export function getWebsiteOrigin(): string {
  return import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN || DEFAULT_WEBSITE_ORIGIN;
}

async function readApiResponse<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `desktop_api_${res.status}`);
  }

  return json.data;
}

export function buildAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  deviceId: string;
}): string {
  const url = new URL("/desktop/authorize", getWebsiteOrigin());
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
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
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code: input.code,
      code_verifier: input.codeVerifier,
      device_id: input.deviceId,
    }),
  }).then(readApiResponse<TokenResponse>);

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

export async function refreshAccessToken(
  refreshToken: string,
): Promise<Pick<DesktopAuthTokens, "accessToken" | "accessTokenExpiresAt">> {
  const data = await fetch(`${getWebsiteOrigin()}/api/desktop/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
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

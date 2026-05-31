import type { DesktopAuthTokens, DesktopUser } from "./auth-types";

const CLIENT_ID = "agent-studio-desktop";
const REDIRECT_URI = "agent-studio://auth/callback";
const DEFAULT_WEBSITE_LOCALE = "zh";
const SUPPORTED_WEBSITE_LOCALES = ["zh", "en"] as const;
type WebsiteLocale = (typeof SUPPORTED_WEBSITE_LOCALES)[number];

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
  const origin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN?.trim();
  if (!origin) {
    throw new Error("desktop_api_missing_website_origin");
  }
  return origin;
}

function buildWebsiteUrl(path: string): string {
  return new URL(path, getWebsiteOrigin()).toString();
}

function normalizeWebsiteLocale(locale?: string): WebsiteLocale {
  const language = locale?.split("-")[0]?.toLowerCase();
  return SUPPORTED_WEBSITE_LOCALES.includes(language as WebsiteLocale)
    ? (language as WebsiteLocale)
    : DEFAULT_WEBSITE_LOCALE;
}

function buildLocalizedWebsitePath(path: string, locale?: string): string {
  const normalizedLocale = normalizeWebsiteLocale(locale);
  return normalizedLocale === DEFAULT_WEBSITE_LOCALE
    ? path
    : `/${normalizedLocale}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDesktopUser(value: unknown): value is DesktopUser {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isRecord(value.credits) &&
    isFiniteNumber(value.credits.remainingCredits)
  );
}

function resolveUserImage(image: unknown): string | null {
  if (typeof image !== "string") {
    return null;
  }

  const trimmedImage = image.trim();
  if (!trimmedImage) {
    return null;
  }

  try {
    const url = new URL(trimmedImage);
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "data:" ||
      url.protocol === "blob:"
    ) {
      return trimmedImage;
    }
  } catch {
    return new URL(trimmedImage, getWebsiteOrigin()).toString();
  }

  return null;
}

function normalizeDesktopUser(user: DesktopUser): DesktopUser {
  return {
    ...user,
    image: resolveUserImage(user.image),
  };
}

function assertTokenResponse(data: TokenResponse): void {
  if (
    !isRecord(data) ||
    !isNonEmptyString(data.accessToken) ||
    !isFiniteNumber(data.expiresIn) ||
    !isNonEmptyString(data.refreshToken) ||
    !isFiniteNumber(data.refreshExpiresIn) ||
    !isDesktopUser(data.user)
  ) {
    throw new Error("desktop_api_invalid_token_response");
  }
}

function assertRefreshResponse(
  data: { accessToken: string; expiresIn: number },
): void {
  if (!isRecord(data) || !isNonEmptyString(data.accessToken) || !isFiniteNumber(data.expiresIn)) {
    throw new Error("desktop_api_invalid_token_response");
  }
}

async function readApiResponse<T>(res: Response): Promise<T> {
  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    if (!res.ok) {
      throw new Error(`desktop_api_${res.status}`);
    }
    throw new Error("desktop_api_invalid_response");
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `desktop_api_${res.status}`);
  }

  return json.data;
}

export function buildAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  deviceId: string;
  redirectUri?: string;
  locale?: string;
}): string {
  const url = new URL(
    buildLocalizedWebsitePath("/desktop/authorize", input.locale),
    getWebsiteOrigin(),
  );
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri || REDIRECT_URI);
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
  redirectUri?: string;
}): Promise<{ tokens: DesktopAuthTokens; user: DesktopUser }> {
  const data = await fetch(buildWebsiteUrl("/api/desktop/oauth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: input.redirectUri || REDIRECT_URI,
      code: input.code,
      code_verifier: input.codeVerifier,
      device_id: input.deviceId,
    }),
  }).then(readApiResponse<TokenResponse>);

  assertTokenResponse(data);

  const now = Date.now();
  return {
    tokens: {
      accessToken: data.accessToken,
      accessTokenExpiresAt: now + data.expiresIn * 1000,
      refreshToken: data.refreshToken,
      refreshTokenExpiresAt: now + data.refreshExpiresIn * 1000,
    },
    user: normalizeDesktopUser(data.user),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<Pick<DesktopAuthTokens, "accessToken" | "accessTokenExpiresAt">> {
  const data = await fetch(buildWebsiteUrl("/api/desktop/oauth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  }).then(readApiResponse<{ accessToken: string; expiresIn: number }>);

  assertRefreshResponse(data);

  return {
    accessToken: data.accessToken,
    accessTokenExpiresAt: Date.now() + data.expiresIn * 1000,
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(buildWebsiteUrl("/api/desktop/oauth/revoke"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).then(readApiResponse<void>);
}

export async function fetchDesktopMe(accessToken: string): Promise<DesktopUser> {
  const user = await fetch(buildWebsiteUrl("/api/desktop/me"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(readApiResponse<DesktopUser>);

  if (!isDesktopUser(user)) {
    throw new Error("desktop_api_invalid_user_response");
  }

  return normalizeDesktopUser(user);
}

export async function consumeDesktopCredits(input: {
  accessToken: string;
  amount: number;
  scene: string;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ remainingCredits: number }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("desktop_api_invalid_credit_amount");
  }

  return fetch(buildWebsiteUrl("/api/desktop/credits/consume"), {
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

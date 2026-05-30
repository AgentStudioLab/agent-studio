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

import { createContext } from "react";
import type {
  AuthStatus,
  DesktopAuthSession,
  DesktopAuthTokens,
  DesktopLoginRequest,
  DesktopUser,
} from "./auth-types";

export interface AuthContextValue {
  status: AuthStatus;
  user: DesktopUser | null;
  tokens: DesktopAuthTokens | null;
  loginRequest: DesktopLoginRequest | null;
  loginError: string | null;
  login: () => Promise<void>;
  reopenLogin: () => Promise<void>;
  cancelLogin: () => void;
  logout: () => Promise<void>;
  ensureAuthenticated: () => Promise<DesktopAuthSession>;
  refreshUser: () => Promise<DesktopUser>;
  getValidAccessToken: () => Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

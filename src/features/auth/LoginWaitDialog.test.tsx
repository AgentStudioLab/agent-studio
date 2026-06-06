import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "./AuthProvider";

const auth: AuthContextValue = {
  status: "signed-out",
  user: null,
  tokens: null,
  loginRequest: {
    authorizeUrl: "https://example.test/desktop/authorize",
  },
  loginError: null as string | null,
  login: mock(async () => {}),
  cancelLogin: mock(() => {}),
  reopenLogin: mock(async () => {}),
  logout: mock(async () => {}),
  ensureAuthenticated: mock(async () => {
    throw new Error("auth_required");
  }),
  refreshUser: mock(async () => {
    throw new Error("auth_required");
  }),
  getValidAccessToken: mock(async () => {
    throw new Error("auth_required");
  }),
};

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "sidebar.user.loginWaitTitle": "Waiting for browser authorization",
        "sidebar.user.loginWaitDescription":
          "Finish signing in in your browser. Agent Studio will return to the desktop app and sync your account information.",
        "sidebar.user.loginWaitOpenError": "Browser failed to open: {{error}}",
        "sidebar.user.loginWaitHint":
          "If the browser did not open automatically, reopen the authorization page.",
        "sidebar.user.loginWaitCancel": "Cancel sign in",
        "sidebar.user.loginWaitCopied": "Copied",
        "sidebar.user.loginWaitCopy": "Copy link",
        "sidebar.user.loginWaitReopen": "Reopen browser",
      };
      return (translations[key] ?? key).replace(
        "{{error}}",
        String(params?.error ?? ""),
      );
    },
  }),
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const { LoginWaitDialog } = require("./LoginWaitDialog") as typeof import("./LoginWaitDialog");

function renderDialog() {
  return render(
    <AuthContext.Provider value={auth}>
      <LoginWaitDialog />
    </AuthContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  auth.loginError = null;
});

describe("LoginWaitDialog", () => {
  it("renders localized waiting copy", () => {
    renderDialog();

    expect(screen.getByText("Waiting for browser authorization")).toBeDefined();
    expect(screen.getByText("Cancel sign in")).toBeDefined();
    expect(screen.getByText("Copy link")).toBeDefined();
    expect(screen.getByText("Reopen browser")).toBeDefined();
    expect(screen.queryByText("正在等待浏览器授权")).toBeNull();
  });

  it("renders localized browser open errors", () => {
    auth.loginError = "blocked";

    renderDialog();

    expect(screen.getByText("Browser failed to open: blocked")).toBeDefined();
  });

  it("uses a desktop width that fits the login actions", () => {
    renderDialog();

    const dialogContent = screen.getByText("Waiting for browser authorization")
      .parentElement?.parentElement;
    const cancelButton = screen.getByText("Cancel sign in").closest("button");
    const copyButton = screen.getByText("Copy link").closest("button");
    const reopenButton = screen.getByText("Reopen browser").closest("button");
    const footer = cancelButton?.parentElement;

    expect(dialogContent?.className).toContain("sm:max-w-[520px]");
    expect(footer?.className).toContain("sm:flex-wrap");
    expect(footer?.className).toContain("sm:justify-end");
    expect(cancelButton?.className).toContain("sm:mr-auto");
    expect(copyButton?.className).toContain("max-w-full");
    expect(reopenButton?.className).toContain(
      "max-w-full",
    );
  });
});

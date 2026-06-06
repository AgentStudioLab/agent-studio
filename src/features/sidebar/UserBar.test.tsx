import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

globalThis.getComputedStyle = window.getComputedStyle.bind(window);

const makeMatchMedia = (matches: boolean) =>
  (query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "sidebar.user.accountId": `ID ${String(params?.id ?? "")}`,
        "sidebar.user.credits": `${String(params?.count ?? "")} credits`,
        "sidebar.user.login": "Sign in",
        "sidebar.user.logout": "Logout",
        "sidebar.user.settings": "Settings",
        "sidebar.user.signedIn": "Signed in",
        "sidebar.user.signedOut": "Not signed in",
        "sidebar.user.switchToDark": "Switch to dark mode",
        "sidebar.user.switchToLight": "Switch to light mode",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { UserBar } = require("./UserBar") as typeof import("./UserBar");
const { UserPopover } = require("./UserPopover") as typeof import("./UserPopover");

const renderUserBar = (ui: ReactNode) =>
  render(<TooltipProvider delayDuration={200}>{ui}</TooltipProvider>);

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: makeMatchMedia(false),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage,
  });
  window.localStorage.clear();
  document.documentElement.setAttribute("data-mode", "light");
});

afterEach(() => {
  cleanup();
});

describe("UserBar", () => {
  it("shows only avatar and display name in the sidebar account bar", () => {
    const { container } = renderUserBar(
      <UserBar
        signedIn
        userId="user-1234567890"
        name="Ada Lovelace"
        email="ada@example.test"
        credits={12}
      />,
    );

    const accountButton = container.querySelector("button");
    expect(accountButton?.textContent).toContain("Ada Lovelace");
    expect(accountButton?.textContent).not.toContain("ada@example.test");
    expect(accountButton?.textContent).not.toContain("12 credits");
    expect(accountButton?.querySelector('[role="img"]')).toBeDefined();
    expect(screen.queryByText("Not signed in")).toBeNull();
  });

  it("uses the signed-in fallback name in the sidebar account bar without showing account id or credits", () => {
    const { container } = renderUserBar(<UserBar signedIn userId="user-1234567890" credits={12} />);

    const accountButton = container.querySelector("button");
    expect(accountButton?.textContent).toContain("Signed in");
    expect(accountButton?.textContent).not.toContain("ID user-123...");
    expect(accountButton?.textContent).not.toContain("12 credits");
  });

  it("shows the user's image in the sidebar account bar when an avatar URL is available", () => {
    const { container } = renderUserBar(
      <UserBar
        signedIn
        userId="user-1"
        name="Ada Lovelace"
        image="https://example.test/uploads/avatar.png"
      />,
    );

    expect(container.querySelector("button img")?.getAttribute("src")).toBe(
      "https://example.test/uploads/avatar.png",
    );
  });

  it("keeps theme switching as a separate sidebar action from the account menu", () => {
    renderUserBar(<UserBar signedIn={false} />);

    const accountButton = screen.getByRole("button", { name: /Not signed in/i });
    const themeButton = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(themeButton).not.toBe(accountButton);

    fireEvent.click(themeButton);

    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(window.localStorage.getItem("preferred_theme_mode")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeDefined();
  });

  it("keeps the signed-in user's account details in the account menu", () => {
    render(
      <UserPopover
        open
        signedIn
        userId="user-1"
        name="Ada Lovelace"
        email="ada@example.test"
        credits={42}
      >
        <button type="button">Open account</button>
      </UserPopover>,
    );

    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    expect(screen.getByText("ada@example.test")).toBeDefined();
    expect(screen.getByText("42 credits")).toBeDefined();
  });

  it("shows the user's image in the account menu when an avatar URL is available", () => {
    const { container } = render(
      <UserPopover
        open
        signedIn
        userId="user-1"
        name="Ada Lovelace"
        image="https://example.test/uploads/avatar.png"
      >
        <button type="button">Open account</button>
      </UserPopover>,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/uploads/avatar.png",
    );
  });

  it("falls back to the default initials avatar when the user image is empty", () => {
    const { container } = render(
      <UserPopover open signedIn userId="user-1" name="Ada Lovelace" image="">
        <button type="button">Open account</button>
      </UserPopover>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Ad" })).toBeDefined();
  });
});

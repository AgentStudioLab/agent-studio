import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

globalThis.getComputedStyle = window.getComputedStyle.bind(window);

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

afterEach(() => {
  cleanup();
});

describe("UserBar", () => {
  it("shows only avatar and display name in the sidebar account bar", () => {
    const { container } = render(
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
    const { container } = render(<UserBar signedIn userId="user-1234567890" credits={12} />);

    const accountButton = container.querySelector("button");
    expect(accountButton?.textContent).toContain("Signed in");
    expect(accountButton?.textContent).not.toContain("ID user-123...");
    expect(accountButton?.textContent).not.toContain("12 credits");
  });

  it("shows the user's image in the sidebar account bar when an avatar URL is available", () => {
    const { container } = render(
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

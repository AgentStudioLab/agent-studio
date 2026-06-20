import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "scheduled.keepAwake.description": "让计划任务执行时保持电脑唤醒。",
        "scheduled.keepAwake.toggle": "保持唤醒",
      };
      return translations[key] ?? key;
    },
  }),
}));

const { KeepAwakeBanner } = require("./KeepAwakeBanner") as typeof import("./KeepAwakeBanner");

afterEach(() => {
  cleanup();
});

afterAll(() => {
  mock.restore();
});

describe("KeepAwakeBanner", () => {
  it("uses the system theme color when keep awake is enabled", () => {
    render(<KeepAwakeBanner defaultEnabled />);

    const toggle = screen.getByRole("button", { name: "保持唤醒" });

    // 启用态是主操作视觉，必须走 primary token 而不是固定 accent 色。
    expect(toggle.className).toContain("bg-primary");
    expect(toggle.className).toContain("text-primary-foreground");
    expect(toggle.className).toContain("hover:bg-primary/90");
    expect(toggle.className).not.toContain("accent-100");
  });
});

import { describe, expect, it } from "bun:test";
import {
  defaultThemeId,
  getTheme,
  listThemes,
  registerTheme,
} from "./registry";

describe("theme registry", () => {
  it("ships terracotta as the default theme", () => {
    expect(defaultThemeId()).toBe("terracotta");
    const t = getTheme("terracotta");
    expect(t).toBeDefined();
    expect(t!.isDefault).toBe(true);
    expect(t!.nameKey).toBe("settings.appearance.brands.terracotta");
  });

  it("lists registered themes sorted by order", () => {
    registerTheme({ id: "z-test", nameKey: "x", swatch: { brand: "--a", accent: "--b" }, order: 99 });
    registerTheme({ id: "a-test", nameKey: "y", swatch: { brand: "--a", accent: "--b" }, order: -5 });
    const ids = listThemes().map((t) => t.id);
    expect(ids.indexOf("a-test")).toBeLessThan(ids.indexOf("terracotta"));
    expect(ids.indexOf("terracotta")).toBeLessThan(ids.indexOf("z-test"));
  });

  it("registerTheme upserts by id", () => {
    registerTheme({ id: "dup", nameKey: "first", swatch: { brand: "--a", accent: "--b" }, order: 1 });
    registerTheme({ id: "dup", nameKey: "second", swatch: { brand: "--a", accent: "--b" }, order: 1 });
    expect(getTheme("dup")!.nameKey).toBe("second");
  });
});

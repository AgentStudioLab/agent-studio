import { describe, expect, test } from "bun:test";
import { languageDirective } from "./composeAppendPrompt";

describe("languageDirective", () => {
  test("emits a Chinese directive for zh locales", () => {
    expect(languageDirective("zh")).toContain("简体中文");
    expect(languageDirective("zh-CN")).toContain("简体中文");
    expect(languageDirective("ZH-Hans")).toContain("简体中文"); // case-insensitive
  });

  test("returns null for English (model default — no token cost)", () => {
    expect(languageDirective("en")).toBeNull();
    expect(languageDirective("en-US")).toBeNull();
  });

  test("returns null when locale is missing", () => {
    expect(languageDirective(undefined)).toBeNull();
    expect(languageDirective("")).toBeNull();
  });
});

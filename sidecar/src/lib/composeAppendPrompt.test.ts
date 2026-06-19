import { describe, expect, test } from "bun:test";
import { languageDirective } from "./composeAppendPrompt";

describe("languageDirective", () => {
  test("emits a Chinese directive for zh locales", () => {
    expect(languageDirective("zh")).toContain("简体中文");
    expect(languageDirective("zh-CN")).toContain("简体中文");
    expect(languageDirective("ZH-Hans")).toContain("简体中文"); // case-insensitive
  });

  test("asks process updates to stay in Chinese too", () => {
    expect(languageDirective("zh-CN")).toContain("过程更新");
    expect(languageDirective("zh-CN")).toContain("工具调用前后的简短说明");
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

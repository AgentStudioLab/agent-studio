import { describe, expect, it } from "bun:test";
import { BUILT_IN_PROFILES, getBuiltInProfile } from "./providerProfiles";

describe("providerProfiles", () => {
  it("includes exactly the requested built-in providers with unique ids", () => {
    type BuiltInProviderId = (typeof BUILT_IN_PROFILES)[number]["id"];

    const expected: BuiltInProviderId[] = [
      "anthropic",
      "deepseek",
      "gemini",
      "openai",
      "minimax",
      "openrouter",
      "novita",
      "bedrock",
      "dashscope",
      "siliconflow-cn",
      "siliconflow",
      "zhipu",
      "moonshot-cn",
      "moonshot-global",
      "doubao",
      "volcengine-ark",
      "bailian",
      "qianfan",
      "hunyuan",
    ];
    const ids: BuiltInProviderId[] = BUILT_IN_PROFILES.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...expected].sort());
    expect(ids).not.toContain("custom");
  });

  it("marks providers with remote model capability from modelList strategy", () => {
    for (const profile of BUILT_IN_PROFILES) {
      expect(profile.supportsRemoteModels).toBe(
        profile.modelList.strategy !== "static",
      );
    }
  });

  it("declares the OpenAI v1 model catalog endpoint explicitly", () => {
    const profile = getBuiltInProfile("openai");

    expect(profile?.baseUrl).toBe("https://api.openai.com/v1");
    expect(profile?.modelList).toEqual({
      strategy: "openai-compatible",
      path: "/models",
    });
  });

  it("keeps a curated fallback model list for every built-in provider", () => {
    for (const profile of BUILT_IN_PROFILES) {
      expect(profile.models.length).toBeGreaterThan(0);
      for (const model of profile.models) {
        expect(model.id.length).toBeGreaterThan(0);
        expect(model.displayName.length).toBeGreaterThan(0);
        expect(model.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks non-runtime-compatible presets with a compatibility note", () => {
    for (const profile of BUILT_IN_PROFILES) {
      if (profile.id === "anthropic" || profile.id === "deepseek") continue;
      expect(profile.compatibilityNote).toBeTruthy();
    }
  });
});

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

  it("configures SiliconFlow model list and runtime as OpenAI-compatible", () => {
    const cn = getBuiltInProfile("siliconflow-cn");
    const global = getBuiltInProfile("siliconflow");

    expect(cn?.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(cn?.modelList).toEqual({
      strategy: "openai-compatible",
      path: "/models",
    });
    expect(cn?.agentRuntime).toEqual({
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
      auth: "bearer",
      capabilities: {
        text: true,
        tools: false,
        fileCheckpoint: false,
      },
    });

    expect(global?.baseUrl).toBe("https://api.siliconflow.com/v1");
    expect(global?.agentRuntime).toEqual({
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.com/v1",
      auth: "bearer",
      capabilities: {
        text: true,
        tools: false,
        fileCheckpoint: false,
      },
    });
  });

  it("configures OpenAI-compatible providers with OpenAI text runtime", () => {
    const openai = getBuiltInProfile("openai");
    const dashscope = getBuiltInProfile("dashscope");

    expect(openai?.agentRuntime).toEqual({
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      capabilities: {
        text: true,
        tools: false,
        fileCheckpoint: false,
      },
    });

    expect(dashscope?.agentRuntime.protocol).toBe("openai-compatible");
    expect(dashscope?.agentRuntime.capabilities).toEqual({
      text: true,
      tools: false,
      fileCheckpoint: false,
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

  it("marks non-anthropic-runtime presets with a compatibility note", () => {
    for (const profile of BUILT_IN_PROFILES) {
      if (
        profile.agentRuntime.protocol === "anthropic" ||
        profile.id === "openai"
      ) {
        continue;
      }
      expect(profile.compatibilityNote).toBeTruthy();
    }
  });
});

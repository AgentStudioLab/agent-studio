import { describe, expect, it } from "bun:test";
import { buildClaudeProviderEnv } from "./provider";

describe("buildClaudeProviderEnv", () => {
  it("uses ANTHROPIC_API_KEY for x-api-key auth", () => {
    const env = buildClaudeProviderEnv(
      {
        ANTHROPIC_AUTH_TOKEN: "stale",
        ANTHROPIC_API_KEY: "stale-key",
      },
      {
        apiKey: "key-1",
        baseUrl: "https://api.anthropic.com",
        authMode: "x-api-key",
        model: "claude-sonnet-4-6",
      },
    );

    expect(env.ANTHROPIC_API_KEY).toBe("key-1");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-6");
  });

  it("uses ANTHROPIC_AUTH_TOKEN for bearer auth", () => {
    const env = buildClaudeProviderEnv(
      {
        ANTHROPIC_API_KEY: "stale-key",
        ANTHROPIC_AUTH_TOKEN: "stale-token",
      },
      {
        apiKey: "sf-key",
        baseUrl: "https://api.siliconflow.cn",
        authMode: "bearer",
      },
    );

    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sf-key");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.siliconflow.cn");
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });

  it("can target the managed CCR endpoint with a route model", () => {
    const env = buildClaudeProviderEnv(
      {
        ANTHROPIC_BASE_URL: "https://stale.example",
        ANTHROPIC_MODEL: "stale-model",
      },
      {
        apiKey: "router-key",
        baseUrl: "http://127.0.0.1:3456",
        authMode: "x-api-key",
        model: "agentstudio/conn_openai/gpt-5.1",
      },
    );

    expect(env.ANTHROPIC_API_KEY).toBe("router-key");
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:3456");
    expect(env.ANTHROPIC_MODEL).toBe("agentstudio/conn_openai/gpt-5.1");
  });
});

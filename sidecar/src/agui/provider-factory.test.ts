import { describe, expect, it } from "bun:test";
import { createAgentProviderForRuntime } from "./provider-factory";

describe("createAgentProviderForRuntime", () => {
  it("creates a Claude provider for Anthropic runtimes", () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        auth: "x-api-key",
        capabilities: { text: true, tools: true, fileCheckpoint: true },
      },
      apiKey: "anthropic-key",
      defaultModel: "claude-sonnet-4-6",
      common: {
        resolveAllowedTools: () => [],
      },
    });

    expect(provider.name).toBe("claude-agent-sdk");
  });

  it("rejects OpenAI-compatible runtimes after CCR convergence", () => {
    expect(() =>
      createAgentProviderForRuntime({
        runtime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
        apiKey: "openai-key",
        defaultModel: "gpt-5.1",
        common: {
          resolveAllowedTools: () => [],
        },
      }),
    ).toThrow("agent_runtime_not_supported");
  });
});

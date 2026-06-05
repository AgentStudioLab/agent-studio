import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createAgentProviderForRuntime } from "./provider-factory";

describe("createAgentProviderForRuntime", () => {
  it("creates a Claude provider for Anthropic runtimes", () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "anthropic",
        baseUrl: "https://api.siliconflow.cn",
        auth: "bearer",
        capabilities: { text: true, tools: true, fileCheckpoint: true },
      },
      apiKey: "sf-key",
      defaultModel: undefined,
      common: {
        resolveAllowedTools: () => [],
      },
    });

    expect(provider.name).toBe("claude-agent-sdk");
  });

  it("creates an OpenAI-compatible provider for OpenAI runtimes", () => {
    const provider = createAgentProviderForRuntime({
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
    });

    expect(provider.name).toBe("openai-compatible");
  });

  it("uses the provider-selected model when no per-run model is provided", async () => {
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.siliconflow.cn/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
      apiKey: "sf-key",
      defaultModel: "deepseek-ai/DeepSeek-V3.2",
      common: {
        resolveAllowedTools: () => [],
      },
      openAI: {
        streamTextImpl: ((input: { model: { modelId: string } }) => {
          expect(input.model.modelId).toBe("deepseek-ai/DeepSeek-V3.2");
          return {
            textStream: (async function* () {
              yield "ok";
            })(),
            usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          };
        }) as never,
      },
    });

    const events = [];
    for await (const event of provider.run({
      threadId: "thread",
      runId: "run",
      userMessage: { role: "user", content: "hi" },
      abortSignal: new AbortController().signal,
      cwd: "/tmp",
      permissionMode: "ask",
    })) {
      events.push(event.type);
    }

    expect(events).toContain(EventType.RUN_FINISHED);
  });
});

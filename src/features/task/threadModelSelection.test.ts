import { describe, expect, it } from "bun:test";
import type {
  EnabledModelOption,
  ProviderModelSelection,
} from "@/lib/data/settings";
import { resolveThreadProviderSelection } from "./threadModelSelection";

const enabledModels: EnabledModelOption[] = [
  {
    providerId: "conn-openai",
    providerName: "OpenAI",
    providerLabel: "OpenAI",
    managed: true,
    modelId: "gpt-5.1",
    modelLabel: "GPT-5.1",
    modelDescription: "Flagship",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  },
  {
    providerId: "conn-sf",
    providerName: "SiliconFlow",
    providerLabel: "SiliconFlow",
    managed: true,
    modelId: "deepseek-ai/DeepSeek-V3.2",
    modelLabel: "DeepSeek V3.2",
    modelDescription: "Remote",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  },
];

const defaultSelection: ProviderModelSelection = {
  providerId: "conn-openai",
  modelId: "gpt-5.1",
};

describe("resolveThreadProviderSelection", () => {
  it("resolves a unique conversation model to its provider selection", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "deepseek-ai/DeepSeek-V3.2",
        enabledModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual({
      providerId: "conn-sf",
      modelId: "deepseek-ai/DeepSeek-V3.2",
    });
  });

  it("prefers the local selection after the user changes the picker", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "gpt-5.1",
        enabledModels,
        defaultSelection,
        localSelection: {
          providerId: "conn-sf",
          modelId: "deepseek-ai/DeepSeek-V3.2",
        },
      }),
    ).toEqual({
      providerId: "conn-sf",
      modelId: "deepseek-ai/DeepSeek-V3.2",
    });
  });

  it("uses the global default provider when multiple providers expose the same model id", () => {
    const duplicateModels = [
      ...enabledModels,
      {
        ...enabledModels[0]!,
        providerId: "conn-alt-openai",
        providerName: "Alt OpenAI",
        providerLabel: "Alt OpenAI",
      },
    ];

    expect(
      resolveThreadProviderSelection({
        conversationModel: "gpt-5.1",
        enabledModels: duplicateModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual(defaultSelection);
  });

  it("falls back to the global default when the conversation model is unavailable", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: "removed-model",
        enabledModels,
        defaultSelection,
        localSelection: null,
      }),
    ).toEqual(defaultSelection);
  });

  it("returns null when no local, conversation, or global selection is available", () => {
    expect(
      resolveThreadProviderSelection({
        conversationModel: null,
        enabledModels: [],
        defaultSelection: null,
        localSelection: null,
      }),
    ).toBeNull();
  });
});

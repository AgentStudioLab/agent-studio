import type { AgentRuntime } from "../lib/providerProfiles";
import type { AgentProvider } from "./core";
import {
  createClaudeProvider,
  type ClaudeProviderOptions,
} from "./provider-claude";
import { createOpenAICompatibleProvider } from "./provider-openai";
import type { OpenAICompatibleProviderOptions } from "./provider-openai";

export interface ProviderFactoryInput {
  runtime: AgentRuntime;
  apiKey: string;
  defaultModel?: string;
  common: Omit<
    ClaudeProviderOptions,
    "apiKey" | "baseUrl" | "authMode" | "model"
  >;
  openAI?: Partial<
    Pick<OpenAICompatibleProviderOptions, "streamTextImpl">
  >;
}

export function createAgentProviderForRuntime(
  input: ProviderFactoryInput,
): AgentProvider {
  const { runtime, apiKey, defaultModel, common } = input;
  if (runtime.protocol === "anthropic") {
    return createClaudeProvider({
      ...common,
      apiKey,
      baseUrl: runtime.baseUrl,
      authMode: runtime.auth,
      model: defaultModel,
    });
  }

  if (runtime.protocol === "openai-compatible") {
    return createOpenAICompatibleProvider({
      apiKey,
      baseUrl: runtime.baseUrl,
      model: defaultModel,
      ...input.openAI,
    });
  }

  throw new Error("agent_runtime_not_supported");
}

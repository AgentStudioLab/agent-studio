import type { AgentRuntime } from "../lib/providerProfiles";
import type { AgentProvider } from "./core";
import {
  createClaudeProvider,
  type ClaudeProviderOptions,
} from "./provider-claude";

export interface ProviderFactoryInput {
  runtime: AgentRuntime;
  apiKey: string;
  defaultModel?: string;
  common: Omit<
    ClaudeProviderOptions,
    "apiKey" | "baseUrl" | "authMode" | "model"
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

  throw new Error("agent_runtime_not_supported");
}

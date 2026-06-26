import type { ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import type { CustomProviderProtocol } from "../services/providerSettings";

export function thinkingConfigForCcrProtocol(
  protocol: CustomProviderProtocol | undefined,
): ThinkingConfig | null {
  if (protocol !== "openai-responses") return null;
  // Claude SDK 的 adaptive thinking 会按模型名判断能力；CCR model key 是
  // `agentstudio/<provider>/<model>`，不会被 SDK 识别成可自适应思考模型。
  // 强制 enabled 才会让最终 /v1/messages 请求携带 Anthropic thinking 字段，
  // CCR openai-responses transformer 才能向上游 Responses 请求 reasoning summary。
  return { type: "enabled", budgetTokens: 1024, display: "summarized" };
}

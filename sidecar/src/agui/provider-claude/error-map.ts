// SDK 错误枚举 → 我们 RUN_ERROR.code 的映射。
//
// 单一映射点：前端 / 文案 / Banner 渲染全凭这套 code。
// SDK 加新 enum 时（authentication_failed 之外）这里要补 case；
// fallback 永远是 MODEL_ERROR（保证 UI 不崩）。

import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";

export type RunErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMIT"
  | "UPSTREAM_5XX"
  | "BILLING_ERROR"
  | "MODEL_ERROR"
  | "MAX_TURNS"
  | "MAX_BUDGET"
  | "EXECUTION_ERROR"
  | "WORKER_ERROR"
  | "CANCELLED";

export function mapAssistantError(e: SDKAssistantMessageError): RunErrorCode {
  switch (e) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return "AUTH_FAILED";
    case "rate_limit":
      return "RATE_LIMIT";
    case "server_error":
      return "UPSTREAM_5XX";
    case "billing_error":
      return "BILLING_ERROR";
    case "invalid_request":
    case "model_not_found":
    case "max_output_tokens":
    case "unknown":
    default:
      return "MODEL_ERROR";
  }
}

export function mapResultErrorSubtype(subtype: string): RunErrorCode {
  switch (subtype) {
    case "error_max_turns": return "MAX_TURNS";
    case "error_max_budget_usd": return "MAX_BUDGET";
    case "error_during_execution":
    case "error_max_structured_output_retries":
    default:
      return "EXECUTION_ERROR";
  }
}

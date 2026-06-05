export type OpenAIRunErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMIT"
  | "UPSTREAM_5XX"
  | "MODEL_ERROR"
  | "EXECUTION_ERROR"
  | "CANCELLED";

export function mapOpenAIError(err: unknown): {
  code: OpenAIRunErrorCode;
  message: string;
} {
  if (err instanceof Error && err.name === "AbortError") {
    return { code: "CANCELLED", message: err.message || "cancelled" };
  }

  const maybe = err as {
    status?: number;
    message?: string;
    error?: { message?: string };
  };
  const status = maybe?.status;
  const message =
    maybe?.error?.message ??
    maybe?.message ??
    (err instanceof Error ? err.message : String(err));

  if (status === 401 || status === 403) return { code: "AUTH_FAILED", message };
  if (status === 429) return { code: "RATE_LIMIT", message };
  if (typeof status === "number" && status >= 500) {
    return { code: "UPSTREAM_5XX", message };
  }
  if (typeof status === "number" && status >= 400) {
    return { code: "MODEL_ERROR", message };
  }
  return { code: "EXECUTION_ERROR", message };
}

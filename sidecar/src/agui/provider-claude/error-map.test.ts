import { describe, expect, it } from "bun:test";
import { mapAssistantError, mapResultErrorSubtype } from "./error-map";

describe("mapAssistantError", () => {
  it("maps auth errors", () => {
    expect(mapAssistantError("authentication_failed")).toBe("AUTH_FAILED");
    expect(mapAssistantError("oauth_org_not_allowed")).toBe("AUTH_FAILED");
  });
  it("maps rate_limit", () => {
    expect(mapAssistantError("rate_limit")).toBe("RATE_LIMIT");
  });
  it("maps server_error", () => {
    expect(mapAssistantError("server_error")).toBe("UPSTREAM_5XX");
  });
  it("maps billing_error", () => {
    expect(mapAssistantError("billing_error")).toBe("BILLING_ERROR");
  });
  it("falls back to MODEL_ERROR for unknown enum", () => {
    expect(mapAssistantError("invalid_request")).toBe("MODEL_ERROR");
    expect(mapAssistantError("model_not_found")).toBe("MODEL_ERROR");
    expect(mapAssistantError("max_output_tokens")).toBe("MODEL_ERROR");
    expect(mapAssistantError("unknown")).toBe("MODEL_ERROR");
  });
});

describe("mapResultErrorSubtype", () => {
  it("maps known subtypes", () => {
    expect(mapResultErrorSubtype("error_max_turns")).toBe("MAX_TURNS");
    expect(mapResultErrorSubtype("error_max_budget_usd")).toBe("MAX_BUDGET");
    expect(mapResultErrorSubtype("error_during_execution")).toBe("EXECUTION_ERROR");
    expect(mapResultErrorSubtype("error_max_structured_output_retries")).toBe("EXECUTION_ERROR");
  });
});

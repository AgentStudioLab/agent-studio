import { describe, expect, it } from "bun:test";
import {
  buildCcrModelKey,
  parseCcrModelKey,
  sanitizeCcrSegment,
} from "./model-key";

describe("CCR model keys", () => {
  it("builds stable route keys from provider and model ids", () => {
    expect(
      buildCcrModelKey({
        providerId: "conn_openai_main",
        modelId: "gpt-5.1",
      }),
    ).toBe("agentstudio/conn_openai_main/gpt-5.1");
  });

  it("escapes slashes and whitespace without depending on display names", () => {
    expect(
      buildCcrModelKey({
        providerId: "Open Router",
        modelId: "openai/gpt-5.1",
      }),
    ).toBe("agentstudio/Open%20Router/openai%2Fgpt-5.1");
  });

  it("parses keys back to original provider and model ids", () => {
    expect(parseCcrModelKey("agentstudio/Open%20Router/openai%2Fgpt-5.1")).toEqual({
      providerId: "Open Router",
      modelId: "openai/gpt-5.1",
    });
  });

  it("rejects non-Agent Studio keys", () => {
    expect(parseCcrModelKey("openrouter/anthropic/claude-sonnet")).toBeNull();
    expect(parseCcrModelKey("agentstudio/only-provider")).toBeNull();
  });

  it("normalizes empty segments to a stable placeholder", () => {
    expect(sanitizeCcrSegment("  ")).toBe("_");
  });
});

import { describe, expect, it } from "bun:test";
import { thinkingConfigForCcrProtocol } from "./thinking";

describe("thinkingConfigForCcrProtocol", () => {
  it("forces summarized thinking for OpenAI Responses routes", () => {
    expect(thinkingConfigForCcrProtocol("openai-responses")).toEqual({
      type: "enabled",
      budgetTokens: 1024,
      display: "summarized",
    });
  });

  it("does not request thinking for OpenAI Chat Completions routes", () => {
    expect(thinkingConfigForCcrProtocol("openai-chat-completions")).toBeNull();
  });
});

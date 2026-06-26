import { describe, expect, it } from "bun:test";
import {
  buildCcrSmokeInputFromEnv,
  buildCcrSmokePlan,
  validateCcrSmokeInput,
} from "./smoke";

describe("CCR runtime smoke helpers", () => {
  it("builds a redacted smoke plan from OpenAI Chat Completions env", () => {
    const input = buildCcrSmokeInputFromEnv({
      AGENT_STUDIO_CCR_POC_BASE_URL: "https://api.openai.com/v1",
      AGENT_STUDIO_CCR_POC_API_KEY: "sk-openai-secret",
      AGENT_STUDIO_CCR_POC_MODEL: "gpt-5.1",
      AGENT_STUDIO_CCR_POC_PROVIDER_ID: "conn_openai",
      AGENT_STUDIO_CCR_POC_PROVIDER_NAME: "OpenAI Main",
      AGENT_STUDIO_CCR_POC_PROTOCOL: "openai-chat-completions",
      AGENT_STUDIO_CCR_POC_ROUTER_API_KEY: "router-secret",
      AGENT_STUDIO_CCR_POC_ROUTER_PORT: "4555",
    });

    const plan = buildCcrSmokePlan(input);

    expect(plan.route).toMatchObject({
      baseUrl: "http://127.0.0.1:4555",
      apiKey: "router-secret",
      model: "agentstudio/conn_openai/gpt-5.1",
      upstream: {
        protocol: "openai-chat-completions",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai-secret",
      },
    });
    expect(plan.redactedConfig.APIKEY).toBe("rou...cret");
    expect(plan.redactedConfig.Providers[0]?.api_key).toBe("sk-...cret");
    expect(plan.redactedRoute.apiKey).toBe("rou...cret");
    expect(plan.redactedRoute.upstream.apiKey).toBe("sk-...cret");
  });

  it("reports missing required env names without leaking values", () => {
    const input = buildCcrSmokeInputFromEnv({
      AGENT_STUDIO_CCR_POC_BASE_URL: "https://api.openai.com/v1",
    });

    expect(validateCcrSmokeInput(input)).toEqual([
      "AGENT_STUDIO_CCR_POC_API_KEY",
      "AGENT_STUDIO_CCR_POC_MODEL",
    ]);
  });

  it("defaults to OpenAI Chat Completions protocol and stable provider metadata", () => {
    const input = buildCcrSmokeInputFromEnv({
      AGENT_STUDIO_CCR_POC_BASE_URL: "https://openrouter.ai/api/v1",
      AGENT_STUDIO_CCR_POC_API_KEY: "sk-openrouter",
      AGENT_STUDIO_CCR_POC_MODEL: "openai/gpt-5.1",
    });

    const plan = buildCcrSmokePlan(input);

    expect(plan.route.model).toBe("agentstudio/ccr_poc/openai%2Fgpt-5.1");
    expect(plan.route.upstream.providerId).toBe("ccr_poc");
    expect(plan.route.upstream.providerName).toBe("CCR PoC Provider");
    expect(plan.route.upstream.protocol).toBe("openai-chat-completions");
  });

  it("reads diagnostic logging and allowed tool env for PoC runs", () => {
    const input = buildCcrSmokeInputFromEnv({
      AGENT_STUDIO_CCR_POC_BASE_URL: "https://api.openai.com/v1",
      AGENT_STUDIO_CCR_POC_API_KEY: "sk-openai-secret",
      AGENT_STUDIO_CCR_POC_MODEL: "gpt-5.1",
      AGENT_STUDIO_CCR_POC_ALLOWED_TOOLS: "Read, Glob",
      AGENT_STUDIO_CCR_LOG: "1",
      AGENT_STUDIO_CCR_LOG_LEVEL: "trace",
    });

    const plan = buildCcrSmokePlan(input);

    expect(input.allowedTools).toEqual(["Read", "Glob"]);
    expect(plan.config.LOG).toBe(true);
    expect(plan.config.LOG_LEVEL).toBe("trace");
  });
});

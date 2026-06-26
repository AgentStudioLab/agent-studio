import { describe, expect, it } from "bun:test";
import type { CcrRuntimeRoute } from "./routes";
import {
  buildAgentStudioCcrConfig,
  redactAgentStudioCcrConfig,
} from "./config";

const openaiRoute: CcrRuntimeRoute = {
  runtime: "claude-agent-sdk",
  gateway: "claude-code-router",
  baseUrl: "http://127.0.0.1:3456",
  authMode: "x-api-key",
  apiKey: "router-key",
  model: "agentstudio/conn_openai/gpt-5.1",
    upstream: {
      providerId: "conn_openai",
      providerName: "OpenAI Main",
    protocol: "openai-chat-completions",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-openai",
    modelId: "gpt-5.1",
  },
};

describe("buildAgentStudioCcrConfig", () => {
  it("builds a real CCR config from route models", () => {
    const config = buildAgentStudioCcrConfig([openaiRoute]);

    expect(config).toMatchObject({
      APIKEY: "router-key",
      HOST: "127.0.0.1",
      PORT: 3456,
      LOG: false,
      NON_INTERACTIVE_MODE: true,
      Router: {
        default: "agentstudio_conn_openai_gpt-5.1,gpt-5.1",
      },
    });
    expect(config.Providers).toEqual([
      {
        name: "agentstudio_conn_openai_gpt-5.1",
        api_base_url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk-openai",
        models: ["gpt-5.1"],
        transformer: { use: ["reasoning"] },
      },
    ]);
  });

  it("routes OpenAI Responses providers to /responses with openai-responses transformer", () => {
    const responsesRoute: CcrRuntimeRoute = {
      ...openaiRoute,
      upstream: {
        ...openaiRoute.upstream,
        protocol: "openai-responses",
        baseUrl: "https://aiproxy.cloud-ip.cc/v1",
        modelId: "gpt-5.5",
      },
    };

    const config = buildAgentStudioCcrConfig([responsesRoute]);

    expect(config.Providers[0]).toMatchObject({
      api_base_url: "https://aiproxy.cloud-ip.cc/v1/responses",
      models: ["gpt-5.5"],
      transformer: { use: ["openai-responses"] },
    });
  });

  it("can enable CCR trace logs for diagnosis without changing route output", () => {
    const config = buildAgentStudioCcrConfig([openaiRoute], {
      log: true,
      logLevel: "trace",
    });

    expect(config.LOG).toBe(true);
    expect(config.LOG_LEVEL).toBe("trace");
    expect(config.Router.default).toBe("agentstudio_conn_openai_gpt-5.1,gpt-5.1");
  });

  it("deduplicates by model key and keeps the later route", () => {
    const next = {
      ...openaiRoute,
      upstream: { ...openaiRoute.upstream, apiKey: "sk-new" },
    };
    const config = buildAgentStudioCcrConfig([openaiRoute, next]);

    expect(config.Providers).toHaveLength(1);
    expect(config.Providers[0]?.api_key).toBe("sk-new");
  });

  it("keeps every enabled OpenAI-compatible route in one stable config", () => {
    const secondRoute: CcrRuntimeRoute = {
      ...openaiRoute,
      model: "agentstudio/conn_openai/claude-opus-4-7",
      upstream: {
        ...openaiRoute.upstream,
        modelId: "claude-opus-4-7",
      },
    };

    const config = buildAgentStudioCcrConfig([openaiRoute, secondRoute]);

    expect(config.Providers.map((provider) => provider.name)).toEqual([
      "agentstudio_conn_openai_gpt-5.1",
      "agentstudio_conn_openai_claude-opus-4-7",
    ]);
    expect(config.Providers.map((provider) => provider.models)).toEqual([
      ["gpt-5.1"],
      ["claude-opus-4-7"],
    ]);
    expect(config.Router.default).toBe("agentstudio_conn_openai_gpt-5.1,gpt-5.1");
  });

  it("redacts API keys for logs", () => {
    const config = buildAgentStudioCcrConfig([openaiRoute]);
    const redacted = redactAgentStudioCcrConfig(config);

    expect(redacted.APIKEY).toBe("rou...-key");
    expect(redacted.Providers[0]?.api_key).toBe("sk-...enai");
  });
});

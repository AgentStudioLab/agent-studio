import { describe, expect, it } from "bun:test";
import type {
  EnabledModelOption,
  ProviderModelSelection,
  ProviderSettingsState,
  ResolvedProviderForRun,
} from "../services/providerSettings";
import type { AgentStudioCcrConfig } from "./config";
import { CcrRuntimeService } from "./runtime-service";
import type { CcrStatus } from "./manager";

function resolvedProvider(
  overrides: Partial<ResolvedProviderForRun> = {},
): ResolvedProviderForRun {
  const modelId = overrides.modelId ?? "gpt-5.1";
  return {
    presetId: overrides.providerId ?? "conn-openai",
    presetName: overrides.providerName ?? "OpenAI Relay",
    providerId: overrides.providerId ?? "conn-openai",
    providerName: overrides.providerName ?? "OpenAI Relay",
    managed: overrides.managed ?? false,
    profileId: overrides.profileId ?? "openai",
    label: overrides.label ?? "OpenAI",
    baseUrl: overrides.baseUrl ?? "https://relay.example/v1",
    apiKey: overrides.apiKey ?? "sk-relay",
    customProtocol: overrides.customProtocol ?? "openai-chat-completions",
    models: [
      {
        id: modelId ?? "gpt-5.1",
        displayName: modelId ?? "GPT-5.1",
        description: "Remote model",
      },
    ],
    remoteModelsFetchedAt: "",
    selectedModelId: null,
    modelId,
    supportsRemoteModels: true,
    agentRuntime: overrides.agentRuntime ?? {
      protocol: "openai-compatible",
      baseUrl: overrides.baseUrl ?? "https://relay.example/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
    ...overrides,
  };
}

function option(
  providerId: string,
  modelId: string,
  overrides: Partial<EnabledModelOption> = {},
): EnabledModelOption {
  return {
    providerId,
    providerName: providerId,
    providerLabel: providerId,
    managed: false,
    modelId,
    modelLabel: modelId,
    modelDescription: "",
    customProtocol: "openai-chat-completions",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://relay.example/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
    ...overrides,
  };
}

function providerSettingsFixture(input: {
  options: EnabledModelOption[];
  resolved: Record<string, ResolvedProviderForRun>;
}): ProviderSettingsState {
  return {
    listEnabledModelSelections: () => input.options,
    resolveSelection: (selection?: ProviderModelSelection | null) => {
      const key = `${selection?.providerId ?? "conn-openai"}:${selection?.modelId ?? "gpt-5.1"}`;
      const resolved = input.resolved[key];
      if (!resolved) throw new Error(`missing_selection:${key}`);
      return resolved;
    },
  } as ProviderSettingsState;
}

function managerFixture() {
  const applied: Array<{ config: AgentStudioCcrConfig; routeKeys: string[] }> = [];
  let statusPhase: CcrStatus["phase"] = "ready";
  return {
    applied,
    setPhase: (phase: CcrStatus["phase"]) => {
      statusPhase = phase;
    },
    manager: {
      baseUrl: () => "http://127.0.0.1:3456",
      applyConfig: async (config: AgentStudioCcrConfig, routeKeys: string[]) => {
        applied.push({ config, routeKeys });
      },
      stop: async () => {},
      status: (): CcrStatus => ({
        enabled: true,
        phase: statusPhase,
        running: statusPhase === "ready",
        baseUrl: "http://127.0.0.1:3456",
        routeCount: applied.at(-1)?.routeKeys.length ?? 0,
        routeKeys: applied.at(-1)?.routeKeys ?? [],
      }),
    },
  };
}

describe("CcrRuntimeService", () => {
  it("applies one CCR config containing all enabled OpenAI-compatible routes", async () => {
    const settings = providerSettingsFixture({
      options: [
        option("conn-openai", "gpt-5.1"),
        option("conn-openai", "claude-opus-4-7"),
        option("conn-ant", "claude-sonnet-4-6", {
          customProtocol: "anthropic",
          agentRuntime: {
            protocol: "anthropic",
            baseUrl: "https://api.anthropic.com",
            auth: "x-api-key",
            capabilities: { text: true, tools: true, fileCheckpoint: true },
          },
        }),
        option("official", "gpt-5.1", { managed: true }),
      ],
      resolved: {
        "conn-openai:gpt-5.1": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.1",
        }),
        "conn-openai:claude-opus-4-7": resolvedProvider({
          providerId: "conn-openai",
          modelId: "claude-opus-4-7",
        }),
      },
    });
    const { manager, applied } = managerFixture();
    const service = new CcrRuntimeService({
      providerSettings: settings,
      manager,
      configOptions: {},
    });

    await service.refreshFromSettings("test");

    expect(applied).toHaveLength(1);
    expect(applied[0]?.routeKeys).toEqual([
      "agentstudio/conn-openai/gpt-5.1",
      "agentstudio/conn-openai/claude-opus-4-7",
    ]);
    expect(applied[0]?.config.Providers.map((provider) => provider.models)).toEqual([
      ["gpt-5.1"],
      ["claude-opus-4-7"],
    ]);
  });

  it("resolves a run route without applying or restarting CCR", () => {
    const settings = providerSettingsFixture({
      options: [option("conn-openai", "gpt-5.1")],
      resolved: {
        "conn-openai:gpt-5.1": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.1",
        }),
      },
    });
    const { manager, applied } = managerFixture();
    const service = new CcrRuntimeService({
      providerSettings: settings,
      manager,
      configOptions: {},
    });

    const route = service.resolveRouteForSelection({
      providerId: "conn-openai",
      modelId: "gpt-5.1",
    });

    expect(route.model).toBe("agentstudio/conn-openai/gpt-5.1");
    expect(applied).toHaveLength(0);
  });

  it("reports applying while CCR is restarting", async () => {
    const settings = providerSettingsFixture({
      options: [option("conn-openai", "gpt-5.1")],
      resolved: {
        "conn-openai:gpt-5.1": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.1",
        }),
      },
    });
    const { manager, setPhase } = managerFixture();
    const service = new CcrRuntimeService({
      providerSettings: settings,
      manager,
      configOptions: {},
    });

    await service.refreshFromSettings("test");
    setPhase("applying");

    expect(service.status()).toMatchObject({
      phase: "applying",
      routeCount: 1,
      routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
    });
  });

  it("exposes manager diagnostics without leaking config contents", async () => {
    const settings = providerSettingsFixture({
      options: [option("conn-openai", "gpt-5.1")],
      resolved: {
        "conn-openai:gpt-5.1": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.1",
        }),
      },
    });
    const { manager } = managerFixture();
    const originalStatus = manager.status;
    manager.status = () => ({
      ...originalStatus(),
      configSignature: "signature-123",
      applyingSince: "2026-06-23T10:00:00.000Z",
      lastAppliedAt: "2026-06-23T10:00:01.000Z",
    });
    const service = new CcrRuntimeService({
      providerSettings: settings,
      manager,
      configOptions: {},
    });

    await service.refreshFromSettings("test");

    expect(service.status()).toMatchObject({
      configSignature: "signature-123",
      applyingSince: "2026-06-23T10:00:00.000Z",
      lastAppliedAt: expect.any(String),
    });
  });

  it("keeps the last applied route snapshot when applying new settings fails", async () => {
    let failNextApply = false;
    const settings = providerSettingsFixture({
      options: [option("conn-openai", "gpt-5.1")],
      resolved: {
        "conn-openai:gpt-5.1": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.1",
        }),
        "conn-openai:gpt-5.5": resolvedProvider({
          providerId: "conn-openai",
          modelId: "gpt-5.5",
        }),
      },
    });
    const { manager } = managerFixture();
    const originalApply = manager.applyConfig;
    manager.applyConfig = async (config, routeKeys) => {
      if (failNextApply) throw new Error("ccr_apply_failed");
      await originalApply(config, routeKeys);
    };
    const service = new CcrRuntimeService({
      providerSettings: settings,
      manager,
      configOptions: {},
    });

    await service.refreshFromSettings("initial");
    settings.listEnabledModelSelections = () => [option("conn-openai", "gpt-5.5")];
    failNextApply = true;

    await expect(service.refreshFromSettings("changed")).rejects.toThrow(
      "ccr_apply_failed",
    );

    expect(service.status()).toMatchObject({
      phase: "error",
      routeCount: 1,
      routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
      lastError: "ccr_apply_failed",
    });
  });
});

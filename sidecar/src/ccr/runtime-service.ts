import type {
  EnabledModelOption,
  ProviderModelSelection,
  ProviderSettingsState,
} from "../services/providerSettings";
import {
  buildAgentStudioCcrConfig,
  type AgentStudioCcrConfigOptions,
} from "./config";
import type { CcrManager, CcrStatus } from "./manager";
import { resolveCcrRuntimeRoute, type CcrRuntimeRoute } from "./routes";

export type CcrRuntimePhase =
  | "disabled"
  | "empty"
  | "applying"
  | "ready"
  | "error";

export interface CcrRuntimeStatus {
  enabled: boolean;
  phase: CcrRuntimePhase;
  baseUrl: string;
  routeCount: number;
  routeKeys: string[];
  configSignature?: string;
  pid?: number;
  applyingSince?: string;
  lastAppliedAt?: string;
  lastError?: string;
}

export interface CcrRuntimeServiceOptions {
  providerSettings: ProviderSettingsState;
  manager: Pick<CcrManager, "baseUrl" | "status" | "stop"> & {
    applyConfig?: (
      config: Parameters<CcrManager["ensure"]>[0],
      routeKeys: string[],
    ) => Promise<void>;
    ensure?: CcrManager["ensure"];
  };
  configOptions: AgentStudioCcrConfigOptions;
}

function isOpenAICompatible(option: EnabledModelOption): boolean {
  if (option.managed) return false;
  return (
    option.customProtocol === "openai-chat-completions" ||
    option.customProtocol === "openai-responses" ||
    option.agentRuntime.protocol === "openai-compatible"
  );
}

function managerPhase(status: CcrStatus, routeCount: number): CcrRuntimePhase {
  if (!status.enabled) return "disabled";
  if (status.phase === "applying") return "applying";
  if (status.error) return "error";
  if (status.phase === "error") return "error";
  if (routeCount === 0) return "empty";
  return status.running ? "ready" : "empty";
}

export class CcrRuntimeService {
  private readonly routes = new Map<string, CcrRuntimeRoute>();
  private lastError: string | undefined;
  private lastAppliedAt: string | undefined;

  constructor(private readonly options: CcrRuntimeServiceOptions) {}

  status(): CcrRuntimeStatus {
    const managerStatus = this.options.manager.status();
    const routeKeys = [...this.routes.keys()];
    const phase = this.lastError
      ? "error"
      : managerPhase(managerStatus, routeKeys.length);
    return {
      enabled: managerStatus.enabled,
      phase,
      baseUrl: managerStatus.baseUrl,
      routeCount: routeKeys.length,
      routeKeys,
      ...(managerStatus.pid ? { pid: managerStatus.pid } : {}),
      ...(managerStatus.configSignature
        ? { configSignature: managerStatus.configSignature }
        : {}),
      ...(managerStatus.applyingSince
        ? { applyingSince: managerStatus.applyingSince }
        : {}),
      ...(managerStatus.lastAppliedAt || this.lastAppliedAt
        ? { lastAppliedAt: managerStatus.lastAppliedAt ?? this.lastAppliedAt }
        : {}),
      ...(managerStatus.error || this.lastError
        ? { lastError: managerStatus.error ?? this.lastError }
        : {}),
    };
  }

  async refreshFromSettings(_reason: string): Promise<void> {
    const routes = this.buildRoutesFromSettings();

    if (routes.length === 0) {
      await this.options.manager.stop();
      this.routes.clear();
      this.lastAppliedAt = undefined;
      this.lastError = undefined;
      return;
    }

    try {
      const config = buildAgentStudioCcrConfig(routes, this.options.configOptions);
      const routeKeys = routes.map((route) => route.model);
      if (this.options.manager.applyConfig) {
        await this.options.manager.applyConfig(config, routeKeys);
      } else if (this.options.manager.ensure) {
        await this.options.manager.ensure(config);
      } else {
        throw new Error("ccr_manager_apply_not_configured");
      }
      this.routes.clear();
      for (const route of routes) {
        this.routes.set(route.model, route);
      }
      this.lastAppliedAt = new Date().toISOString();
      this.lastError = undefined;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  resolveRouteForSelection(
    selection: ProviderModelSelection | null | undefined,
  ): CcrRuntimeRoute {
    const resolved = this.options.providerSettings.resolveSelection(selection);
    return resolveCcrRuntimeRoute(resolved, {
      baseUrl: this.options.manager.baseUrl(),
    });
  }

  async ensureReadyForRoute(route: CcrRuntimeRoute): Promise<void> {
    const status = this.status();
    if (!this.routes.has(route.model)) {
      throw new Error(`ccr_route_not_applied:${route.model}`);
    }
    if (status.phase !== "ready") {
      throw new Error(`ccr_${status.phase}`);
    }
  }

  private buildRoutesFromSettings(): CcrRuntimeRoute[] {
    const routes: CcrRuntimeRoute[] = [];
    for (const option of this.options.providerSettings.listEnabledModelSelections()) {
      if (!isOpenAICompatible(option)) continue;
      const resolved = this.options.providerSettings.resolveSelection({
        providerId: option.providerId,
        modelId: option.modelId,
      });
      routes.push(
        resolveCcrRuntimeRoute(resolved, {
          baseUrl: this.options.manager.baseUrl(),
        }),
      );
    }
    return routes;
  }
}

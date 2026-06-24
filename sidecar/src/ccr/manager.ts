import type { AgentStudioCcrConfig } from "./config";
import { waitForCcrReady, waitForPortClosed } from "./health";

function configSignature(config: AgentStudioCcrConfig): string {
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, 16);
}

export interface CcrProcessHandle {
  pid?: number;
  stop: (signal?: NodeJS.Signals) => Promise<void>;
}

export interface CcrSpawnInput {
  port: number;
  configDir: string;
  config: AgentStudioCcrConfig;
}

export type CcrSpawn = (input: CcrSpawnInput) => Promise<CcrProcessHandle>;

export interface CcrManagerOptions {
  enabled: boolean;
  port: number;
  configDir: string;
  spawn: CcrSpawn;
  prepareConfig?: (input: CcrSpawnInput) => Promise<void>;
  waitForReady?: (baseUrl: string) => Promise<void>;
  waitForStopped?: (baseUrl: string) => Promise<void>;
  stopTimeoutMs?: number;
}

export interface CcrStatus {
  enabled: boolean;
  running: boolean;
  phase: "disabled" | "idle" | "applying" | "ready" | "error";
  baseUrl: string;
  pid?: number;
  routeCount: number;
  routeKeys: string[];
  configSignature?: string;
  applyingSince?: string;
  lastAppliedAt?: string;
  error?: string;
}

export class CcrManager {
  private handle: CcrProcessHandle | null = null;
  private error: string | undefined;
  private configSignature: string | undefined;
  private routeKeys: string[] = [];
  private phase: CcrStatus["phase"] = "idle";
  private applyingSince: string | undefined;
  private lastAppliedAt: string | undefined;
  private applyQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: CcrManagerOptions) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`;
  }

  async ensure(config: AgentStudioCcrConfig): Promise<void> {
    await this.applyConfig(config, []);
  }

  async applyConfig(
    config: AgentStudioCcrConfig,
    routeKeys: string[] = [],
  ): Promise<void> {
    const run = async () => {
      await this.applyConfigNow(config, routeKeys);
    };
    const next = this.applyQueue.then(run, run);
    this.applyQueue = next.catch(() => {});
    await next;
  }

  private async applyConfigNow(
    config: AgentStudioCcrConfig,
    routeKeys: string[],
  ): Promise<void> {
    if (!this.options.enabled) {
      this.error = "ccr_disabled";
      this.phase = "disabled";
      return;
    }
    const nextSignature = configSignature(config);
    if (this.handle && this.configSignature === nextSignature) {
      this.routeKeys = [...routeKeys];
      return;
    }

    this.phase = "applying";
    this.applyingSince = new Date().toISOString();
    const spawnInput = {
      port: this.options.port,
      configDir: this.options.configDir,
      config,
    };
    try {
      if (this.handle) {
        const oldHandle = this.handle;
        await this.stopHandleWithTimeout(oldHandle);
        this.handle = null;
        this.configSignature = undefined;
        await (this.options.waitForStopped ?? waitForPortClosed)(this.baseUrl());
      }
      await this.options.prepareConfig?.(spawnInput);
      this.handle = await this.options.spawn(spawnInput);
      try {
        await (this.options.waitForReady ?? waitForCcrReady)(this.baseUrl());
      } catch (err) {
        const spawnedHandle = this.handle;
        if (spawnedHandle) {
          try {
            await this.stopHandleWithTimeout(spawnedHandle);
            this.handle = null;
          } catch {
            // Keep the handle when cleanup is uncertain so a later retry can
            // still stop the same child process instead of losing ownership.
          }
        }
        throw err;
      }
      this.configSignature = nextSignature;
      this.routeKeys = [...routeKeys];
      this.error = undefined;
      this.phase = "ready";
      this.applyingSince = undefined;
      this.lastAppliedAt = new Date().toISOString();
    } catch (err) {
      this.configSignature = undefined;
      this.error = err instanceof Error ? err.message : String(err);
      this.phase = "error";
      this.applyingSince = undefined;
      throw err;
    }
  }

  private async stopHandleWithTimeout(handle: CcrProcessHandle): Promise<void> {
    const timeoutMs = this.options.stopTimeoutMs ?? 5_000;
    let timer: Timer | undefined;
    try {
      await Promise.race([
        handle.stop(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("ccr_stop_timeout")), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  status(): CcrStatus {
    return {
      enabled: this.options.enabled,
      running: this.handle !== null,
      phase: this.options.enabled ? this.phase : "disabled",
      baseUrl: this.baseUrl(),
      routeCount: this.routeKeys.length,
      routeKeys: [...this.routeKeys],
      ...(this.handle?.pid ? { pid: this.handle.pid } : {}),
      ...(this.configSignature ? { configSignature: this.configSignature } : {}),
      ...(this.applyingSince ? { applyingSince: this.applyingSince } : {}),
      ...(this.lastAppliedAt ? { lastAppliedAt: this.lastAppliedAt } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  async stop(): Promise<void> {
    if (this.handle) {
      await this.stopHandleWithTimeout(this.handle).catch(() => {});
    }
    this.handle = null;
    this.configSignature = undefined;
    this.routeKeys = [];
    this.phase = this.options.enabled ? "idle" : "disabled";
  }
}

export const CCR_SPAWN_NOT_CONFIGURED: CcrSpawn = async () => {
  throw new Error("ccr_spawn_not_configured");
};

export { waitForCcrReady } from "./health";

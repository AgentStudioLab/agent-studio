import type { AgentStudioCcrConfig } from "./config";

export interface CcrProcessHandle {
  pid?: number;
  kill: (signal?: NodeJS.Signals) => boolean;
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
  waitForReady?: (baseUrl: string) => Promise<void>;
}

export interface CcrStatus {
  enabled: boolean;
  running: boolean;
  baseUrl: string;
  pid?: number;
  error?: string;
}

export class CcrManager {
  private handle: CcrProcessHandle | null = null;
  private error: string | undefined;
  private configSignature: string | undefined;

  constructor(private readonly options: CcrManagerOptions) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`;
  }

  async ensure(config: AgentStudioCcrConfig): Promise<void> {
    if (!this.options.enabled) {
      this.error = "ccr_disabled";
      return;
    }
    const nextSignature = JSON.stringify(config);
    if (this.handle && this.configSignature === nextSignature) return;

    try {
      if (this.handle) {
        this.handle.kill();
        this.handle = null;
        this.configSignature = undefined;
      }
      this.handle = await this.options.spawn({
        port: this.options.port,
        configDir: this.options.configDir,
        config,
      });
      await (this.options.waitForReady ?? waitForCcrReady)(this.baseUrl());
      this.configSignature = nextSignature;
      this.error = undefined;
    } catch (err) {
      this.handle?.kill();
      this.handle = null;
      this.configSignature = undefined;
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  status(): CcrStatus {
    return {
      enabled: this.options.enabled,
      running: this.handle !== null,
      baseUrl: this.baseUrl(),
      ...(this.handle?.pid ? { pid: this.handle.pid } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  stop(): void {
    this.handle?.kill();
    this.handle = null;
    this.configSignature = undefined;
  }
}

export const CCR_SPAWN_NOT_CONFIGURED: CcrSpawn = async () => {
  throw new Error("ccr_spawn_not_configured");
};

export async function waitForCcrReady(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `ccr_not_ready:${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

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

  constructor(private readonly options: CcrManagerOptions) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`;
  }

  async ensure(config: AgentStudioCcrConfig): Promise<void> {
    if (!this.options.enabled) {
      this.error = "ccr_disabled";
      return;
    }
    if (this.handle) return;

    try {
      this.handle = await this.options.spawn({
        port: this.options.port,
        configDir: this.options.configDir,
        config,
      });
      this.error = undefined;
    } catch (err) {
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
  }
}

export const CCR_SPAWN_NOT_CONFIGURED: CcrSpawn = async () => {
  throw new Error("ccr_spawn_not_configured");
};

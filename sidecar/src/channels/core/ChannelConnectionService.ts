import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type {
  ChannelConnection,
  ChannelConnectionConfig,
  ChannelConnectionStatus,
  ChannelType,
} from "./ChannelTypes";

interface ChannelConnectionRow {
  id: string;
  type: ChannelType;
  name: string;
  enabled: number;
  status: ChannelConnectionStatus;
  credentials_json: string | null;
  config_json: string;
  last_connected_at: number | null;
  error_msg: string | null;
  created_at: number;
  updated_at: number;
}

function parseJsonObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}

function normalizeConfig(config: ChannelConnectionConfig): ChannelConnectionConfig {
  if (config.permissionStrategy !== "auto_execute") {
    throw new Error("channel permissionStrategy must be auto_execute");
  }
  return config;
}

function rowToConnection(
  row: ChannelConnectionRow,
  opts: { includeCredentials: boolean },
): ChannelConnection {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled === 1,
    status: row.status,
    config: JSON.parse(row.config_json) as ChannelConnectionConfig,
    lastConnectedAt: row.last_connected_at,
    errorMsg: row.error_msg,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(opts.includeCredentials
      ? { credentials: parseJsonObject(row.credentials_json) }
      : {}),
  };
}

export class ChannelConnectionService {
  constructor(private db: Database) {}

  create(input: {
    id?: string;
    type: ChannelType;
    name: string;
    enabled?: boolean;
    status?: ChannelConnectionStatus;
    credentials?: Record<string, unknown>;
    config: ChannelConnectionConfig;
  }): ChannelConnection {
    const id = input.id ?? `chn_${nanoid(12)}`;
    const now = Date.now();
    const config = normalizeConfig(input.config);
    this.db
      .prepare(
        `INSERT INTO channel_connections
          (id, type, name, enabled, status, credentials_json, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.type,
        input.name,
        input.enabled ? 1 : 0,
        input.status ?? "stopped",
        input.credentials ? JSON.stringify(input.credentials) : null,
        JSON.stringify(config),
        now,
        now,
      );
    return this.get(id)!;
  }

  get(id: string): ChannelConnection | null {
    const row = this.db
      .prepare("SELECT * FROM channel_connections WHERE id = ?")
      .get(id) as ChannelConnectionRow | undefined;
    return row ? rowToConnection(row, { includeCredentials: false }) : null;
  }

  getInternal(id: string): ChannelConnection | null {
    const row = this.db
      .prepare("SELECT * FROM channel_connections WHERE id = ?")
      .get(id) as ChannelConnectionRow | undefined;
    return row ? rowToConnection(row, { includeCredentials: true }) : null;
  }

  list(): ChannelConnection[] {
    const rows = this.db
      .prepare("SELECT * FROM channel_connections ORDER BY created_at ASC")
      .all() as ChannelConnectionRow[];
    return rows.map((row) => rowToConnection(row, { includeCredentials: false }));
  }

  listEnabled(): ChannelConnection[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM channel_connections WHERE enabled = 1 ORDER BY created_at ASC",
      )
      .all() as ChannelConnectionRow[];
    return rows.map((row) => rowToConnection(row, { includeCredentials: true }));
  }

  update(
    id: string,
    input: {
      name?: string;
      enabled?: boolean;
      credentials?: Record<string, unknown> | null;
      config?: ChannelConnectionConfig;
    },
  ): ChannelConnection | null {
    const existing = this.getInternal(id);
    if (!existing) return null;
    const config = input.config ? normalizeConfig(input.config) : existing.config;
    this.db
      .prepare(
        `UPDATE channel_connections
         SET name = ?, enabled = ?, credentials_json = ?, config_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name ?? existing.name,
        input.enabled ?? existing.enabled ? 1 : 0,
        input.credentials === undefined
          ? existing.credentials
            ? JSON.stringify(existing.credentials)
            : null
          : input.credentials
            ? JSON.stringify(input.credentials)
            : null,
        JSON.stringify(config),
        Date.now(),
        id,
      );
    return this.get(id);
  }

  updateStatus(
    id: string,
    status: ChannelConnectionStatus,
    errorMsg?: string | null,
  ): ChannelConnection | null {
    const lastConnectedAt = status === "running" ? Date.now() : null;
    this.db
      .prepare(
        `UPDATE channel_connections
         SET status = ?,
             error_msg = ?,
             last_connected_at = COALESCE(?, last_connected_at),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(status, errorMsg ?? null, lastConnectedAt, Date.now(), id);
    return this.get(id);
  }
}

import type { Database } from "bun:sqlite";

export const DEFAULT_ALLOWED_TOOLS: string[] = [
  "Bash", "Read", "Write", "Edit",
  "Glob", "Grep", "WebFetch", "WebSearch", "Task",
];

const KEY = "allowedTools";

export class SettingsToolsService {
  private get: ReturnType<Database["prepare"]>;
  private upsert: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.get = db.prepare("SELECT value FROM settings WHERE key = ?");
    this.upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  getDefault(): string[] {
    const row = this.get.get(KEY) as { value?: string } | undefined;
    if (!row?.value) return DEFAULT_ALLOWED_TOOLS;
    try {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed : DEFAULT_ALLOWED_TOOLS;
    } catch {
      return DEFAULT_ALLOWED_TOOLS;
    }
  }

  setDefault(tools: string[]): void {
    this.upsert.run(KEY, JSON.stringify(tools));
  }
}

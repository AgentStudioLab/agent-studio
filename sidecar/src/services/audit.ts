import type { Database } from "bun:sqlite";
import { redactSecrets } from "../agui/provider-claude/redact";

export interface AuditPreEntry {
  ts: number;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
  cwd?: string;
}

export interface AuditPostEntry {
  ts: number;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  toolName: string;
  toolUseId: string;
  durationMs?: number;
  isError: boolean;
  cwd?: string;
}

export interface AuditRow {
  id: number;
  ts: number;
  phase: "pre" | "post" | "denied";
  threadId: string | null;
  toolName: string;
  toolUseId: string | null;
  inputJson: string | null;
  durationMs: number | null;
  isError: boolean;
  cwd: string | null;
}

export class AuditService {
  private insertPre: ReturnType<Database["prepare"]>;
  private insertPost: ReturnType<Database["prepare"]>;
  private selectByThread: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.insertPre = db.prepare(`
      INSERT INTO tool_audit (ts, phase, session_id, thread_id, run_id, tool_name, tool_use_id, input_json, cwd)
      VALUES (?, 'pre', ?, ?, ?, ?, ?, ?, ?)
    `);
    this.insertPost = db.prepare(`
      INSERT INTO tool_audit (ts, phase, session_id, thread_id, run_id, tool_name, tool_use_id, duration_ms, is_error, cwd)
      VALUES (?, 'post', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.selectByThread = db.prepare(`
      SELECT id, ts, phase, thread_id AS threadId, tool_name AS toolName, tool_use_id AS toolUseId,
             input_json AS inputJson, duration_ms AS durationMs, is_error AS isError, cwd
      FROM tool_audit WHERE thread_id = ? ORDER BY ts DESC LIMIT ?
    `);
  }

  appendPre(e: AuditPreEntry): void {
    const redacted = JSON.stringify(redactSecrets(e.input));
    this.insertPre.run(
      e.ts,
      e.sessionId ?? null,
      e.threadId ?? null,
      e.runId ?? null,
      e.toolName,
      e.toolUseId,
      redacted,
      e.cwd ?? null,
    );
  }

  appendPost(e: AuditPostEntry): void {
    this.insertPost.run(
      e.ts,
      e.sessionId ?? null,
      e.threadId ?? null,
      e.runId ?? null,
      e.toolName,
      e.toolUseId,
      e.durationMs ?? null,
      e.isError ? 1 : 0,
      e.cwd ?? null,
    );
  }

  queryByThread(threadId: string, limit: number): AuditRow[] {
    return (this.selectByThread.all(threadId, limit) as AuditRow[]).map((r) => ({
      ...r,
      isError: !!r.isError,
    }));
  }
}

import type { Database } from "bun:sqlite";
import type { SDKPermissionDenial } from "@anthropic-ai/claude-agent-sdk";

export interface RunUsageRecord {
  runId: string;
  threadId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  permissionDenials: SDKPermissionDenial[];
  model?: string;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  runCount: number;
}

export class UsageService {
  private updateRun: ReturnType<Database["prepare"]>;
  private insertLedger: ReturnType<Database["prepare"]>;
  private aggregate: ReturnType<Database["prepare"]>;
  private aggregateByThread: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.updateRun = db.prepare(`
      UPDATE runs SET
        input_tokens = ?, output_tokens = ?,
        cache_creation_tokens = ?, cache_read_tokens = ?,
        total_cost_usd = ?, permission_denials = ?, model_used = ?
      WHERE id = ?
    `);
    this.insertLedger = db.prepare(`
      INSERT INTO usage_ledger (ts, run_id, thread_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.aggregate = db.prepare(`
      SELECT
        COALESCE(SUM(l.input_tokens), 0)  AS inputTokens,
        COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(l.cache_creation_tokens), 0) AS cacheCreationTokens,
        COALESCE(SUM(l.cache_read_tokens), 0)     AS cacheReadTokens,
        COALESCE(SUM(l.cost_usd), 0)              AS totalCostUsd,
        COUNT(DISTINCT l.run_id)                  AS runCount
      FROM usage_ledger l
      -- 设置里的本机用量只展示真正跑完的记录，避免 running/error/cancelled 的中间态污染统计。
      JOIN runs r ON r.id = l.run_id AND r.status = 'completed'
      WHERE l.ts >= ? AND l.ts < ?
    `);
    this.aggregateByThread = db.prepare(`
      SELECT
        COALESCE(SUM(l.input_tokens), 0)  AS inputTokens,
        COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(l.cache_creation_tokens), 0) AS cacheCreationTokens,
        COALESCE(SUM(l.cache_read_tokens), 0)     AS cacheReadTokens,
        COALESCE(SUM(l.cost_usd), 0)              AS totalCostUsd,
        COUNT(DISTINCT l.run_id)                  AS runCount
      FROM usage_ledger l
      -- thread 过滤仍保留给既有 API，但首版 Settings 页面不会暴露该过滤入口。
      JOIN runs r ON r.id = l.run_id AND r.status = 'completed'
      WHERE l.ts >= ? AND l.ts < ? AND l.thread_id = ?
    `);
  }

  recordRun(r: RunUsageRecord): void {
    this.updateRun.run(
      r.inputTokens, r.outputTokens,
      r.cacheCreationTokens, r.cacheReadTokens,
      r.totalCostUsd, JSON.stringify(r.permissionDenials), r.model ?? null,
      r.runId,
    );
    this.insertLedger.run(
      Date.now(), r.runId, r.threadId, r.model ?? null,
      r.inputTokens, r.outputTokens,
      r.cacheCreationTokens, r.cacheReadTokens, r.totalCostUsd,
    );
  }

  summary(range: { from: number; to: number; threadId?: string }): UsageSummary {
    const row = range.threadId
      ? (this.aggregateByThread.get(range.from, range.to, range.threadId) as UsageSummary)
      : (this.aggregate.get(range.from, range.to) as UsageSummary);
    return row;
  }
}

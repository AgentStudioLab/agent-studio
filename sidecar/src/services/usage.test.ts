import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { UsageService } from "./usage";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  // seed a run row so UPDATE has a target
  db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 'x', 1, 1)`);
  db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
  return db;
}

describe("UsageService", () => {
  it("recordRun updates runs columns + inserts ledger row", () => {
    const db = makeDb();
    const svc = new UsageService(db);
    svc.recordRun({
      runId: "r1",
      threadId: "t1",
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 50,
      totalCostUsd: 0.0123,
      permissionDenials: [{ tool_name: "Bash" } as never],
      model: "claude-opus-4-7",
    });
    const run = db.prepare("SELECT * FROM runs WHERE id='r1'").get() as { input_tokens: number; output_tokens: number; total_cost_usd: number; model_used: string; permission_denials: string };
    expect(run.input_tokens).toBe(100);
    expect(run.output_tokens).toBe(200);
    expect(run.total_cost_usd).toBe(0.0123);
    expect(run.model_used).toBe("claude-opus-4-7");
    expect(JSON.parse(run.permission_denials)).toHaveLength(1);

    const ledger = db.prepare("SELECT * FROM usage_ledger WHERE run_id='r1'").get() as { input_tokens: number; cost_usd: number };
    expect(ledger.input_tokens).toBe(100);
    expect(ledger.cost_usd).toBe(0.0123);
  });

  it("summary aggregates by time range", () => {
    const db = makeDb();
    const svc = new UsageService(db);
    svc.recordRun({ runId: "r1", threadId: "t1", inputTokens: 10, outputTokens: 20, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.01, permissionDenials: [], model: "m" });
    // backdate ledger row to 100
    db.exec("UPDATE usage_ledger SET ts = 100 WHERE run_id='r1'");
    // record a second run within range
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r2', 't1', 'running', 1)`);
    svc.recordRun({ runId: "r2", threadId: "t1", inputTokens: 5, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.005, permissionDenials: [], model: "m" });
    // backdate r2's ledger ts to within range too
    db.exec("UPDATE usage_ledger SET ts = 120 WHERE run_id='r2'");

    const sum = svc.summary({ from: 0, to: 150 });
    expect(sum.inputTokens).toBe(15);
    expect(sum.outputTokens).toBe(25);
    expect(sum.totalCostUsd).toBeCloseTo(0.015, 6);
  });
});

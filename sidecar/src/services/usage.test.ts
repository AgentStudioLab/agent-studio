import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { UsageService } from "./usage";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  // seed a run row so UPDATE has a target
  db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 'x', 1, 1)`);
  insertRun(db, "r1");
  return db;
}

function insertRun(
  db: Database,
  id: string,
  status: "running" | "completed" | "error" | "cancelled" = "running",
) {
  db.prepare(
    "INSERT INTO runs (id, thread_id, status, started_at) VALUES (?, 't1', ?, 1)",
  ).run(id, status);
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
    db.exec("UPDATE runs SET status = 'completed' WHERE id='r1'");
    // backdate ledger row to 100
    db.exec("UPDATE usage_ledger SET ts = 100 WHERE run_id='r1'");
    // record a second run within range
    insertRun(db, "r2", "completed");
    svc.recordRun({ runId: "r2", threadId: "t1", inputTokens: 5, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUsd: 0.005, permissionDenials: [], model: "m" });
    // backdate r2's ledger ts to within range too
    db.exec("UPDATE usage_ledger SET ts = 120 WHERE run_id='r2'");

    const sum = svc.summary({ from: 0, to: 150 });
    expect(sum.inputTokens).toBe(15);
    expect(sum.outputTokens).toBe(25);
    expect(sum.totalCostUsd).toBeCloseTo(0.015, 6);
  });

  it("summary only aggregates completed runs", () => {
    const db = makeDb();
    const svc = new UsageService(db);

    svc.recordRun({
      runId: "r1",
      threadId: "t1",
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationTokens: 1,
      cacheReadTokens: 2,
      totalCostUsd: 0,
      permissionDenials: [],
      model: "m",
    });
    db.exec("UPDATE runs SET status = 'completed' WHERE id = 'r1'");
    db.exec("UPDATE usage_ledger SET ts = 100 WHERE run_id = 'r1'");

    insertRun(db, "r2", "error");
    svc.recordRun({
      runId: "r2",
      threadId: "t1",
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 10,
      cacheReadTokens: 20,
      totalCostUsd: 0,
      permissionDenials: [],
      model: "m",
    });
    db.exec("UPDATE usage_ledger SET ts = 110 WHERE run_id = 'r2'");

    insertRun(db, "r3", "running");
    svc.recordRun({
      runId: "r3",
      threadId: "t1",
      inputTokens: 1000,
      outputTokens: 2000,
      cacheCreationTokens: 100,
      cacheReadTokens: 200,
      totalCostUsd: 0,
      permissionDenials: [],
      model: "m",
    });
    db.exec("UPDATE usage_ledger SET ts = 120 WHERE run_id = 'r3'");

    const sum = svc.summary({ from: 0, to: 150 });
    expect(sum.inputTokens).toBe(10);
    expect(sum.outputTokens).toBe(20);
    expect(sum.cacheCreationTokens).toBe(1);
    expect(sum.cacheReadTokens).toBe(2);
    expect(sum.runCount).toBe(1);
  });
});

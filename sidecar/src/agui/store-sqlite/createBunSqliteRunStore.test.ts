import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { createBunSqliteRunStore } from "./createBunSqliteRunStore";

describe("createBunSqliteRunStore — reconcileOrphans", () => {
  it("reconciles 'awaiting_approval' orphans to 'cancelled' with synthetic RUN_ERROR event", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'awaiting_approval', 1)`);
    // Seed an event so RUN_ERROR appends with seq > 0
    db.exec(`INSERT INTO run_events (run_id, seq, type, payload, created_at) VALUES ('r1', 1, 'RUN_STARTED', '{}', 1)`);

    const store = createBunSqliteRunStore(db);
    const count = store.reconcileOrphans();
    expect(count).toBe(1);

    const run = db.prepare("SELECT status, error_msg, ended_at FROM runs WHERE id='r1'").get() as { status: string; error_msg: string | null; ended_at: number | null };
    expect(run.status).toBe("cancelled");
    expect(run.error_msg).toBe("process restart");
    expect(run.ended_at).not.toBeNull();

    const events = db.prepare("SELECT type, payload FROM run_events WHERE run_id='r1' ORDER BY seq").all() as Array<{ type: string; payload: string }>;
    const errorEvt = events.find((e) => e.type === "RUN_ERROR");
    expect(errorEvt).toBeDefined();
    const payload = JSON.parse(errorEvt!.payload) as { code?: string; message?: string };
    expect(payload.code).toBe("CANCELLED");
    expect(payload.message).toBe("process restart");
  });

  it("reconciles 'running' orphans to 'error' (existing behavior preserved)", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
    const store = createBunSqliteRunStore(db);
    const count = store.reconcileOrphans();
    expect(count).toBe(1);
    const run = db.prepare("SELECT status FROM runs WHERE id='r1'").get() as { status: string };
    expect(run.status).toBe("error");
  });
});

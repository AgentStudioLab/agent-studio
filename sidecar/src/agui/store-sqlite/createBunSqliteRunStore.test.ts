import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { createBunSqliteRunStore } from "./createBunSqliteRunStore";

describe("createBunSqliteRunStore — reconcileOrphans", () => {
  it("reconciles 'awaiting_approval' orphans to 'cancelled' with RUN_ERROR(reason=process_restart)", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'awaiting_approval', 1)`);
    db.exec(`INSERT INTO run_events (run_id, seq, type, payload, created_at) VALUES ('r1', 1, 'RUN_STARTED', '{}', 1)`);

    const store = createBunSqliteRunStore(db);
    const result = store.reconcileOrphans();
    expect(result.runningCount).toBe(0);
    expect(result.awaitingOrphans).toEqual([{ runId: "r1", threadId: "t1" }]);

    const run = db.prepare("SELECT status, error_msg, ended_at FROM runs WHERE id='r1'").get() as { status: string; error_msg: string | null; ended_at: number | null };
    expect(run.status).toBe("cancelled");
    expect(run.error_msg).toBe("process restart");

    const events = db.prepare("SELECT type, payload FROM run_events WHERE run_id='r1' ORDER BY seq").all() as Array<{ type: string; payload: string }>;
    const errorEvt = events.find((e) => e.type === "RUN_ERROR");
    expect(errorEvt).toBeDefined();
    const payload = JSON.parse(errorEvt!.payload) as { code?: string; reason?: string; message?: string };
    expect(payload.code).toBe("CANCELLED");
    expect(payload.reason).toBe("process_restart");
  });

  it("reconciles 'awaiting_user' orphans to 'cancelled' with RUN_ERROR(reason=process_restart)", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'awaiting_user', 1)`);
    db.exec(`INSERT INTO run_events (run_id, seq, type, payload, created_at) VALUES ('r1', 1, 'RUN_STARTED', '{}', 1)`);

    const store = createBunSqliteRunStore(db);
    const result = store.reconcileOrphans();
    expect(result.runningCount).toBe(0);
    expect(result.awaitingOrphans).toEqual([{ runId: "r1", threadId: "t1" }]);

    const run = db.prepare("SELECT status, error_msg FROM runs WHERE id='r1'").get() as {
      status: string;
      error_msg: string | null;
    };
    expect(run.status).toBe("cancelled");
    expect(run.error_msg).toBe("process restart");

    const events = db.prepare("SELECT type, payload FROM run_events WHERE run_id='r1' ORDER BY seq").all() as Array<{
      type: string;
      payload: string;
    }>;
    const errorEvt = events.find((e) => e.type === "RUN_ERROR");
    expect(errorEvt).toBeDefined();
    const payload = JSON.parse(errorEvt!.payload) as {
      code?: string;
      reason?: string;
    };
    expect(payload.code).toBe("CANCELLED");
    expect(payload.reason).toBe("process_restart");
  });

  it("reconciles 'running' orphans to 'error' (existing behavior preserved)", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
    const store = createBunSqliteRunStore(db);
    const result = store.reconcileOrphans();
    expect(result.runningCount).toBe(1);
    expect(result.awaitingOrphans).toEqual([]);
    const run = db.prepare("SELECT status FROM runs WHERE id='r1'").get() as { status: string };
    expect(run.status).toBe("error");
  });
});

describe("createBunSqliteRunStore — getThreadActiveRun", () => {
  function seed(): Database {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    return db;
  }

  it("returns the latest run when it is running", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toEqual({ runId: "r1", status: "running" });
  });

  it("returns the latest run when it is awaiting_approval", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'awaiting_approval', 1)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toEqual({ runId: "r1", status: "awaiting_approval" });
  });

  it("returns the latest run when it is awaiting_user", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'awaiting_user', 1)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toEqual({
      runId: "r1",
      status: "awaiting_user",
    });
  });

  it("returns null when the latest run is terminal", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'completed', 1)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toBeNull();
  });

  it("returns null when the thread has no runs", async () => {
    const store = createBunSqliteRunStore(seed());
    expect(await store.getThreadActiveRun("t1")).toBeNull();
  });

  it("considers only the latest run — a terminal latest shadows an older running orphan", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'running', 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r2', 't1', 'completed', 2)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toBeNull();
  });

  it("returns the latest run when a newer run is live over an older terminal one", async () => {
    const db = seed();
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'completed', 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r2', 't1', 'running', 2)`);
    const store = createBunSqliteRunStore(db);
    expect(await store.getThreadActiveRun("t1")).toEqual({ runId: "r2", status: "running" });
  });
});

describe("createBunSqliteRunStore — getRun pending interrupts", () => {
  it("hydrates pendingInterrupts for awaiting_user from the latest interrupt event", async () => {
    const db = new Database(":memory:");
    migrate(db);
    db.exec(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('t1', 't', 1, 1)`);
    db.exec(`INSERT INTO runs (id, thread_id, status, last_seq, started_at) VALUES ('r1', 't1', 'awaiting_user', 1, 1)`);
    db.exec(`
      INSERT INTO run_events (run_id, seq, type, payload, created_at)
      VALUES (
        'r1',
        1,
        'RUN_FINISHED',
        '{"type":"RUN_FINISHED","runId":"r1","threadId":"t1","outcome":"interrupt","interrupts":[{"id":"ask_1","reason":"ask_user","payload":{"toolName":"AskUserQuestion","questions":[]}}]}',
        1
      )
    `);

    const store = createBunSqliteRunStore(db);
    const run = await store.getRun("r1");
    expect(run?.status).toBe("awaiting_user");
    expect(run?.pendingInterrupts).toEqual([
      {
        id: "ask_1",
        reason: "ask_user",
        payload: { toolName: "AskUserQuestion", questions: [] },
      },
    ]);
  });
});

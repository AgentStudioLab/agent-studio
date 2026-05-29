import { EventEmitter } from "node:events";
import type { Database } from "bun:sqlite";
import { EventType } from "@ag-ui/core";
import type { AGUIEvent } from "../core/types";
import type {
  AGUIEventEnvelope,
  RunEventStore,
  RunSnapshot,
  RunStatus,
  ThreadStatus,
} from "../core/store-types";

/**
 * bun:sqlite implementation of RunEventStore. Wraps writes in a synchronous
 * tx so cursor assignment + event insert + last_seq bump are atomic. The
 * EventEmitter bus wakes any in-flight `streamFrom` listener on the same
 * runId within microseconds — no polling needed except as a fallback after
 * wake-up to drain catch-up rows.
 */
export function createBunSqliteRunStore(db: Database): RunEventStore {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  const insertRun = db.prepare(
    "INSERT INTO runs (id, thread_id, status, started_at) VALUES (?, ?, 'running', ?)",
  );
  const getNextSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), 0) AS s FROM run_events WHERE run_id = ?",
  );
  const insertEvent = db.prepare(
    "INSERT INTO run_events (run_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const updateLastSeq = db.prepare(
    "UPDATE runs SET last_seq = ? WHERE id = ?",
  );
  const updateRunFinish = db.prepare(
    "UPDATE runs SET status = ?, error_msg = ?, ended_at = ? WHERE id = ?",
  );
  const selectRun = db.prepare(
    "SELECT id AS runId, thread_id AS threadId, status, last_seq AS lastSeq FROM runs WHERE id = ?",
  );
  const selectLatestRunForThread = db.prepare(
    "SELECT id AS runId, status FROM runs WHERE thread_id = ? ORDER BY started_at DESC LIMIT 1",
  );
  const selectEventsAfter = db.prepare(
    "SELECT seq, type, payload FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC",
  );
  const selectLastEvent = db.prepare(
    "SELECT payload FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 1",
  );
  const orphanUpdate = db.prepare(
    "UPDATE runs SET status = 'error', error_msg = 'process restart', ended_at = ? WHERE status = 'running'",
  );
  const selectAwaitingOrphans = db.prepare(
    "SELECT id, thread_id FROM runs WHERE status = 'awaiting_approval'",
  );
  const awaitingOrphanUpdate = db.prepare(
    "UPDATE runs SET status = 'cancelled', error_msg = 'process restart', ended_at = ? WHERE id = ?",
  );
  const latestRunPerThread = db.prepare(`
    SELECT c.id AS threadId, c.title AS title, r.id AS lastRunId, r.status,
           r.last_seq AS lastSeq, c.scheduled_task_id AS scheduledTaskId,
           COALESCE(r.ended_at, r.started_at, c.updated_at) AS updatedAt
    FROM conversations c
    LEFT JOIN runs r ON r.id = (
      SELECT id FROM runs WHERE thread_id = c.id ORDER BY started_at DESC LIMIT 1
    )
    ORDER BY c.updated_at DESC
  `);

  const appendTx = db.transaction((runId: string, type: string, payload: string, now: number) => {
    const row = getNextSeq.get(runId) as { s: number };
    const next = row.s + 1;
    insertEvent.run(runId, next, type, payload, now);
    updateLastSeq.run(next, runId);
    return next;
  });

  function hydrateSnapshot(row: {
    runId: string;
    threadId: string;
    status: RunStatus;
    lastSeq: number;
  }): RunSnapshot {
    let pendingInterrupts: RunSnapshot["pendingInterrupts"];
    if (row.status === "awaiting_approval") {
      const last = selectLastEvent.get(row.runId) as { payload: string } | undefined;
      if (last) {
        try {
          const ev = JSON.parse(last.payload) as {
            outcome?: string;
            interrupts?: RunSnapshot["pendingInterrupts"];
          };
          if (ev.outcome === "interrupt" && Array.isArray(ev.interrupts)) {
            pendingInterrupts = ev.interrupts;
          }
        } catch {
          /* malformed payload — surface no pendingInterrupts rather than crash */
        }
      }
    }
    return {
      runId: row.runId,
      threadId: row.threadId,
      status: row.status,
      lastCursor: String(row.lastSeq),
      ...(pendingInterrupts ? { pendingInterrupts } : {}),
    };
  }

  return {
    async createRun(runId, threadId) {
      insertRun.run(runId, threadId, Date.now());
    },

    async appendEvent(runId, event) {
      const seq = appendTx(runId, event.type, JSON.stringify(event), Date.now());
      const envelope: AGUIEventEnvelope = { cursor: String(seq), event };
      bus.emit(`run:${runId}`, envelope);
      return envelope;
    },

    async finishRun(runId, status, errorMsg) {
      updateRunFinish.run(status, errorMsg ?? null, Date.now(), runId);
      bus.emit(`run:${runId}:end`);
    },

    async getRun(runId): Promise<RunSnapshot | null> {
      const row = selectRun.get(runId) as
        | { runId: string; threadId: string; status: RunStatus; lastSeq: number }
        | undefined;
      return row ? hydrateSnapshot(row) : null;
    },

    async getThreadActiveRun(threadId) {
      const row = selectLatestRunForThread.get(threadId) as
        | { runId: string; status: RunStatus }
        | undefined;
      if (!row) return null;
      // Only the thread's LATEST run matters — an old orphaned "running" row
      // would otherwise wedge the thread permanently (boot reconcile flips
      // those to error/cancelled, but scope it here anyway).
      return row.status === "running" || row.status === "awaiting_approval"
        ? { runId: row.runId, status: row.status }
        : null;
    },

    streamFrom(runId, after, signal) {
      return (async function* () {
        let cursor = after ? Number(after) : 0;

        while (!signal.aborted) {
          const rows = selectEventsAfter.all(runId, cursor) as Array<{
            seq: number;
            type: string;
            payload: string;
          }>;
          for (const row of rows) {
            cursor = row.seq;
            yield {
              cursor: String(row.seq),
              event: JSON.parse(row.payload) as AGUIEvent,
            };
          }

          const snap = selectRun.get(runId) as
            | { status: RunStatus; lastSeq: number }
            | undefined;
          if (!snap) return;
          const TERMINAL: ReadonlySet<RunStatus> = new Set([
            "completed",
            "error",
            "cancelled",
          ]);
          if (TERMINAL.has(snap.status) && cursor >= snap.lastSeq) return;

          await new Promise<void>((resolve) => {
            const onEvt = () => { cleanup(); resolve(); };
            const onEnd = () => { cleanup(); resolve(); };
            const onAbort = () => { cleanup(); resolve(); };
            const cleanup = () => {
              bus.off(`run:${runId}`, onEvt);
              bus.off(`run:${runId}:end`, onEnd);
              signal.removeEventListener("abort", onAbort);
            };
            bus.once(`run:${runId}`, onEvt);
            bus.once(`run:${runId}:end`, onEnd);
            signal.addEventListener("abort", onAbort);
          });
        }
      })();
    },

    async listThreadStatuses(): Promise<ThreadStatus[]> {
      const rows = latestRunPerThread.all() as Array<{
        threadId: string;
        title: string;
        lastRunId: string | null;
        status: RunStatus | null;
        lastSeq: number | null;
        scheduledTaskId: string | null;
        updatedAt: number;
      }>;
      return rows.map((r) => ({
        threadId: r.threadId,
        title: r.title,
        lastRunId: r.lastRunId,
        status: (r.status ?? "idle") as ThreadStatus["status"],
        lastCursor: r.lastSeq != null ? String(r.lastSeq) : null,
        scheduledTaskId: r.scheduledTaskId,
        updatedAt: r.updatedAt,
      }));
    },

    reconcileOrphans() {
      const now = Date.now();
      const result = orphanUpdate.run(now);
      const runningCount = Number(result.changes ?? 0);

      // Also reconcile awaiting_approval orphans — their in-memory HITL deferreds
      // were wiped on process restart, so the user's deny click would 409.
      // Append a synthetic RUN_ERROR(CANCELLED, reason: process_restart) event so
      // SSE replay terminates the frontend's awaiting state cleanly. The caller
      // (server.ts) persists a system note in each affected thread so the user
      // sees a "继续上次任务" affordance on next reload — without the note the
      // page would silently swap the HITL card for nothing.
      const awaitingRows = selectAwaitingOrphans.all() as Array<{
        id: string;
        thread_id: string;
      }>;
      for (const row of awaitingRows) {
        appendTx(
          row.id,
          EventType.RUN_ERROR,
          JSON.stringify({
            type: EventType.RUN_ERROR,
            code: "CANCELLED",
            reason: "process_restart",
            message: "process restart",
          }),
          now,
        );
        awaitingOrphanUpdate.run(now, row.id);
      }

      return {
        runningCount,
        awaitingOrphans: awaitingRows.map((r) => ({
          runId: r.id,
          threadId: r.thread_id,
        })),
      };
    },
  };
}

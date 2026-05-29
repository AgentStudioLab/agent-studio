import type { AGUIEvent } from "./types";
import type { AGUIInterrupt } from "./interrupts";

export interface AGUIEventEnvelope {
  cursor: string;
  event: AGUIEvent;
}

export type RunStatus =
  | "running"
  | "completed"
  | "error"
  | "cancelled"
  | "awaiting_approval";

export interface ThreadStatus {
  threadId: string;
  title: string;
  lastRunId: string | null;
  status: RunStatus | "idle";
  lastCursor: string | null;
  /** Origin scheduled task when this conversation was spawned by the scheduler. */
  scheduledTaskId: string | null;
  updatedAt: number;
}

export interface RunSnapshot {
  runId: string;
  threadId: string;
  status: RunStatus;
  lastCursor: string;
  pendingInterrupts?: AGUIInterrupt[];
}

/**
 * Append-only AG-UI event log + run lifecycle. See contracts S1–S10 in
 * my-ag-ui-app/.../store-and-provider-abstractions.md. Single sidecar = single
 * implementation (bun:sqlite); no Redis path here.
 */
export interface RunEventStore {
  createRun(runId: string, threadId: string): Promise<void>;
  appendEvent(runId: string, event: AGUIEvent): Promise<AGUIEventEnvelope>;
  finishRun(
    runId: string,
    status: Exclude<RunStatus, "running">,
    errorMsg?: string,
  ): Promise<void>;
  getRun(runId: string): Promise<RunSnapshot | null>;
  /**
   * The thread's most-recent run iff it is still non-terminal (running |
   * awaiting_approval) — i.e. an in-flight run that a new run would collide
   * with on the same SDK session. null when the latest run is terminal or the
   * thread has no runs. Used to reject concurrent runs on one thread (POST
   * /runs + regenerate), so a scheduled run + a user follow-up can't resume the
   * same session simultaneously.
   */
  getThreadActiveRun(
    threadId: string,
  ): Promise<{ runId: string; status: RunStatus } | null>;
  streamFrom(
    runId: string,
    after: string | undefined,
    signal: AbortSignal,
  ): AsyncIterable<AGUIEventEnvelope>;
  listThreadStatuses(): Promise<ThreadStatus[]>;
  reconcileOrphans(): ReconcileResult;
}

/**
 * Boot-time reconcile output. The server uses `awaitingOrphans` to persist
 * a system note ("上次审批未完成时应用被关闭…") in each affected thread, so
 * the user sees a "继续上次任务" affordance on next reload instead of an
 * empty silence where the HITL card used to be.
 */
export interface ReconcileResult {
  runningCount: number;
  awaitingOrphans: { runId: string; threadId: string }[];
}

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
  streamFrom(
    runId: string,
    after: string | undefined,
    signal: AbortSignal,
  ): AsyncIterable<AGUIEventEnvelope>;
  listThreadStatuses(): Promise<ThreadStatus[]>;
  reconcileOrphans(): Promise<number>;
}

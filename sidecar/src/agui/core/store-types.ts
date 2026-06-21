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
  | "awaiting_user"
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
  /**
   * HITL 中断解决后，把 `awaiting_user`（或旧版 `awaiting_approval`）切回
   * `running`，表示 agent 已恢复执行。它不同于 {@link finishRun}：这是非终态
   * 迁移，不会发出 run-end 信号，因此正在监听的 SSE 流会继续等待后续事件。
   * 若不重置状态，侧边栏会把已经恢复执行的任务继续显示为“等待用户”。
   * 幂等。
   */
  markRunning(runId: string): Promise<void>;
  getRun(runId: string): Promise<RunSnapshot | null>;
  /**
   * 仅当线程最新 run 仍处于非终态（running、awaiting_user 或旧版
   * awaiting_approval）时返回它；旧的孤儿 run 不应阻塞新 run。该结果用于
   * 拒绝同一线程上的并发执行，避免 scheduled run 与用户 follow-up 同时恢复
   * 同一个 SDK session。
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
 * 启动期孤儿 run 修复结果。server 会用 `awaitingOrphans` 给受影响线程补一条
 * 系统消息，让用户下次加载时看到“继续上次任务”的入口，而不是原 HITL 卡片位置
 * 突然变空。这里同时包含 `awaiting_user` 和旧版 `awaiting_approval`。
 */
export interface ReconcileResult {
  runningCount: number;
  awaitingOrphans: { runId: string; threadId: string }[];
}

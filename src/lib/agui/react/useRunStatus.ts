// useRunStatus — 订阅 ChatRuntime 的 errorCode + retry 字段，派生若干便利布尔。
//
// 用 useSyncExternalStore 的 selector 形式，仅在我们关心的子状态变化时
// 触发 re-render；避免每个 token delta 都过到 ChatStream 头部。
//
// RuntimeLike 接口使用 no-arg subscribe callback，与 useSyncExternalStore
// 的契约一致。实际 ChatRuntime.subscribe 传 (state) => void，
// 消费侧通过 wrapper 把 state 参数丢弃即可。

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ChatState, RunErrorCode, RetryState } from "../runtime/types";

export interface RunStatus {
  status: "idle" | "running" | "completed" | "error" | "cancelled" | "awaiting_approval";
  errorCode?: RunErrorCode;
  errorMessage?: string;
  retry?: RetryState;
  isRetryable: boolean;
  isAuthError: boolean;
}

/** Minimal interface — matches useSyncExternalStore's subscribe contract. */
export interface RuntimeLike {
  getState(): ChatState;
  subscribe(cb: () => void): () => void;
}

export function useRunStatus(runtime: RuntimeLike): RunStatus {
  const subscribe = useCallback((cb: () => void) => runtime.subscribe(cb), [runtime]);
  const getSnapshot = useCallback(() => runtime.getState(), [runtime]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo<RunStatus>(() => {
    const code = state.errorCode;
    const isAuthError = code === "AUTH_FAILED";
    const isRetryable =
      code === "RATE_LIMIT" || code === "UPSTREAM_5XX" || code === "EXECUTION_ERROR";
    let status: RunStatus["status"] = "idle";
    if (state.isRunning) status = "running";
    else if (code) status = "error";
    else if (state.pendingInterrupts.length > 0) status = "awaiting_approval";

    return {
      status,
      errorCode: code,
      errorMessage: state.error ?? undefined,
      retry: state.retry,
      isRetryable,
      isAuthError,
    };
  }, [state]);
}

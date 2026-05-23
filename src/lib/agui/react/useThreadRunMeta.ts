// src/lib/agui/react/useThreadRunMeta.ts
import { useEffect, useState } from "react";
import type { ChatState } from "../runtime/types";

/**
 * Per-thread run timing derived from a ChatState snapshot. `runStartedAt`
 * comes directly from the state; `elapsedSeconds` ticks every 1s via
 * setInterval so the UI elapsed pill stays live without re-rendering the
 * whole ChatStream.
 *
 * Caller responsibility: pass the SAME `state` that TaskView's `useChat`
 * returned. Pass null when there is no active thread.
 *
 * Returns `elapsedSeconds: 0` when the thread is idle (runStartedAt null).
 */
export function useThreadRunMeta(state: ChatState | null): {
  runStartedAt: number | null;
  elapsedSeconds: number;
  isRunning: boolean;
} {
  const runStartedAt = state?.runStartedAt ?? null;
  const isRunning = state?.isRunning ?? false;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (runStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runStartedAt]);

  return { runStartedAt, elapsedSeconds, isRunning };
}

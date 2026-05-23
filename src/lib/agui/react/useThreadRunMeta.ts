import { useEffect, useState } from "react";
import { useChat } from "./useChat";

/**
 * Per-thread run timing. `runStartedAt` is set by RUN_STARTED, cleared by
 * RUN_FINISHED / RUN_ERROR. `elapsedSeconds` ticks every 1s while the run
 * is active so the UI status pill stays live without re-rendering the
 * entire ChatStream.
 *
 * Components reading this should expect `elapsedSeconds` to be 0 when the
 * thread is idle.
 */
export function useThreadRunMeta(threadId: string | null | undefined): {
  runStartedAt: number | null;
  elapsedSeconds: number;
  isRunning: boolean;
} {
  const { state, isRunning } = useChat({ threadId: threadId ?? "" });
  const runStartedAt = state.runStartedAt;
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

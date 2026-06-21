import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "@/lib/sidecar-client";
import { threadStatusKey } from "./useChat";

export interface ThreadStatusItem {
  threadId: string;
  title: string;
  lastRunId: string | null;
  status:
    | "idle"
    | "running"
    | "completed"
    | "error"
    | "cancelled"
    | "awaiting_user"
    | "awaiting_approval";
  lastCursor: string | null;
  scheduledTaskId: string | null;
  updatedAt: number;
}

/**
 * One-row-per-thread snapshot of run state. Drives:
 *   1. Sidebar pulse dot (status === "running" | "awaiting_user" | legacy "awaiting_approval")
 *   2. Page-refresh resume — TaskView selects this thread's entry and, if
 *      a non-terminal run is in flight, attaches to its lastRunId. SSE
 *      replays the event log from cursor 0 and the reducer rebuilds the
 *      live message state.
 *
 * Single source of truth: no separate active-run endpoint. The same query
 * powers both the sidebar and the per-thread attach decision.
 */
export function useThreadStatuses() {
  return useQuery({
    queryKey: threadStatusKey,
    queryFn: async () => {
      const res = await authedFetch("/conversations/status");
      if (!res.ok) throw new Error(`status_${res.status}`);
      return (await res.json()) as ThreadStatusItem[];
    },
    refetchInterval: 5_000,
    // staleTime 0 so opening a thread always sees a fresh probe — combined
    // with explicit invalidations on send/cancel/run-end, the pulse dot
    // updates promptly without waiting for the 5s poll.
    staleTime: 0,
  });
}

export interface ActiveRunRef {
  runId: string;
  status: "running" | "awaiting_user" | "awaiting_approval";
  lastCursor: string | null;
}

/**
 * Selector over useThreadStatuses: returns the active (non-terminal) run for
 * the given thread, or null when idle. v1: caller passes runId to
 * runtime.attachToRun to resume SSE from cursor 0.
 */
export function useActiveRunForThread(threadId: string | null): ActiveRunRef | null {
  const { data } = useThreadStatuses();
  return useMemo(() => {
    if (!threadId || !data) return null;
    const entry = data.find((t) => t.threadId === threadId);
    if (!entry || !entry.lastRunId) return null;
    if (
      entry.status !== "running" &&
      entry.status !== "awaiting_user" &&
      entry.status !== "awaiting_approval"
    ) {
      return null;
    }
    return {
      runId: entry.lastRunId,
      status: entry.status,
      lastCursor: entry.lastCursor,
    };
  }, [threadId, data]);
}

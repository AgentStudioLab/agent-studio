// React binding for the thread unread/read state. Subscribes to the
// module-level pub/sub in `@/lib/thread-unread` via useSyncExternalStore so
// the sidebar repaints synchronously when a thread is opened.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  getLastSeen,
  markThreadRead as markImpl,
  subscribe as subscribeImpl,
} from "@/lib/thread-unread";

export function useThreadUnread() {
  useEffect(() => {
    void ensureLoaded();
  }, []);

  const lastSeen = useSyncExternalStore<Readonly<Record<string, string>>>(
    useCallback((cb) => subscribeImpl(cb), []),
    getLastSeen,
    getLastSeen,
  );

  const isUnread = useCallback(
    (threadId: string, lastRunId: string | null | undefined): boolean => {
      // No completed run yet → nothing to mark unread (sidebar will fall
      // through to the idle/pending state).
      if (!lastRunId) return false;
      return lastSeen[threadId] !== lastRunId;
    },
    [lastSeen],
  );

  const markRead = useCallback(
    (threadId: string, runId: string) => markImpl(threadId, runId),
    [],
  );

  return { isUnread, markRead };
}

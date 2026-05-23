// React binding for per-thread permission mode. Subscribes to the
// module-level pub/sub via useSyncExternalStore — UI changes (dropdown,
// disclaimer text) repaint synchronously when the user flips the toggle.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  getAll,
  getMode,
  setMode as setImpl,
  subscribe as subscribeImpl,
  type PermissionMode,
} from "@/lib/thread-mode";

export type { PermissionMode } from "@/lib/thread-mode";

export function useThreadPermissionMode(threadId: string | null | undefined) {
  useEffect(() => {
    void ensureLoaded();
  }, []);

  // Snapshot only this thread's slice — getAll() returns a stable reference
  // unless something wrote to the cache, so React doesn't re-render
  // unnecessarily when an unrelated thread's mode flips.
  useSyncExternalStore<Readonly<Record<string, PermissionMode>>>(
    useCallback((cb) => subscribeImpl(cb), []),
    getAll,
    getAll,
  );

  const mode = getMode(threadId);

  const setMode = useCallback(
    (next: PermissionMode) => {
      if (threadId) setImpl(threadId, next);
    },
    [threadId],
  );

  return { mode, setMode };
}

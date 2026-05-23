// React binding for per-thread model selection. Mirrors useThreadPermissionMode.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  getAll,
  getModel,
  setModel as setImpl,
  subscribe as subscribeImpl,
} from "@/lib/thread-model";

export function useThreadModel(threadId: string | null | undefined) {
  useEffect(() => {
    void ensureLoaded();
  }, []);

  useSyncExternalStore<Readonly<Record<string, string>>>(
    useCallback((cb) => subscribeImpl(cb), []),
    getAll,
    getAll,
  );

  const model = getModel(threadId);

  const setModel = useCallback(
    (next: string) => {
      if (threadId) setImpl(threadId, next);
    },
    [threadId],
  );

  return { model, setModel };
}

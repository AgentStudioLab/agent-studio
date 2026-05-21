// React binding for the cross-session HITL allowlist.
//
// Subscribes to the module-level pub/sub in `@/lib/hitl-allowlist` via
// useSyncExternalStore. The hook ensures the store is loaded on first use
// (no-op after the first call). Used by both useChat (auto-allow gate) and
// Settings (manage UI).

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  addAllowedTool as addImpl,
  removeAllowedTool as removeImpl,
  ensureLoaded,
  getAllowedTools,
  subscribe as subscribeImpl,
} from "@/lib/hitl-allowlist";

export function useAllowedTools() {
  useEffect(() => {
    void ensureLoaded();
  }, []);

  const allowedTools = useSyncExternalStore<ReadonlySet<string>>(
    useCallback((cb) => subscribeImpl(cb), []),
    getAllowedTools,
    getAllowedTools,
  );

  const addAllowedTool = useCallback((name: string) => addImpl(name), []);
  const removeAllowedTool = useCallback((name: string) => removeImpl(name), []);

  return { allowedTools, addAllowedTool, removeAllowedTool };
}

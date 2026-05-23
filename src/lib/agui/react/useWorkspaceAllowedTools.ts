// React binding for the per-cwd HITL allowlist. The hook owns nothing —
// the module-level cache in `@/lib/workspace-allowlist` is the source of
// truth, so multiple components seeing the same cwd share state without
// extra plumbing. Mirrors useAllowedTools shape so the consumer site can
// swap in / merge without restructuring.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  addAllowedTool as addImpl,
  removeAllowedTool as removeImpl,
  ensureLoaded,
  getAllowedToolsFor,
  subscribe as subscribeImpl,
} from "@/lib/workspace-allowlist";

const EMPTY: ReadonlySet<string> = new Set();

export function useWorkspaceAllowedTools(cwd: string | null | undefined) {
  useEffect(() => {
    void ensureLoaded();
  }, []);

  // Subscribe to the global pub/sub but snapshot only this cwd's slice.
  // The getSnapshot returns the same Set reference between renders unless
  // the slice itself changed, so useSyncExternalStore won't tear or churn.
  const allowedTools = useSyncExternalStore<ReadonlySet<string>>(
    useCallback((cb) => subscribeImpl(cb), []),
    useCallback(() => (cwd ? getAllowedToolsFor(cwd) : EMPTY), [cwd]),
    useCallback(() => (cwd ? getAllowedToolsFor(cwd) : EMPTY), [cwd]),
  );

  const addAllowedTool = useCallback(
    (name: string) => {
      if (cwd) addImpl(cwd, name);
    },
    [cwd],
  );
  const removeAllowedTool = useCallback(
    (name: string) => {
      if (cwd) removeImpl(cwd, name);
    },
    [cwd],
  );

  return { allowedTools, addAllowedTool, removeAllowedTool };
}

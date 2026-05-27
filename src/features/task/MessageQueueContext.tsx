// App-level context for the per-thread message queue.
//
// Lives above the router so the queue survives thread switches / navigation
// — only an app restart (or sidecar restart in dev) clears it. Each thread
// gets its own slice in a Map<threadId, ThreadQueue>; the slice carries the
// queued items plus a "did user manually cancel the last run" flag that
// blocks auto-flush from firing after a stop click.
//
// Stability contract: the methods (add / remove / popHead / etc) are
// permanently stable refs so they can be put in useEffect deps without
// causing the auto-flush effect to re-fire on every render. Reads happen
// via the live `slices` Map exposed in the context value (changes per
// mutation, triggering subscriber re-renders).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { nanoid } from "nanoid";

export interface QueueItem {
  id: string;
  text: string;
  /** When the user added this — for "1m ago" style hints in the future. */
  addedAt: number;
}

interface ThreadQueueSlice {
  items: QueueItem[];
  /**
   * Set true when the user manually cancels the active run (stop button).
   * The auto-flush effect checks this on the next isRunning→idle transition;
   * if true, skip flush and clear the flag. Cleared on next explicit send.
   */
  userCancelled: boolean;
}

interface MessageQueueContextValue {
  /** Live slice map. Identity changes on every mutation → subscribers re-render. */
  slices: ReadonlyMap<string, ThreadQueueSlice>;
  /** Stable. Append a text to the back of the thread's queue. Returns the new item. */
  add(threadId: string, text: string): QueueItem;
  /** Stable. Remove a specific item by id. No-op if not found. */
  remove(threadId: string, itemId: string): void;
  /** Stable. Pop and return the head item (or null if empty). */
  popHead(threadId: string): QueueItem | null;
  /** Stable. Mark the thread's last run as user-cancelled. Auto-flush will skip. */
  markUserCancelled(threadId: string): void;
  /** Stable. Clear the user-cancelled flag — called on explicit send. */
  clearUserCancelled(threadId: string): void;
}

const MessageQueueContext = createContext<MessageQueueContextValue | null>(null);

const EMPTY_SLICE: ThreadQueueSlice = { items: [], userCancelled: false };

export function MessageQueueProvider({ children }: { children: ReactNode }) {
  const [slices, setSlices] = useState<Map<string, ThreadQueueSlice>>(
    () => new Map(),
  );
  // Mirror the latest slices in a ref so synchronous reads inside popHead
  // see the post-render value even when popHead is called twice in a row
  // (rare but possible if two flush paths race).
  const slicesRef = useRef(slices);
  slicesRef.current = slices;

  const updateSlice = useCallback(
    (threadId: string, mutator: (prev: ThreadQueueSlice) => ThreadQueueSlice) => {
      setSlices((prev) => {
        const next = new Map(prev);
        next.set(threadId, mutator(prev.get(threadId) ?? EMPTY_SLICE));
        return next;
      });
    },
    [],
  );

  const add = useCallback(
    (threadId: string, text: string): QueueItem => {
      const item: QueueItem = {
        id: `q_${nanoid(8)}`,
        text,
        addedAt: Date.now(),
      };
      updateSlice(threadId, (s) => ({ ...s, items: [...s.items, item] }));
      return item;
    },
    [updateSlice],
  );

  const remove = useCallback(
    (threadId: string, itemId: string) => {
      updateSlice(threadId, (s) => ({
        ...s,
        items: s.items.filter((it) => it.id !== itemId),
      }));
    },
    [updateSlice],
  );

  const popHead = useCallback(
    (threadId: string): QueueItem | null => {
      const cur = slicesRef.current.get(threadId) ?? EMPTY_SLICE;
      const head = cur.items[0];
      if (!head) return null;
      updateSlice(threadId, (s) => ({ ...s, items: s.items.slice(1) }));
      return head;
    },
    [updateSlice],
  );

  const markUserCancelled = useCallback(
    (threadId: string) => {
      updateSlice(threadId, (s) => ({ ...s, userCancelled: true }));
    },
    [updateSlice],
  );

  const clearUserCancelled = useCallback(
    (threadId: string) => {
      updateSlice(threadId, (s) => ({ ...s, userCancelled: false }));
    },
    [updateSlice],
  );

  const value = useMemo<MessageQueueContextValue>(
    () => ({
      slices,
      add,
      remove,
      popHead,
      markUserCancelled,
      clearUserCancelled,
    }),
    [slices, add, remove, popHead, markUserCancelled, clearUserCancelled],
  );

  return (
    <MessageQueueContext.Provider value={value}>
      {children}
    </MessageQueueContext.Provider>
  );
}

/**
 * Per-thread slice + stable per-thread bound methods. Methods returned here
 * are useCallback'd against (ctx, threadId), so as long as threadId is
 * stable across renders the consumer can safely put them in effect deps.
 */
export function useMessageQueue(threadId: string | null) {
  const ctx = useContext(MessageQueueContext);
  if (!ctx) {
    throw new Error("useMessageQueue must be used inside MessageQueueProvider");
  }
  const safeId = threadId ?? "";
  const slice = safeId ? ctx.slices.get(safeId) ?? EMPTY_SLICE : EMPTY_SLICE;

  const add = useCallback(
    (text: string) => (safeId ? ctx.add(safeId, text) : null),
    [ctx, safeId],
  );
  const remove = useCallback(
    (itemId: string) => {
      if (safeId) ctx.remove(safeId, itemId);
    },
    [ctx, safeId],
  );
  const popHead = useCallback(
    () => (safeId ? ctx.popHead(safeId) : null),
    [ctx, safeId],
  );
  const markUserCancelled = useCallback(() => {
    if (safeId) ctx.markUserCancelled(safeId);
  }, [ctx, safeId]);
  const clearUserCancelled = useCallback(() => {
    if (safeId) ctx.clearUserCancelled(safeId);
  }, [ctx, safeId]);

  return {
    items: slice.items,
    userCancelled: slice.userCancelled,
    add,
    remove,
    popHead,
    markUserCancelled,
    clearUserCancelled,
  };
}

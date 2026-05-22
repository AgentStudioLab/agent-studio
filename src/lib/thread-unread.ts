// Per-thread "last seen runId" persistence — drives the unread/read state
// for completed threads in the sidebar.
//
// Logic:
//   - Each thread has a `lastRunId` (from /conversations/status).
//   - When the user views a thread, we record `lastSeenRunId[threadId] = lastRunId`.
//   - A thread is "unread" iff lastSeenRunId[threadId] !== current lastRunId.
//   - New run (lastRunId changes) → automatically unread again until viewed.
//
// Mirrors `hitl-allowlist.ts` (same module-level cache + tauri-plugin-store
// + sync notify) so consumers can read synchronously from React.

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "thread.lastSeenRunId";

const store = new LazyStore(STORE_PATH);

let cache: Record<string, string> = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const v = await store.get<Record<string, string>>(KEY);
      if (v && typeof v === "object") cache = { ...v };
    } catch (err) {
      console.warn("[thread-unread] load failed", err);
    }
    loaded = true;
    notify();
  })();
  return loadingPromise;
}

function notify(): void {
  for (const fn of listeners) fn();
}

async function persist(): Promise<void> {
  try {
    await store.set(KEY, cache);
    await store.save();
  } catch (err) {
    console.warn("[thread-unread] save failed", err);
  }
}

export function getLastSeen(): Readonly<Record<string, string>> {
  return cache;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Idempotent — no-op when the same (threadId, runId) is already recorded. */
export function markThreadRead(threadId: string, runId: string): void {
  if (cache[threadId] === runId) return;
  cache = { ...cache, [threadId]: runId };
  notify();
  void persist();
}

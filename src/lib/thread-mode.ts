// Per-thread permission mode persistence.
//
// "ask"               — default. Every mutation tool surfaces an HITL card.
// "act-without-asking"— bypass canUseTool entirely for this thread. The user
//                       trades safety for speed; the confirmation dialog
//                       makes this an explicit decision per thread.
//
// Scope rationale: per-thread (NOT per-workspace, NOT global). The user
// can be deliberate about which conversation gets autopilot — a research
// thread on /repo-a can be autopilot while production scripts on /repo-a
// stay manual. Keeping the toggle thread-scoped avoids accidental
// "all my future threads here are autopilot too" blast radius.

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "thread.permissionMode";

export type PermissionMode = "ask" | "act-without-asking";
const DEFAULT_MODE: PermissionMode = "ask";

const store = new LazyStore(STORE_PATH);

let cache: Record<string, PermissionMode> = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const v = await store.get<Record<string, PermissionMode>>(KEY);
      if (v && typeof v === "object") cache = { ...v };
    } catch (err) {
      console.warn("[thread-mode] load failed", err);
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
    console.warn("[thread-mode] save failed", err);
  }
}

export function getMode(threadId: string | null | undefined): PermissionMode {
  if (!threadId) return DEFAULT_MODE;
  return cache[threadId] ?? DEFAULT_MODE;
}

export function getAll(): Readonly<Record<string, PermissionMode>> {
  return cache;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setMode(threadId: string, mode: PermissionMode): void {
  if (cache[threadId] === mode) return;
  // Don't persist the default — keeps the store small for the common case.
  if (mode === DEFAULT_MODE) {
    if (cache[threadId] === undefined) return;
    cache = { ...cache };
    delete cache[threadId];
  } else {
    cache = { ...cache, [threadId]: mode };
  }
  notify();
  void persist();
}

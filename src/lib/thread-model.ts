// Per-thread model selection persistence. Mirrors thread-mode.ts.
//
// Scope: per-thread. Different conversations may use different models
// (Opus for deep work, Haiku for triage). Switching mid-thread takes effect
// on the next turn — no retroactive recompute of previous turns.
//
// When no value is set, getModel returns null and the caller (UI / send())
// should fall back to the curated list's default (first id in CURRENT_MODELS).

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "thread.model";

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
      console.warn("[thread-model] load failed", err);
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
    console.warn("[thread-model] save failed", err);
  }
}

export function getModel(threadId: string | null | undefined): string | null {
  if (!threadId) return null;
  return cache[threadId] ?? null;
}

export function getAll(): Readonly<Record<string, string>> {
  return cache;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setModel(threadId: string, modelId: string): void {
  if (cache[threadId] === modelId) return;
  cache = { ...cache, [threadId]: modelId };
  notify();
  void persist();
}

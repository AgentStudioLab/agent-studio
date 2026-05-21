// Cross-session HITL allowlist persistence.
//
// Two layers:
//   - In-memory `Set<string>` for instant React reads (no await on every
//     paint of the approval card).
//   - tauri-plugin-store JSON file `agent-studio-store.json` for durability.
//
// Reads are eager-loaded ONCE at app boot via `ensureLoaded()`. Writes go
// through `addAllowedTool` / `removeAllowedTool` — they update the in-memory
// set synchronously (so React sees it immediately), then fire-and-forget the
// store write. If the store write fails we log and move on; the next save
// will succeed or the user re-adds next session.

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "hitl.allowedTools";

const store = new LazyStore(STORE_PATH);

let cache: Set<string> = new Set();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const v = await store.get<string[]>(KEY);
      if (Array.isArray(v)) cache = new Set(v);
    } catch (err) {
      console.warn("[hitl-allowlist] load failed", err);
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
    await store.set(KEY, [...cache]);
    await store.save();
  } catch (err) {
    console.warn("[hitl-allowlist] save failed", err);
  }
}

export function getAllowedTools(): ReadonlySet<string> {
  return cache;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function addAllowedTool(name: string): void {
  if (cache.has(name)) return;
  cache = new Set(cache);
  cache.add(name);
  notify();
  void persist();
}

export function removeAllowedTool(name: string): void {
  if (!cache.has(name)) return;
  cache = new Set(cache);
  cache.delete(name);
  notify();
  void persist();
}

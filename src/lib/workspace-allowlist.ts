// Per-workspace (cwd-scoped) HITL allowlist.
//
// Scope rationale: "始终允许 Edit" should mean "in this project, I trust this
// tool" — not "in every project I'll ever open from this app, never ask me
// again about Edit". The blast radius of a wrong global decision is the
// entire fleet of workspaces; per-cwd keeps it bounded to one directory.
//
// Storage shape: Record<cwd, string[]>. Each chat session's cwd (from
// conversations.workingDir) keys into its own allowlist. The union of this
// with the global manually-managed list (hitl-allowlist.ts) drives the
// autoAllow gate; "始终允许" button writes only here.
//
// Mirrors hitl-allowlist.ts in structure (LazyStore + in-memory cache +
// sync notify) so reads are O(1) inside React render.

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "hitl.allowedTools.workspace";

const store = new LazyStore(STORE_PATH);

// Cache shape: cwd → Set<toolName>. We keep Set in-memory so the React
// snapshot returned by useSyncExternalStore can do O(1) `.has(name)` checks.
let cache: Map<string, Set<string>> = new Map();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const v = await store.get<Record<string, string[]>>(KEY);
      if (v && typeof v === "object") {
        cache = new Map();
        for (const [cwd, tools] of Object.entries(v)) {
          if (Array.isArray(tools)) cache.set(cwd, new Set(tools));
        }
      }
    } catch (err) {
      console.warn("[workspace-allowlist] load failed", err);
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
    const plain: Record<string, string[]> = {};
    for (const [cwd, set] of cache) plain[cwd] = [...set];
    await store.set(KEY, plain);
    await store.save();
  } catch (err) {
    console.warn("[workspace-allowlist] save failed", err);
  }
}

const EMPTY: ReadonlySet<string> = new Set();

export function getAllowedToolsFor(cwd: string): ReadonlySet<string> {
  return cache.get(cwd) ?? EMPTY;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function addAllowedTool(cwd: string, name: string): void {
  if (!cwd) return;
  const existing = cache.get(cwd);
  if (existing?.has(name)) return;
  const nextSet = new Set(existing ?? []);
  nextSet.add(name);
  cache = new Map(cache);
  cache.set(cwd, nextSet);
  notify();
  void persist();
}

export function removeAllowedTool(cwd: string, name: string): void {
  if (!cwd) return;
  const existing = cache.get(cwd);
  if (!existing?.has(name)) return;
  const nextSet = new Set(existing);
  nextSet.delete(name);
  cache = new Map(cache);
  if (nextSet.size === 0) cache.delete(cwd);
  else cache.set(cwd, nextSet);
  notify();
  void persist();
}

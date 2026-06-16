// useDefaultApp — resolve the OS default opener for a file path.
//
// Wraps the `get_default_app` Tauri command. Results are cached at module
// scope, keyed by the lowercase file extension (everything after the last
// dot). Two files with the same extension share the same default app on
// macOS LaunchServices, so per-extension caching avoids dozens of identical
// osascript spawns when the user clicks through a folder of .md files.
//
// Returns `name: null` when:
//   - we're not in a Tauri host (Storybook / Vite dev preview)
//   - the platform isn't macOS (Windows fallback not implemented yet)
//   - LaunchServices has no registered handler for that extension
//
// In all three cases the caller (PreviewPane / OpenerMenu) should fall back
// to a generic label like "Open externally" and still expose the system
// "open" action — `shellOpen(path)` itself works fine on every platform.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DefaultApp {
  /** 本地化显示名(Finder 同款),例如 "WPS Office"。 */
  name: string;
  /** 应用 bundle 绝对路径。 */
  path: string;
  /** 应用图标的 data:image/png;base64 URL;提取失败时为 null。 */
  iconDataUrl: string | null;
}

type CacheEntry =
  | { status: "loading"; promise: Promise<DefaultApp | null> }
  | { status: "resolved"; value: DefaultApp | null };

const cache = new Map<string, CacheEntry>();

function extensionKey(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function isTauriHost(): boolean {
  // `__TAURI_INTERNALS__` is the injected runtime marker; absent in browser previews.
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function resolve(path: string): Promise<DefaultApp | null> {
  if (!isTauriHost()) return null;
  try {
    return await invoke<DefaultApp | null>("get_default_app", { path });
  } catch (err) {
    console.error("[useDefaultApp] get_default_app failed", err);
    return null;
  }
}

export interface UseDefaultAppResult {
  app: DefaultApp | null;
  isLoading: boolean;
}

export function useDefaultApp(path: string | null): UseDefaultAppResult {
  const [, force] = useState(0);
  const ext = path ? extensionKey(path) : "";

  useEffect(() => {
    if (!path || !ext) return;
    if (cache.get(ext)) return; // resolved or in-flight
    const promise = resolve(path).then((value) => {
      cache.set(ext, { status: "resolved", value });
      force((n) => n + 1);
      return value;
    });
    cache.set(ext, { status: "loading", promise });
  }, [path, ext]);

  // No path or no extension → no lookup.
  if (!path || !ext) return { app: null, isLoading: false };
  const hit = cache.get(ext);
  if (!hit || hit.status === "loading") return { app: null, isLoading: true };
  return { app: hit.value, isLoading: false };
}

export async function revealInFolder(path: string): Promise<void> {
  if (!isTauriHost()) {
    console.warn("[useDefaultApp] revealInFolder ignored outside Tauri host");
    return;
  }
  try {
    await invoke("reveal_in_folder", { path });
  } catch (err) {
    console.error("[useDefaultApp] reveal_in_folder failed", err);
  }
}

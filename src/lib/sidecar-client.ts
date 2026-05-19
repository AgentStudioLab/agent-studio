import { invoke } from "@tauri-apps/api/core";

export type SidecarInfo = { port: number; token: string };

let cached: Promise<SidecarInfo> | null = null;

/** True when running inside the Tauri webview (vs plain browser via `pnpm dev`). */
const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/**
 * Fixed dev defaults used when frontend runs in a browser (e.g. via
 * `pnpm dev` + `pnpm dev:server`). Must match the `--port=` and `--token=`
 * flags in package.json's dev:server script.
 */
const BROWSER_DEV_PORT = 4123;
const BROWSER_DEV_TOKEN = "dev-token";

/**
 * Returns sidecar connection info, blocking until the sidecar HTTP server is
 * actually accepting connections. Rust spawns the sidecar process and stores
 * port+token synchronously, but the Bun binary needs ~1-3s to start listening
 * (extract bundled deps, init bun:sqlite, bind socket). Without this probe the
 * first frontend fetch (e.g. AppShellContext mount-time recents load) races
 * the sidecar boot and fails with ECONNREFUSED — the unhandled rejection then
 * tears the React render down to a black screen.
 *
 * Result is cached so each fetcher only pays the probe cost once.
 */
const READY_PROBE_INTERVAL_MS = 200;
const READY_PROBE_TIMEOUT_MS = 15_000;

export function getSidecarInfo(): Promise<SidecarInfo> {
  if (cached) return cached;
  cached = (async () => {
    const info: SidecarInfo = isTauri
      ? await invoke<SidecarInfo>("get_sidecar_info")
      : { port: BROWSER_DEV_PORT, token: BROWSER_DEV_TOKEN };
    const start = Date.now();
    while (Date.now() - start < READY_PROBE_TIMEOUT_MS) {
      try {
        const res = await fetch(`http://127.0.0.1:${info.port}/health`, {
          headers: { Authorization: `Bearer ${info.token}` },
        });
        if (res.ok) return info;
      } catch {
        // ECONNREFUSED while sidecar still booting — keep waiting
      }
      await new Promise((r) => setTimeout(r, READY_PROBE_INTERVAL_MS));
    }
    throw new Error("sidecar_not_ready_within_15s");
  })().catch((e) => {
    cached = null; // allow retry on next call
    throw e;
  });
  return cached;
}

export async function fetchSidecar(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { port, token } = await getSidecarInfo();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
}

export type SSEHandler = (event: { type: string; data: string }) => void;

export async function subscribeSSE(
  path: string,
  onEvent: SSEHandler,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetchSidecar(path, { signal });
  if (!res.body) throw new Error("no stream body");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let type = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      onEvent({ type, data });
    }
  }
}

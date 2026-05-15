import { invoke } from "@tauri-apps/api/core";

export type SidecarInfo = { port: number; token: string };

let cached: Promise<SidecarInfo> | null = null;

export function getSidecarInfo(): Promise<SidecarInfo> {
  if (!cached) cached = invoke<SidecarInfo>("get_sidecar_info");
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

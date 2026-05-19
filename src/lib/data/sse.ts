import { fetchSidecar } from "../sidecar-client";
import type { SseEvent } from "./types";

/**
 * Parse text/event-stream into AsyncIterable<SseEvent>.
 * 复用 fetchSidecar (它注入 Bearer token + base url)。
 */
export async function* fetchSseStream(
  path: string,
  init: RequestInit = {},
): AsyncIterable<SseEvent> {
  const res = await fetchSidecar(path, init);
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SSE request failed: ${res.status} ${errText}`);
  }

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

      let eventName = "message";
      let dataLine = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      yield { event: eventName, data: JSON.parse(dataLine) } as SseEvent;
    }
  }
}

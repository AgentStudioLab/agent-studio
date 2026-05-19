import { EventEncoder } from "@ag-ui/encoder";
import type { AGUIEvent } from "./types";

const enc = new EventEncoder();

export function encodeSse(ev: AGUIEvent): string {
  return enc.encodeSSE(ev);
}

export const SSE_CONTENT_TYPE = enc.getContentType();

/**
 * 假的 Agent SDK 实现。AGENT_SDK_MOCK=1 时由 agent.ts 切换到这条路径。
 * 行为：把 prompt 拆成单词，逐 chunk 流出 text_delta，最后 message_stop。
 * 关心的是事件流形状，不关心内容真实性。
 */

import type { Message } from "../types";

export interface MockEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_stop";
  delta?: { type: "text_delta"; text: string };
}

export async function* mockQuery(opts: {
  messages: Message[];
  signal?: AbortSignal;
}): AsyncIterable<MockEvent> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const echo = lastUser?.blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join(" ") ?? "";
  const chunks = echo.split(/(\s+)/).filter((c) => c.length > 0);

  yield { type: "message_start" };
  yield { type: "content_block_start" };
  for (const chunk of chunks) {
    if (opts.signal?.aborted) return;
    yield { type: "content_block_delta", delta: { type: "text_delta", text: chunk } };
    await new Promise((r) => setTimeout(r, 10));
  }
  yield { type: "content_block_stop" };
  yield { type: "message_stop" };
}

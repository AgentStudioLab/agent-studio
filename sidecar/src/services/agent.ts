import type { ContentBlock, Message } from "../types";
import type { SseEvent } from "../lib/sse";
import { mockQuery } from "./agent.mock";

/**
 * Agent SDK 原生事件形状（简化版，匹配 mock 与真 SDK 的并集）。
 * 真接入时（Task 17）若 SDK 字段名不同，在 query() 适配层做映射。
 */
export type RawAgentEvent =
  | { type: "message_start" }
  | { type: "content_block_start" }
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_stop" }
  | { type: "message_stop" };

export interface QueryOptions {
  messages: Message[];
  apiKey: string;
  signal?: AbortSignal;
}

/** 翻译原生事件流为我们的 SSE 事件词表。 */
export async function* translateEvents(
  raw: AsyncIterable<RawAgentEvent>,
  ctx: { messageId: string },
): AsyncIterable<SseEvent> {
  try {
    for await (const ev of raw) {
      if (ev.type === "message_start") {
        yield { event: "message-start", data: { messageId: ctx.messageId, role: "assistant" } };
      } else if (ev.type === "content_block_delta") {
        yield {
          event: "text-delta",
          data: { messageId: ctx.messageId, blockIndex: 0, text: ev.delta.text },
        };
      } else if (ev.type === "message_stop") {
        yield { event: "message-stop", data: { messageId: ctx.messageId, finishReason: "end_turn" } };
      }
      // content_block_start / content_block_stop 在 v1 文本-only 下不需要前端感知
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      yield { event: "aborted", data: { messageId: ctx.messageId } };
      return;
    }
    yield {
      event: "error",
      data: { code: "agent_error", message: e instanceof Error ? e.message : String(e) },
    };
  }
}

/** 聚合 SSE 事件流的 text-delta 为完整 ContentBlock[]，供入库使用。 */
export function aggregateBlocks(events: SseEvent[]): ContentBlock[] {
  let text = "";
  for (const e of events) {
    if (e.event === "text-delta") {
      text += (e.data as { text: string }).text;
    }
  }
  return text.length > 0 ? [{ type: "text", text }] : [];
}

/** 入口：返回原始事件流。AGENT_SDK_MOCK=1 走 mock；否则走真 SDK。 */
export async function* query(opts: QueryOptions): AsyncIterable<RawAgentEvent> {
  if (process.env.AGENT_SDK_MOCK === "1") {
    yield* mockQuery({ messages: opts.messages, signal: opts.signal });
    return;
  }

  const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk");

  // 取最后一条 user 消息的文本作为 prompt（v1 单轮）
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt =
    lastUser?.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("") ?? "";

  // AbortSignal → AbortController（SDK 要求传 controller，不接受 signal）
  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) {
      ac.abort(opts.signal.reason);
    } else {
      opts.signal.addEventListener("abort", () => ac.abort(opts.signal!.reason), { once: true });
    }
  }

  const stream = sdkQuery({
    prompt,
    options: {
      abortController: ac,
      env: { ...process.env, ANTHROPIC_API_KEY: opts.apiKey },
      // 禁止所有文件/shell 工具，纯对话模式
      tools: [],
    },
  });

  yield { type: "message_start" };

  let emittedContent = false;

  for await (const msg of stream) {
    if (msg.type === "stream_event") {
      // BetaRawMessageStreamEvent 与 RawAgentEvent 形状一致
      const ev = msg.event as RawAgentEvent;
      if (
        ev.type === "content_block_start" ||
        ev.type === "content_block_stop" ||
        ev.type === "message_stop"
      ) {
        yield ev;
        if (ev.type === "message_stop") return;
      } else if (ev.type === "content_block_delta") {
        emittedContent = true;
        yield ev;
      }
    } else if (msg.type === "assistant" && !emittedContent) {
      // 非流式回退：从完整 BetaMessage 提取文本
      const betaMsg = msg.message as { content?: Array<{ type: string; text?: string }> };
      const text = betaMsg.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";
      if (text) {
        yield { type: "content_block_start" };
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
        yield { type: "content_block_stop" };
      }
    } else if (msg.type === "result") {
      // result 消息表示完成，补充 message_stop（如果 stream_event 路径没发）
      if (!emittedContent) {
        // nothing useful came through stream_event; assistant block above handled it
      }
      yield { type: "message_stop" };
      return;
    }
  }

  // 流结束但没有 result/message_stop，补一个
  yield { type: "message_stop" };
}

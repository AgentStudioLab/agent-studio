import { describe, it, expect } from "bun:test";
import { translateEvents, type RawAgentEvent } from "../../src/services/agent";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe("translateEvents", () => {
  it("translates message_start / text_delta×3 / message_stop into SSE events", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      yield { type: "content_block_start" };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: " " } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "world" } };
      yield { type: "content_block_stop" };
      yield { type: "message_stop" };
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-1" }));

    expect(events.map((e) => e.event)).toEqual([
      "message-start",
      "text-delta",
      "text-delta",
      "text-delta",
      "message-stop",
    ]);
    expect(events[0]!.data).toEqual({ messageId: "msg-1", role: "assistant" });
    expect(events[1]!.data).toEqual({ messageId: "msg-1", blockIndex: 0, text: "hello" });
    expect(events[4]!.data).toEqual({ messageId: "msg-1", finishReason: "end_turn" });
  });

  it("emits aborted when source throws AbortError", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      yield { type: "content_block_start" };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } };
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-2" }));
    expect(events.at(-1)!.event).toBe("aborted");
    expect(events.at(-1)!.data).toEqual({ messageId: "msg-2" });
  });

  it("emits error on non-abort throw", async () => {
    async function* raw(): AsyncIterable<RawAgentEvent> {
      yield { type: "message_start" };
      throw new Error("boom");
    }
    const events = await collect(translateEvents(raw(), { messageId: "msg-3" }));
    expect(events.at(-1)!.event).toBe("error");
    expect((events.at(-1)!.data as { message: string }).message).toBe("boom");
  });
});

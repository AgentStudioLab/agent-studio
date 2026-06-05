import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { streamOpenAITextToAgui } from "./bridge";

async function* textStream(parts: string[]) {
  for (const part of parts) yield part;
}

describe("streamOpenAITextToAgui", () => {
  it("emits AGUI text events and calls callbacks", async () => {
    const ended: Array<{ id: string; content: string }> = [];

    const events = [];
    for await (const event of streamOpenAITextToAgui({
      runId: "run",
      threadId: "thread",
      textStream: textStream(["你", "好"]),
      usage: Promise.resolve({
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
      }),
      model: "gpt-5.1",
      callbacks: {
        onMessageEnd: (msg) => {
          ended.push({ id: msg.id, content: msg.content });
        },
        onRunUsage: (usage) => {
          expect(usage.inputTokens).toBe(3);
          expect(usage.outputTokens).toBe(2);
          expect(usage.model).toBe("gpt-5.1");
        },
      },
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(ended[0]?.content).toBe("你好");
  });
});

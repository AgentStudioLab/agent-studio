import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createOpenAICompatibleProvider } from "./provider";

describe("createOpenAICompatibleProvider", () => {
  it("does not support pending interrupts or file rewind", async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.1",
      streamTextImpl: (() => {
        throw new Error("not called");
      }) as never,
    });

    expect(await provider.getPendingInterrupts("thread", "run")).toEqual([]);
    expect(
      await provider.rewindFiles?.({
        threadId: "thread",
        cwd: "/tmp",
        checkpointUuid: "uuid",
      }),
    ).toEqual({ canRewind: false, error: "unsupported" });
  });

  it("resume returns RUN_ERROR because OpenAI runtime has no HITL interrupt", async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.1",
      streamTextImpl: (() => {
        throw new Error("not called");
      }) as never,
    });

    const events = [];
    for await (const event of provider.resume({
      threadId: "thread",
      runId: "run",
      resumePayload: {},
      abortSignal: new AbortController().signal,
      cwd: "/tmp",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: EventType.RUN_STARTED, threadId: "thread", runId: "run" },
      {
        type: EventType.RUN_ERROR,
        code: "EXECUTION_ERROR",
        message:
          "OpenAI-compatible runtime has no pending interrupt to resume.",
      },
    ]);
  });
});

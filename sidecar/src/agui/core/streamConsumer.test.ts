// Guards the deny-path "stream error" fix: when abortSignal.aborted is set
// (user pressed Stop OR denied a HITL approval card → resume route called
// aborter.abort()), the bridge's RUN_ERROR may surface without code=CANCELLED
// because the SDK throws something other than AbortError on the abort race.
// The consumer is the authoritative tagger — it MUST mutate the event to
// carry code=CANCELLED so the SSE client treats it as silent cancellation
// rather than rendering "错误：stream error".

import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { consumeAguiStream } from "./streamConsumer";
import type { AGUIEvent } from "./types";
import type { RunEventStore } from "./store-types";
import type { AgentProvider } from "./provider-types";

function makeStubStore() {
  const appended: AGUIEvent[] = [];
  const store = {
    appendEvent: async (_runId: string, ev: AGUIEvent) => {
      appended.push(ev);
    },
  } as unknown as RunEventStore;
  return { store, appended };
}

const noopProvider = {
  getPendingInterrupts: async () => [],
} as unknown as AgentProvider;

describe("consumeAguiStream — CANCELLED tagging", () => {
  it("tags RUN_ERROR with code=CANCELLED when abortSignal is aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const { store, appended } = makeStubStore();
    const stream = (async function* () {
      yield {
        type: EventType.RUN_ERROR,
        message: "Something the SDK said when interrupted",
      } as AGUIEvent;
    })();
    const result = await consumeAguiStream(stream, {
      runId: "r",
      threadId: "t",
      store,
      provider: noopProvider,
      abortSignal: ac.signal,
    });
    expect(result).toEqual({
      outcome: "errored",
      message: "Something the SDK said when interrupted",
      cancelled: true,
    });
    expect(appended).toHaveLength(1);
    expect((appended[0] as { code?: string }).code).toBe("CANCELLED");
  });

  it("preserves existing code (does NOT overwrite bridge's tagging)", async () => {
    const ac = new AbortController();
    ac.abort();
    const { store, appended } = makeStubStore();
    const stream = (async function* () {
      yield {
        type: EventType.RUN_ERROR,
        code: "RATE_LIMIT",
        message: "rate limited then aborted",
      } as AGUIEvent;
    })();
    await consumeAguiStream(stream, {
      runId: "r",
      threadId: "t",
      store,
      provider: noopProvider,
      abortSignal: ac.signal,
    });
    expect((appended[0] as { code?: string }).code).toBe("RATE_LIMIT");
  });

  it("does NOT tag RUN_ERROR when abortSignal is not aborted", async () => {
    const ac = new AbortController();
    const { store, appended } = makeStubStore();
    const stream = (async function* () {
      yield {
        type: EventType.RUN_ERROR,
        message: "genuine error",
      } as AGUIEvent;
    })();
    await consumeAguiStream(stream, {
      runId: "r",
      threadId: "t",
      store,
      provider: noopProvider,
      abortSignal: ac.signal,
    });
    expect((appended[0] as { code?: string }).code).toBeUndefined();
  });
});

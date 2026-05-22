import { EventType } from "@ag-ui/core";
import type { AGUIInterrupt } from "./interrupts";
import type { RunEventStore } from "./store-types";
import type { AGUIEvent } from "./types";
import type { AgentProvider } from "./provider-types";

export type ConsumeResult =
  | { outcome: "completed" }
  | { outcome: "errored"; message: string; cancelled: boolean }
  | {
      outcome: "interrupted";
      interrupts: AGUIInterrupt[];
      runFinishedEvent: AGUIEvent;
    };

export interface StreamConsumerInput {
  runId: string;
  threadId: string;
  store: RunEventStore;
  provider: AgentProvider;
  abortSignal: AbortSignal;
}

export async function consumeAguiStream(
  stream: AsyncIterable<AGUIEvent>,
  input: StreamConsumerInput,
): Promise<ConsumeResult> {
  const { runId, threadId, store, provider, abortSignal } = input;

  for await (const ev of stream) {
    if (ev.type === EventType.RUN_FINISHED) {
      const interrupts = await provider.getPendingInterrupts(threadId, runId);
      if (interrupts.length > 0) {
        return { outcome: "interrupted", interrupts, runFinishedEvent: ev };
      }
      await store.appendEvent(runId, ev);
      return { outcome: "completed" };
    }

    if (ev.type === EventType.RUN_ERROR) {
      // Authoritatively tag user-cancelled runs with code=CANCELLED before
      // persisting, so SSE on the client treats them as `aborted` (silent)
      // instead of `error` (which would render "stream error"). The bridge
      // can only tag what it recognises as AbortError; deny + abort races
      // can surface as wrapped/native errors with no recognisable name.
      const evWithCode = ev as { code?: string };
      if (abortSignal.aborted && !evWithCode.code) {
        evWithCode.code = "CANCELLED";
      }
      await store.appendEvent(runId, ev);
      const err = (ev as { message?: string }).message ?? "run error";
      return {
        outcome: "errored",
        message: err,
        cancelled: abortSignal.aborted,
      };
    }

    await store.appendEvent(runId, ev);
  }

  if (abortSignal.aborted) {
    return { outcome: "errored", message: "cancelled", cancelled: true };
  }
  return { outcome: "completed" };
}

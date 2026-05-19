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

    await store.appendEvent(runId, ev);

    if (ev.type === EventType.RUN_ERROR) {
      const err = (ev as { message?: string }).message ?? "run error";
      return {
        outcome: "errored",
        message: err,
        cancelled: abortSignal.aborted,
      };
    }
  }

  if (abortSignal.aborted) {
    return { outcome: "errored", message: "cancelled", cancelled: true };
  }
  return { outcome: "completed" };
}

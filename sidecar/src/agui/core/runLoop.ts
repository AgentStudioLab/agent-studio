import { consumeAguiStream, type ConsumeResult } from "./streamConsumer";
import type { RunEventStore } from "./store-types";
import type { AGUIEvent } from "./types";
import type {
  AgentProvider,
  ProviderCallbacks,
} from "./provider-types";

export interface RunLoopInput {
  runId: string;
  threadId: string;
  store: RunEventStore;
  provider: AgentProvider;
  initialStream: AsyncIterable<AGUIEvent>;
  callbacks?: ProviderCallbacks;
  abortSignal: AbortSignal;
  onCompleted?: () => void;
  onTerminal?: (
    status: "completed" | "error" | "cancelled" | "awaiting_approval",
    errorMsg?: string,
  ) => void | Promise<void>;
}

/**
 * Drive the consume → (maybe surface interrupt) loop. v1 does not implement
 * HITL auto-approve (no whitelist; first interrupt always surfaces). The
 * interrupt branch is kept so that adding tools + approvals later requires
 * only adding back the auto-approve gate.
 */
export async function executeRunLoop(input: RunLoopInput): Promise<void> {
  const {
    runId,
    threadId,
    store,
    provider,
    initialStream,
    abortSignal,
    onCompleted,
    onTerminal,
  } = input;
  // provider unused for now (would be used for resume in HITL path)
  void provider;
  void threadId;

  const result: ConsumeResult = await consumeAguiStream(initialStream, {
    runId,
    threadId,
    store,
    provider,
    abortSignal,
  });

  if (result.outcome === "completed") {
    await store.finishRun(runId, "completed");
    await onTerminal?.("completed");
    onCompleted?.();
    return;
  }

  if (result.outcome === "errored") {
    const status = result.cancelled ? "cancelled" : "error";
    await store.finishRun(
      runId,
      status,
      result.cancelled ? "cancelled by user" : result.message,
    );
    await onTerminal?.(status, result.cancelled ? "cancelled by user" : result.message);
    return;
  }

  // outcome === "interrupted" — v1: surface immediately (no auto-approve).
  await store.appendEvent(runId, {
    ...result.runFinishedEvent,
    outcome: "interrupt",
    interrupts: result.interrupts,
  } as never);
  await store.finishRun(runId, "awaiting_approval");
  await onTerminal?.("awaiting_approval");
}

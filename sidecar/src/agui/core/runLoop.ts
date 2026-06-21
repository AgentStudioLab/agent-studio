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
    status: "completed" | "error" | "cancelled" | "awaiting_user",
    errorMsg?: string,
  ) => void | Promise<void>;
}

/**
 * 驱动 consume →（必要时暴露 interrupt）的循环。中断统一暂停为等待用户，
 * 具体渲染 ask-user 输入还是 tool approval 控件由 interrupt reason 决定。
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

  // outcome === "interrupted"：立即暴露中断，并把 run 停在等待用户状态。
  await store.appendEvent(runId, {
    ...result.runFinishedEvent,
    outcome: "interrupt",
    interrupts: result.interrupts,
  } as never);
  await store.finishRun(runId, "awaiting_user");
  await onTerminal?.("awaiting_user");
}

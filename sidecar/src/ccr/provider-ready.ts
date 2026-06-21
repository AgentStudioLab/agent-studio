import { EventType } from "@ag-ui/core";
import type { AgentProvider, ResumeContext, RunContext } from "../agui/core";
import type { AGUIEvent } from "../agui/core/types";

type ReadyFn = () => Promise<void>;

async function* runAfterReady(
  ctx: RunContext | ResumeContext,
  ready: ReadyFn,
  runInner: () => AsyncIterable<AGUIEvent>,
): AsyncIterable<AGUIEvent> {
  try {
    await ready();
  } catch (err) {
    yield {
      type: EventType.RUN_STARTED,
      threadId: ctx.threadId,
      runId: ctx.runId,
    } as AGUIEvent;
    yield {
      type: EventType.RUN_ERROR,
      code: "MODEL_ERROR",
      message: err instanceof Error ? err.message : String(err),
    } as AGUIEvent;
    return;
  }

  yield* runInner();
}

export function withCcrReady(
  provider: AgentProvider,
  ready: ReadyFn,
): AgentProvider {
  return {
    name: provider.name,
    run: (ctx) => runAfterReady(ctx, ready, () => provider.run(ctx)),
    resume: (ctx) => runAfterReady(ctx, ready, () => provider.resume(ctx)),
    getPendingInterrupts: (threadId, runId) =>
      provider.getPendingInterrupts(threadId, runId),
    notifyCancelled: (threadId) =>
      provider.notifyCancelled?.(threadId) ?? Promise.resolve(),
    rewindFiles: provider.rewindFiles
      ? (input) => provider.rewindFiles!(input)
      : undefined,
  };
}

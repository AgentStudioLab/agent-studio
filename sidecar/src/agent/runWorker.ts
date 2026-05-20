import { EventType } from "@ag-ui/core";
import {
  executeRunLoop,
  type RunEventStore,
  type AgentProvider,
  type ProviderCallbacks,
} from "../agui/core";
import type { MessageService } from "../services/messages";
import type { ThreadService } from "../services/threads";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";

export interface RunWorkerInput {
  runId: string;
  threadId: string;
  userMessage: { role: "user"; content: string };
  store: RunEventStore;
  messages: MessageService;
  threads: ThreadService;
  provider: AgentProvider;
  interruptBus: InterruptBus;
  abortSignal: AbortSignal;
}

export async function runWorker(input: RunWorkerInput): Promise<void> {
  const {
    runId,
    threadId,
    userMessage,
    store,
    messages,
    threads,
    provider,
    abortSignal,
  } = input;

  const callbacks: ProviderCallbacks = {
    onMessageEnd(msg) {
      messages.appendAssistant(threadId, {
        id: msg.id,
        content: msg.content,
        reasoning: msg.reasoning,
      });
    },
    onToolCallEnd(tc) {
      if (tc.parentMessageId) {
        messages.upsertToolCall(tc.parentMessageId, {
          id: tc.id,
          toolName: tc.toolName,
          args: tc.args,
        });
      }
    },
    onToolCallResult(tc) {
      messages.completeToolCall(tc.id, {
        result: tc.result,
        status: tc.status,
        errorMsg: tc.errorMsg,
      });
    },
  };

  try {
    const initialStream = provider.run({
      runId,
      threadId,
      userMessage,
      abortSignal,
      callbacks,
    });

    await executeRunLoop({
      runId,
      threadId,
      store,
      provider,
      initialStream,
      callbacks,
      abortSignal,
      onTerminal: async (status) => {
        // Reject any still-pending HITL approvals for this run so the SDK
        // unblocks (canUseTool resolves as deny → SDK aborts the tool +
        // emits its own terminal). Safe to call when no deferreds exist.
        input.interruptBus.cancelAll(runId);
        messages.cancelPendingToolCallsForThread(threadId);
        if (status === "cancelled") {
          messages.appendSystemNote(threadId, "已被用户中止");
          await provider.notifyCancelled?.(threadId);
        }
        threads.touch(threadId);
      },
    });
  } catch (err) {
    input.interruptBus.cancelAll(runId);
    const msg = err instanceof Error ? err.message : String(err);
    await store.appendEvent(runId, {
      type: EventType.RUN_ERROR,
      message: msg,
      code: abortSignal.aborted ? "CANCELLED" : "WORKER_ERROR",
    } as never);
    await store.finishRun(runId, abortSignal.aborted ? "cancelled" : "error", msg);
    if (abortSignal.aborted) {
      try {
        messages.appendSystemNote(threadId, "已被用户中止");
      } catch {
        /* best-effort */
      }
    }
  }
}

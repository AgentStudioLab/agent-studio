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
import type { UsageService } from "../services/usage";

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
  usage: UsageService;
  /** "ask" (default) or "act-without-asking" (skip HITL approvals). */
  permissionMode?: "ask" | "act-without-asking";
  /** Per-run model id override (e.g. "claude-opus-4-7"). */
  model?: string;
  /** Per-task allow-list for scheduled/background runs (see RunContext). */
  autoApproveTools?: string[];
  /** DB id of the user message this run answers. When set, the captured SDK
   *  prompt uuid is persisted onto it (for future regenerate). */
  userMessageId?: string;
  /** Regenerate: resume the SDK session at this message uuid (see RunContext). */
  resumeSessionAt?: string;
  /** Regenerate of the first turn: skip resume, fresh session (see RunContext). */
  freshSession?: boolean;
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
    interruptBus,
    abortSignal,
    usage,
    permissionMode = "ask",
    model,
    autoApproveTools,
    userMessageId,
    resumeSessionAt,
    freshSession,
  } = input;

  // Buffer the structured messages/tool_calls writes until the run reaches a
  // truly terminal state. This is the "single source of truth" guarantee for
  // in-flight turns: while a run is streaming or paused on HITL approval, the
  // only authoritative representation is the AG-UI event log in run_events.
  // /conversations/:id/messages reads from messages/tool_calls — if we flush
  // mid-run, the client gets both a persisted half-turn AND the SSE-replay
  // rebuild of the same turn, producing duplicates after cross-session resume.
  type PendingAssistant = { id: string; content: string; reasoning?: string; sdkUuid?: string };
  type PendingToolCall = { parentMessageId: string; id: string; toolName: string; args: unknown };
  type PendingToolResult = {
    id: string;
    result: unknown;
    status: "success" | "error";
    errorMsg?: string;
    sideEffects?: import("../agui/provider-claude/bash-side-effects").SideEffectFile[];
  };
  const assistantBuffer: PendingAssistant[] = [];
  const toolCallBuffer: PendingToolCall[] = [];
  const toolResultBuffer: PendingToolResult[] = [];

  function flushMessagesBuffers(): void {
    for (const m of assistantBuffer) {
      messages.appendAssistant(threadId, {
        id: m.id,
        content: m.content,
        reasoning: m.reasoning,
        sdkUuid: m.sdkUuid,
      });
    }
    for (const tc of toolCallBuffer) {
      messages.upsertToolCall(tc.parentMessageId, {
        id: tc.id,
        toolName: tc.toolName,
        args: tc.args,
      });
    }
    for (const r of toolResultBuffer) {
      messages.completeToolCall(r.id, {
        result: r.result,
        status: r.status,
        errorMsg: r.errorMsg,
        sideEffects: r.sideEffects,
      });
    }
    assistantBuffer.length = 0;
    toolCallBuffer.length = 0;
    toolResultBuffer.length = 0;
  }

  const callbacks: ProviderCallbacks = {
    onMessageEnd(msg) {
      assistantBuffer.push({
        id: msg.id,
        content: msg.content,
        reasoning: msg.reasoning,
        sdkUuid: msg.sdkUuid,
      });
    },
    onUserMessageId(uuid) {
      // The user row already exists (appended by the route before the run).
      // Persist the SDK prompt uuid immediately — it's metadata, not part of
      // the buffered single-source-of-truth turn, and a valid checkpoint even
      // if the run is later cancelled.
      if (userMessageId) messages.setSdkUuid(userMessageId, uuid);
    },
    onToolCallEnd(tc) {
      if (tc.parentMessageId) {
        toolCallBuffer.push({
          parentMessageId: tc.parentMessageId,
          id: tc.id,
          toolName: tc.toolName,
          args: tc.args,
        });
      }
    },
    onToolCallResult(tc) {
      toolResultBuffer.push({
        id: tc.id,
        result: tc.result,
        status: tc.status,
        errorMsg: tc.errorMsg,
        sideEffects: tc.sideEffects,
      });
    },
    onRunUsage(u) {
      usage.recordRun({
        runId: u.runId,
        threadId: u.threadId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheCreationTokens: u.cacheCreationTokens,
        cacheReadTokens: u.cacheReadTokens,
        totalCostUsd: u.totalCostUsd,
        permissionDenials: u.permissionDenials,
        model: u.model,
      });
    },
  };

  // Resolve the thread's persisted working directory once at run start.
  // ThreadService.get falls back to ~/.agent-studio when working_dir is NULL,
  // so cwd is always a real path the SDK can chdir to.
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(`thread ${threadId} not found`);
  }
  const cwd = thread.workingDir;

  try {
    const initialStream = provider.run({
      runId,
      threadId,
      userMessage,
      abortSignal,
      callbacks,
      cwd,
      permissionMode,
      model,
      autoApproveTools,
      resumeSessionAt,
      freshSession,
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
        interruptBus.cancelAll(runId);
        // Flush buffered assistant turns + tool_calls now — before
        // cancelPendingToolCallsForThread (which marks any still-pending
        // tool_calls as error) and before the system note, so chronological
        // order via createdAt is correct.
        flushMessagesBuffers();
        messages.cancelPendingToolCallsForThread(threadId);
        if (status === "cancelled") {
          messages.appendSystemNote(threadId, "已被用户中止");
          await provider.notifyCancelled?.(threadId);
        }
        threads.touch(threadId);
      },
    });
  } catch (err) {
    interruptBus.cancelAll(runId);
    // Outer catch fires when executeRunLoop itself throws (network during
    // store writes, unexpected exceptions). Flush whatever made it into the
    // buffer so the user sees the partial state on next /messages load —
    // losing it silently is worse than persisting a half-turn.
    flushMessagesBuffers();
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

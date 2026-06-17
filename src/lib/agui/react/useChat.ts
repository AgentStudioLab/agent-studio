// React binding for ChatRuntime. Mirrors agui-vue/vue/useChat.ts but uses
// useSyncExternalStore + memoised commands. The framework adapter is the only
// React-specific surface; all protocol logic lives in ../runtime/.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createChatRuntime,
  type ChatRuntime,
  type ChatState,
  type MessageView,
  type PendingInterrupt,
  type ProviderModelSelection,
} from "../runtime";
import { authedFetch } from "@/lib/sidecar-client";
import i18n from "@/i18n";

export type {
  MessageBlock,
  MessageView,
  ToolCallView,
  PendingInterrupt,
} from "../runtime";

export interface UseChatOptions {
  threadId: string;
  /** Optional initial history (turn-grouped from /conversations/:id/messages). */
  initialMessages?: unknown[];
}

const THREAD_STATUS_KEY = ["thread-statuses"] as const;

/**
 * Subscribe to one thread's ChatRuntime. Threads are 1-to-1 with runtime
 * instances; switching threadId tears down + recreates the runtime so the
 * previous SSE / argsBuffer can't leak across.
 */
export function useChat(opts: UseChatOptions) {
  const qc = useQueryClient();
  const runtimeRef = useRef<ChatRuntime | null>(null);

  // Create a fresh runtime when threadId changes. We can't pass everything via
  // a single useMemo because StrictMode mounts effects twice — runtimeRef +
  // explicit destroy in cleanup handles that path.
  // initialMessages intentionally NOT in deps: only the first mount uses it;
  // subsequent threadId switches start with empty history (caller can pass new
  // initialMessages via key={threadId} on the consumer if they need it).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runtime = useMemo<ChatRuntime>(() => {
    runtimeRef.current?.destroy();
    const invalidateAfterRun = () => {
      // Sidebar pulse dot + active-run discovery share this query key.
      void qc.invalidateQueries({ queryKey: THREAD_STATUS_KEY });
      // Persisted history — server has just appended the final assistant
      // turn; the next history fetch should pick it up.
      void qc.invalidateQueries({
        queryKey: ["conversations", opts.threadId, "messages"],
      });
      // Context Tab caches per-thread SDK capabilities (skills + MCP servers).
      // Each Run starts with system.init that may carry a different set
      // (e.g. an MCP came online); invalidate so the next read re-fetches.
      void qc.invalidateQueries({
        queryKey: ["thread-context", opts.threadId],
      });
    };

    const rt = createChatRuntime({
      threadId: opts.threadId,
      // apiBase blank — authedFetch normalises relative paths.
      apiBase: "",
      fetchImpl: authedFetch,
      // Read fresh per request so a language switch mid-session takes effect.
      getLocale: () => i18n.language,
      initialMessages: opts.initialMessages,
      onRunFinished: invalidateAfterRun,
      onRunError: invalidateAfterRun,
    });
    runtimeRef.current = rt;
    return rt;
  }, [opts.threadId]);

  // Tear down on unmount (StrictMode double-mount: useMemo recomputes, prior
  // runtime is destroyed inline; the final unmount cleanup handles the last one).
  useEffect(() => {
    return () => {
      runtime.destroy();
    };
  }, [runtime]);

  // HITL allowlist composition is NOT useChat's concern anymore — TaskView
  // owns the union of (global manual) + (workspace cwd-scoped) lists, both
  // persisted via tauri-plugin-store. Keeping the runtime hook free of that
  // policy lets non-chat surfaces (e.g. Settings) read/write the same stores
  // without going through ChatRuntime.

  const state = useSyncExternalStore<ChatState>(
    useCallback((listener) => runtime.subscribe(listener), [runtime]),
    useCallback(() => runtime.getState(), [runtime]),
    useCallback(() => runtime.getState(), [runtime]),
  );

  const send = useCallback(
    async (
      text: string,
      sendOpts?: {
        permissionMode?: "ask" | "act-without-asking";
        providerSelection?: ProviderModelSelection;
        model?: string;
        approvalRules?: string[];
        officialAuthToken?: string;
        officialWebsiteOrigin?: string;
      },
    ) => {
      // finally (not a trailing statement) so the status query also refreshes
      // when runtime.send rejects with RunInProgressError — that lets the
      // attach effect discover the live run faster. The rejection still
      // propagates to the caller (TaskView re-queues on it).
      try {
        await runtime.send(text, sendOpts);
      } finally {
        // Light up sidebar pulse + active-run derivation immediately. Symmetric
        // invalidation fires from onRunFinished/Error when the run terminates.
        void qc.invalidateQueries({ queryKey: THREAD_STATUS_KEY });
      }
    },
    [runtime, qc],
  );
  const regenerate = useCallback(
    async (
      fromMessageId: string,
      regenOpts?: {
        permissionMode?: "ask" | "act-without-asking";
        providerSelection?: ProviderModelSelection;
        model?: string;
        approvalRules?: string[];
        officialAuthToken?: string;
        officialWebsiteOrigin?: string;
      },
    ) => {
      try {
        await runtime.regenerate(fromMessageId, regenOpts);
      } finally {
        void qc.invalidateQueries({ queryKey: THREAD_STATUS_KEY });
      }
    },
    [runtime, qc],
  );
  const cancel = useCallback(async () => {
    await runtime.cancel();
    void qc.invalidateQueries({ queryKey: THREAD_STATUS_KEY });
  }, [runtime, qc]);
  const resumeRun = useCallback(
    async (payload: unknown) => {
      await runtime.resume(payload);
      void qc.invalidateQueries({ queryKey: THREAD_STATUS_KEY });
    },
    [runtime, qc],
  );
  const attachToRun = useCallback(
    (runId: string, cursor?: string) => runtime.attachToRun(runId, { cursor }),
    [runtime],
  );
  const restoreAwaiting = useCallback(
    (runId: string, interrupts: PendingInterrupt[], cursor: string) =>
      runtime.restoreAwaiting(runId, interrupts, cursor),
    [runtime],
  );
  const setHistoricalMessages = useCallback(
    (turns: unknown[]) => runtime.setHistoricalMessages(turns),
    [runtime],
  );

  const viewMessages: MessageView[] = useMemo(() => {
    // Cross-session resume can land both copies of the in-flight assistant turn
    // here: /conversations/:id/messages returns the persisted half-written turn
    // (already in the DB), AND attachToRun's SSE replay rebuilds the same turn
    // in liveMessages. Both share the same SDK messageId — dedupe by id,
    // letting the live version win since it carries the most recent stream.
    if (state.liveMessages.length === 0) return state.historicalMessages;
    const liveIds = new Set(state.liveMessages.map((m) => m.id));
    return [
      ...state.historicalMessages.filter((m) => !liveIds.has(m.id)),
      ...state.liveMessages,
    ];
  }, [state.historicalMessages, state.liveMessages]);
  const isAwaitingApproval = useMemo(
    () => state.pendingInterrupts.some((it) => it.reason === "tool_approval"),
    [state.pendingInterrupts],
  );

  return {
    viewMessages,
    state,
    runtime,
    isRunning: state.isRunning,
    isThinking: state.isThinking,
    error: state.error,
    activeRunId: state.activeRunId,
    pendingInterrupts: state.pendingInterrupts,
    isAwaitingApproval,
    send,
    regenerate,
    cancel,
    resumeRun,
    attachToRun,
    restoreAwaiting,
    setHistoricalMessages,
  };
}

export const threadStatusKey = THREAD_STATUS_KEY;

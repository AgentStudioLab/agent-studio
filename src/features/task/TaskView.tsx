import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { RenameDialog } from "@/shared/RenameDialog";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskRightPanel, type TaskRightTabId } from "@/features/task/TaskRightPanel";
import { QueuedMessagesPanel } from "@/features/task/QueuedMessagesPanel";
import { useMessageQueue } from "@/features/task/MessageQueueContext";
import { PreviewPane } from "@/features/task/PreviewPane";
import { useChat } from "@/lib/agui/react/useChat";
import { RunInProgressError } from "@/lib/agui/runtime/api";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";
import type { MockFile } from "@/lib/mock/types";
import {
  useActiveRunForThread,
  useThreadStatuses,
} from "@/lib/agui/react/useThreadStatuses";
import { useThreadUnread } from "@/lib/agui/react/useThreadUnread";
import { useAllowedTools } from "@/lib/agui/react/useAllowedTools";
import { useWorkspaceAllowedTools } from "@/lib/agui/react/useWorkspaceAllowedTools";
import { useThreadPermissionMode } from "@/lib/agui/react/useThreadPermissionMode";
import { useThreadModel } from "@/lib/agui/react/useThreadModel";
import { useAvailableModels } from "@/lib/models";
import {
  useArchiveConversationMutation,
  useConversation,
  useMessages,
} from "@/lib/data/queries";

function touchedFileToPreview(f: TouchedFile): MockFile {
  const lower = f.relativePath.toLowerCase();
  let type: MockFile["type"] = "generic";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) type = "markdown";
  else if (lower.endsWith(".html") || lower.endsWith(".htm")) type = "html";
  else if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) type = "spreadsheet";
  else if (lower.endsWith(".pptx") || lower.endsWith(".key")) type = "presentation";
  else if (/\.(png|jpe?g|gif|svg|webp)$/.test(lower)) type = "image";
  else if (/\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp)$/.test(lower)) type = "code";
  return {
    name: f.relativePath.split("/").pop() ?? f.relativePath,
    path: f.absolutePath,
    type,
    isNew: f.firstTool === "Write",
  };
}

export function TaskView() {
  const { threadId: activeTaskId = null } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const {
    pendingFirstPrompt,
    setPendingFirstPrompt,
    preview,
    openPreview,
    closePreview,
  } = useAppShell();
  const archiveMutation = useArchiveConversationMutation();
  const [renameOpen, setRenameOpen] = useState(false);

  // History GET — turn-grouped; reducer reads as initialMessages via
  // setHistorical. Don't default `data` to `[]` here: that allocates a fresh
  // empty array each render, which makes the priming effect re-fire endlessly
  // (setHistorical → state change → re-render → new [] → effect → …).
  const messagesQuery = useMessages(activeTaskId);
  const conversationQuery = useConversation(activeTaskId);
  const activeRun = useActiveRunForThread(activeTaskId);

  // ChatRuntime per threadId. send/cancel/state come from here.
  const {
    viewMessages,
    state,
    runtime,
    isRunning,
    isThinking,
    error,
    send,
    regenerate,
    cancel,
    attachToRun,
    setHistoricalMessages,
    pendingInterrupts,
    activeRunId,
    resumeRun,
  } = useChat({ threadId: activeTaskId ?? "" });

  // HITL allowlist composition (W1 design):
  //   - global: manually populated via Settings, applies everywhere
  //   - workspace (per cwd): populated by the "始终允许" button on the
  //     approval card; scope-limited so trusting Edit in one project doesn't
  //     leak to another project on the same machine
  // Auto-allow checks the union. The button writes ONLY to the workspace set.
  const cwd = conversationQuery.data?.workingDir ?? null;
  const { allowedTools: globalAllowed } = useAllowedTools();
  const { allowedTools: workspaceAllowed, addAllowedTool: addWorkspaceTool } =
    useWorkspaceAllowedTools(cwd);
  const allowedTools = useMemo<ReadonlySet<string>>(() => {
    const merged = new Set<string>(globalAllowed);
    for (const t of workspaceAllowed) merged.add(t);
    return merged;
  }, [globalAllowed, workspaceAllowed]);
  // Permission mode (per-thread). Read here so every send/first-prompt path
  // converges on a single source — the dropdown writes to the same store the
  // useThreadPermissionMode hook subscribes to.
  const { mode: permissionMode, setMode: setPermissionMode } =
    useThreadPermissionMode(activeTaskId);
  const { model: threadModel, setModel: setThreadModel } =
    useThreadModel(activeTaskId);
  const { defaultModelId } = useAvailableModels();
  // Per-thread store returns `null` until the user picks once. Fall back to
  // the live default from /models (first id in the active profile's list).
  // If /models hasn't resolved yet, leave undefined so send() omits the field
  // and the sidecar falls back to its own default.
  // Resolution order: explicit per-thread pick → conversation default (seeded
  // for scheduled runs) → global default. So a scheduled run's conversation
  // shows the task's model even before the user touches the picker.
  const effectiveModel =
    threadModel ?? conversationQuery.data?.model ?? defaultModelId ?? undefined;

  // Seed the per-thread permission mode from the conversation's stored mode
  // (scheduled runs persist their mode on the conversation). The mode store
  // can't distinguish "unset" from "explicitly ask", so seed once per mount
  // via a ref and only when currently "ask" — a user flip within the session
  // still wins.
  const modeSeededRef = useRef<string | null>(null);
  useEffect(() => {
    const conv = conversationQuery.data;
    if (!conv || !activeTaskId) return;
    if (modeSeededRef.current === activeTaskId) return;
    modeSeededRef.current = activeTaskId;
    if (conv.permissionMode === "act-without-asking" && permissionMode === "ask") {
      setPermissionMode("act-without-asking");
    }
  }, [conversationQuery.data, activeTaskId, permissionMode, setPermissionMode]);

  // Prime runtime once history actually arrives. Skipping `undefined` keeps
  // the effect quiet during the loading window; once data is resolved
  // TanStack Query holds a stable reference until the next invalidation, so
  // the effect fires once per real load.
  useEffect(() => {
    if (!activeTaskId) return;
    const data = messagesQuery.data;
    if (!data) return;
    setHistoricalMessages(data);
  }, [activeTaskId, messagesQuery.data, setHistoricalMessages]);

  // Cross-session resume: if /conversations/status reports a still-running
  // (or awaiting_approval) run for this thread, attach to its runId and let
  // SSE replay from cursor 0 rebuild liveMessages through the reducer.
  // attachedRunFired guards against StrictMode double-mount and against
  // re-attaching for the SAME runId resolving twice from the query cache.
  const attachedRunFired = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTaskId || !activeRun) return;
    if (attachedRunFired.current === activeRun.runId) return;
    attachedRunFired.current = activeRun.runId;
    attachToRun(activeRun.runId);
  }, [activeTaskId, activeRun, attachToRun]);

  // Clear on thread switch. useChat destroys + recreates the runtime per
  // threadId, but this ref lives on TaskView and survives — without a reset,
  // returning to a thread whose runId was previously attached gets blocked
  // by the guard, the fresh runtime never starts SSE, and HITL cards don't
  // re-render (server-side awaiting_approval state is correct, but frontend
  // pendingInterrupts stays empty).
  useEffect(() => {
    attachedRunFired.current = null;
  }, [activeTaskId]);

  // First-turn handoff from NewTaskView. Defers when an active run is already
  // in flight for this thread (covers the concurrent submit+refresh race).
  // The mode chosen on the home screen (pendingFirstPrompt.permissionMode)
  // takes precedence over the per-thread default — and we persist it so
  // subsequent turns on this thread inherit the same choice.
  const firstPromptFired = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTaskId || !pendingFirstPrompt) return;
    if (pendingFirstPrompt.conversationId !== activeTaskId) return;
    if (activeRun) return;
    if (firstPromptFired.current === activeTaskId) return;
    firstPromptFired.current = activeTaskId;
    const text = pendingFirstPrompt.text;
    const firstMode = pendingFirstPrompt.permissionMode ?? permissionMode;
    const firstModel = pendingFirstPrompt.model ?? effectiveModel;
    setPendingFirstPrompt(null);
    if (pendingFirstPrompt.permissionMode) {
      setPermissionMode(pendingFirstPrompt.permissionMode);
    }
    if (pendingFirstPrompt.model) {
      setThreadModel(pendingFirstPrompt.model);
    }
    void send(text, { permissionMode: firstMode, model: firstModel });
  }, [
    activeTaskId,
    pendingFirstPrompt,
    setPendingFirstPrompt,
    permissionMode,
    setPermissionMode,
    effectiveModel,
    setThreadModel,
    send,
    activeRun,
  ]);

  // Auto-allow interrupts whose toolName is on the allowlist. The dedup set
  // is **scoped by runId** — different runs use independent fired sets, so
  // even if the SDK reuses a tool_use ID across resumed sessions we never
  // confuse one run's "already fired" with another's "fresh".
  const autoAllowFiredByRun = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    if (!activeRunId) return;
    let fired = autoAllowFiredByRun.current.get(activeRunId);
    if (!fired) {
      fired = new Set();
      autoAllowFiredByRun.current.set(activeRunId, fired);
    }
    for (const it of pendingInterrupts) {
      if (fired.has(it.id)) continue;
      const toolName = (it.payload as { toolName?: string }).toolName;
      if (toolName && allowedTools.has(toolName)) {
        fired.add(it.id);
        void resumeRun({ decisions: [{ type: "allow" }] });
      }
    }
  }, [pendingInterrupts, allowedTools, resumeRun, activeRunId]);

  // Drop the entire run→fired map on thread switch — keeps memory bounded
  // and means returning to a thread starts fresh (no stale per-run sets).
  useEffect(() => {
    autoAllowFiredByRun.current.clear();
  }, [activeTaskId]);

  // Mark the open thread as read whenever its last run reaches a terminal
  // state (completed/error/cancelled). Sidebar's onClick handler covers the
  // "user just opened a stale thread" case; this effect covers the "user is
  // already watching when the run finishes" case (very common: send prompt,
  // watch streaming, run completes → should never appear unread).
  // Idempotent — same runId no-ops in markThreadRead.
  const { data: threadStatuses = [] } = useThreadStatuses();
  const { markRead } = useThreadUnread();
  useEffect(() => {
    if (!activeTaskId) return;
    const entry = threadStatuses.find((t) => t.threadId === activeTaskId);
    if (!entry?.lastRunId) return;
    if (
      entry.status === "completed" ||
      entry.status === "error" ||
      entry.status === "cancelled"
    ) {
      markRead(activeTaskId, entry.lastRunId);
    }
  }, [activeTaskId, threadStatuses, markRead]);

  // Lifted out of TaskRightPanel so the selected tab survives a preview
  // open/close cycle — the panel itself is unmounted while a file is being
  // previewed, which would otherwise reset state to "process" on close.
  const [rightTab, setRightTab] = useState<TaskRightTabId>("process");
  // Scheduled-run conversations open on the Runs tab (per design). Seed once
  // per thread so the user can still switch away without it snapping back.
  const tabSeededRef = useRef<string | null>(null);
  useEffect(() => {
    const conv = conversationQuery.data;
    if (!conv || !activeTaskId) return;
    if (tabSeededRef.current === activeTaskId) return;
    tabSeededRef.current = activeTaskId;
    if (conv.scheduledTaskId) setRightTab("runs");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationQuery.data, activeTaskId]);

  // Per-thread message queue. Lives in MessageQueueContext (app-level) so
  // switching threads doesn't drop queued items — only an app restart does.
  const queue = useMessageQueue(activeTaskId);

  // Send a message, but if the sidecar reports the thread already has a live
  // run (409 → RunInProgressError: a scheduled run, or a send from another
  // window), re-queue the text so it auto-flushes when that run finishes,
  // instead of erroring. Other send failures surface via the runtime's own
  // error state. This is the client half of the backend's one-run-per-thread
  // guard — the composer's busy-gating prevents it in the common case, so this
  // only fires on races / multi-window.
  const sendOrQueue = useCallback(
    (text: string) => {
      void send(text, { permissionMode, model: effectiveModel }).catch((e) => {
        if (e instanceof RunInProgressError) queue.add(text);
      });
    },
    [send, permissionMode, effectiveModel, queue.add],
  );

  // "Busy" = streaming OR HITL-paused OR a server-started run is in flight.
  // Both local states block the normal Send affordance: during streaming the
  // agent is producing; during HITL the agent is waiting on tool approval.
  // Either way new user messages need to queue or override, not fire-and-forget.
  // isRunning alone is false during HITL even though the run isn't done.
  //
  // activeRun is the THIRD source: runs started elsewhere (a scheduled task,
  // another window) are discovered via /conversations/status, and local
  // isRunning only flips true AFTER the SSE attach lands. Without folding
  // activeRun in, opening a scheduled conversation whose run is still in
  // flight shows the normal Send arrow during the pre-attach window — and
  // send() (whose own guard only checks the local isRunning) would fire a
  // SECOND concurrent run on a thread already resuming the same SDK session.
  // Treating a server-known active run as busy makes the composer queue
  // instead; the auto-flush below delivers it when that run finishes.
  const isBusy = isRunning || pendingInterrupts.length > 0 || activeRun !== null;

  // [Qdbg] TEMP — remove after diagnosing the "only one queued" issue.
  useEffect(() => {
    console.log("[Qdbg] state", {
      isRunning,
      isBusy,
      interrupts: pendingInterrupts.length,
      activeRun: activeRun?.runId ?? null,
      queued: queue.items.map((i) => i.text),
    });
  }, [isRunning, isBusy, pendingInterrupts.length, activeRun, queue.items]);

  // Auto-flush: when the active run cleanly completes, pop the head of the
  // queue and send it. "Cleanly" = isRunning transitions true → false AND
  // no error AND no HITL pending AND the user didn't manually cancel.
  // The wasRunningRef gates on the TRANSITION so mounting an already-idle
  // TaskView with queue items doesn't fire a spurious flush — but mounting
  // an idle TaskView for the FIRST time after a thread switch also won't
  // see a prior transition, so a separate one-shot check handles that case
  // by treating the initial mount as "just-finished" if items exist.
  const wasRunningRef = useRef<boolean | null>(null);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;
    if (!activeTaskId) return;
    // Conditions for flush, regardless of transition:
    const canFlush =
      !isRunning &&
      !error &&
      pendingInterrupts.length === 0 &&
      queue.items.length > 0;
    if (!canFlush) return;
    // Two trigger gates:
    //   1) run just finished (wasRunning was true, now false) — normal flush
    //   2) first render on this TaskView with the queue already populated
    //      and idle (wasRunning === null) — covers thread-switch return.
    const isTransition = wasRunning === true || wasRunning === null;
    // [Qdbg] TEMP — remove after diagnosing the "only one queued" issue.
    console.log("[Qdbg] flush-check", {
      isRunning,
      wasRunning,
      isTransition,
      items: queue.items.length,
      userCancelled: queue.userCancelled,
    });
    if (!isTransition) return;
    if (queue.userCancelled) {
      queue.clearUserCancelled();
      return;
    }
    const head = queue.popHead();
    if (head) {
      sendOrQueue(head.text);
    }
  }, [
    activeTaskId,
    isRunning,
    error,
    pendingInterrupts,
    queue.items,
    queue.userCancelled,
    queue.popHead,
    queue.clearUserCancelled,
    sendOrQueue,
  ]);

  if (!activeTaskId) return null;
  const previewOpen = preview.open && preview.file;
  const taskTitle = conversationQuery.data?.title ?? "…";

  return (
    <>
    <AppShell
      bareAside={Boolean(previewOpen)}
      main={
        <>
          <TaskHeader
            conversationId={activeTaskId}
            title={taskTitle}
            onRename={() => setRenameOpen(true)}
            onArchive={() => {
              navigate("/");
              archiveMutation.mutate({ id: activeTaskId, archived: true });
            }}
          />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Frosted fade under the header: content scrolling up blurs and
                dissolves into the page bg instead of being hard-cut at the
                header edge. mask fades the blur out downward. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12"
              style={{
                background:
                  "linear-gradient(to bottom, hsl(var(--bg-100)), hsl(var(--bg-100) / 0))",
                backdropFilter: "blur(5px)",
                WebkitBackdropFilter: "blur(5px)",
                maskImage:
                  "linear-gradient(to bottom, hsl(var(--bg-100)), hsl(var(--bg-100) / 0))",
                WebkitMaskImage:
                  "linear-gradient(to bottom, hsl(var(--bg-100)), hsl(var(--bg-100) / 0))",
              }}
            />
            <ChatStream
              threadId={activeTaskId}
              runtime={runtime}
              messages={viewMessages}
              isThinking={isThinking}
              isRunning={isRunning}
              error={error}
              loading={messagesQuery.isLoading}
              pendingInterrupts={pendingInterrupts}
              onResume={resumeRun}
              allowedTools={allowedTools}
              onAllowAlways={addWorkspaceTool}
              workingDir={cwd}
              onOpenFile={({ absolutePath }) => {
                const touched: TouchedFile = {
                  absolutePath,
                  relativePath:
                    cwd && absolutePath.startsWith(cwd + "/")
                      ? absolutePath.slice(cwd.length + 1)
                      : absolutePath,
                  firstTool: "Write",
                  lastTool: "Write",
                  firstSeenAt: 0,
                  lastTouched: 0,
                };
                openPreview(touchedFileToPreview(touched));
              }}
              onRegenerate={(fromMessageId) =>
                void regenerate(fromMessageId, {
                  permissionMode,
                  model: effectiveModel,
                }).catch(() => {
                  // Only RunInProgressError propagates here (a run went live
                  // mid-regenerate — rare race). The runtime already restored
                  // the optimistic truncation + set no error; swallow so it
                  // isn't an unhandled rejection. User can retry.
                })
              }
              onContinueAfterRestart={() => {
                // Resend the last user message verbatim — gives the model the
                // identical context it had at interrupt time, so it most likely
                // proposes the same tool and the HITL flow replays cleanly.
                // Beats a fuzzy "继续上次未完成的任务" prompt that drifted the
                // model into "现在继续完成精简版的写入" in past sessions.
                for (let i = viewMessages.length - 1; i >= 0; i--) {
                  const m = viewMessages[i]!;
                  if (m.role === "user") {
                    sendOrQueue(m.content);
                    return;
                  }
                }
              }}
            />
          </div>
          <div className="shrink-0 px-8 pb-3 pt-2">
            <div className="mx-auto w-full max-w-[760px]">
              <QueuedMessagesPanel
                items={queue.items}
                onRemove={(id) => queue.remove(id)}
                onSendNow={(id) => {
                  // Per-item ↑ = cancel current + send THIS item + remove
                  // it from queue. Equivalent to onOverride but text comes
                  // from a specific entry. clearUserCancelled so the cancel
                  // doesn't get tagged as user-stop (we WANT a flush after).
                  const target = queue.items.find((it) => it.id === id);
                  if (!target) return;
                  queue.remove(id);
                  queue.clearUserCancelled();
                  void (async () => {
                    if (isBusy) await cancel();
                    sendOrQueue(target.text);
                  })();
                }}
              />
              <TaskMessageInput
                threadId={activeTaskId}
                modelLocked={viewMessages.length > 0}
                fallbackModel={conversationQuery.data?.model ?? null}
                onSend={(text) => {
                  queue.clearUserCancelled();
                  sendOrQueue(text);
                }}
                onQueue={(text) => {
                  queue.add(text);
                }}
                onOverride={(text) => {
                  queue.clearUserCancelled();
                  void (async () => {
                    if (isBusy) await cancel();
                    sendOrQueue(text);
                  })();
                }}
                onStop={() => {
                  queue.markUserCancelled();
                  void cancel();
                }}
                // Treat HITL-paused as busy too: when the agent is waiting on
                // tool approval, isRunning is false but pendingInterrupts is
                // non-empty. Without this gate the input would show the
                // normal Send arrow even though the agent can't act on a new
                // user message until the approval card is resolved.
                streaming={isBusy}
              />
            </div>
          </div>
        </>
      }
      aside={
        previewOpen ? (
          <PreviewPane file={preview.file!} workingDir={cwd} onClose={closePreview} />
        ) : (
          <TaskRightPanel
            state={state}
            threadId={activeTaskId}
            scheduledTaskId={conversationQuery.data?.scheduledTaskId ?? null}
            scheduledTaskName={conversationQuery.data?.title ?? null}
            workingDir={cwd}
            onOpenFile={(file) => openPreview(touchedFileToPreview(file))}
            tab={rightTab}
            onTabChange={setRightTab}
          />
        )
      }
    />
    <RenameDialog
      open={renameOpen}
      onOpenChange={setRenameOpen}
      conversationId={activeTaskId}
      currentTitle={taskTitle}
    />
    </>
  );
}

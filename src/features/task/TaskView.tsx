import { useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { PreviewPane } from "@/features/task/PreviewPane";
import { useChat } from "@/lib/agui/react/useChat";
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
import { useConversation, useMessages } from "@/lib/data/queries";

function touchedFileToPreview(f: TouchedFile): MockFile {
  const lower = f.relativePath.toLowerCase();
  let type: MockFile["type"] = "generic";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) type = "markdown";
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
  const {
    pendingFirstPrompt,
    setPendingFirstPrompt,
    preview,
    openPreview,
    closePreview,
  } = useAppShell();

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
  const effectiveModel = threadModel ?? defaultModelId ?? undefined;

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

  if (!activeTaskId) return null;
  const previewOpen = preview.open && preview.file;

  return (
    <AppShell
      bareAside={Boolean(previewOpen)}
      main={
        <>
          <TaskHeader
            conversationId={activeTaskId}
            title={conversationQuery.data?.title ?? "…"}
            onMoveToProject={() => {}}
          />
          <div className="flex min-h-0 flex-1 flex-col">
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
              onContinueAfterRestart={() => {
                // Resend the last user message verbatim — gives the model the
                // identical context it had at interrupt time, so it most likely
                // proposes the same tool and the HITL flow replays cleanly.
                // Beats a fuzzy "继续上次未完成的任务" prompt that drifted the
                // model into "现在继续完成精简版的写入" in past sessions.
                for (let i = viewMessages.length - 1; i >= 0; i--) {
                  const m = viewMessages[i]!;
                  if (m.role === "user") {
                    void send(m.content, {
                      permissionMode,
                      model: effectiveModel,
                    });
                    return;
                  }
                }
              }}
            />
          </div>
          <div className="shrink-0 px-8 pb-6 pt-2">
            <div className="mx-auto w-full max-w-[760px]">
              <TaskMessageInput
                threadId={activeTaskId}
                onSend={(text) =>
                  void send(text, { permissionMode, model: effectiveModel })
                }
                onStop={() => void cancel()}
                streaming={isRunning}
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
            workingDir={cwd}
            onOpenFile={(file) => openPreview(touchedFileToPreview(file))}
          />
        )
      }
    />
  );
}

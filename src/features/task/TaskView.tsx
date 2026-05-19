import { useEffect, useRef } from "react";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { PreviewPane } from "@/features/task/PreviewPane";
import { useChat } from "@/lib/agui/react/useChat";
import { useActiveRunForThread } from "@/lib/agui/react/useThreadStatuses";
import { useConversation, useMessages } from "@/lib/data/queries";

export function TaskView() {
  const {
    activeTaskId,
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
    isRunning,
    isThinking,
    error,
    send,
    cancel,
    attachToRun,
    setHistoricalMessages,
  } = useChat({ threadId: activeTaskId ?? "" });

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

  // First-turn handoff from NewTaskView. Defers when an active run is already
  // in flight for this thread (covers the concurrent submit+refresh race).
  const firstPromptFired = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTaskId || !pendingFirstPrompt) return;
    if (pendingFirstPrompt.conversationId !== activeTaskId) return;
    if (activeRun) return;
    if (firstPromptFired.current === activeTaskId) return;
    firstPromptFired.current = activeTaskId;
    const text = pendingFirstPrompt.text;
    setPendingFirstPrompt(null);
    void send(text);
  }, [
    activeTaskId,
    pendingFirstPrompt,
    setPendingFirstPrompt,
    send,
    activeRun,
  ]);

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
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ChatStream
              messages={viewMessages}
              isThinking={isThinking}
              error={error}
              loading={messagesQuery.isLoading}
            />
          </div>
          <div className="shrink-0 px-8 pb-6 pt-2">
            <div className="mx-auto max-w-[760px]">
              <TaskMessageInput
                onSend={(text) => void send(text)}
                onStop={() => void cancel()}
                streaming={isRunning}
              />
            </div>
          </div>
        </>
      }
      aside={
        previewOpen ? (
          <PreviewPane file={preview.file!} onClose={closePreview} />
        ) : (
          <TaskRightPanel onOpenFile={openPreview} />
        )
      }
    />
  );
}

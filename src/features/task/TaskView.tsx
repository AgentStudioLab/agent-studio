import { useEffect, useRef } from "react";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { PreviewPane } from "@/features/task/PreviewPane";
import { sendMessage } from "@/lib/data/conversations";
import { useInvalidateAfterTurn, useMessages } from "@/lib/data/queries";

/**
 * Module-level set tracking conversations whose first-turn stream has been
 * kicked off. Used to prevent React.StrictMode's double-mount in dev from
 * spawning two parallel SSE streams (which the server 409s on the second).
 */
const startedTurns = new Set<string>();

export function TaskView() {
  const {
    activeTaskId,
    streamingByConversation,
    setStreamState,
    pendingFirstPrompt,
    setPendingFirstPrompt,
    preview,
    openPreview,
    closePreview,
    registerLocalAbort,
  } = useAppShell();

  const { data: messages = [], isLoading: loading } = useMessages(activeTaskId);
  const invalidateAfterTurn = useInvalidateAfterTurn();
  const abortRef = useRef<AbortController | null>(null);

  // 触发首轮 stream（仅当 NewTask 跳过来携带 pendingFirstPrompt 时）。
  // 重要：不在 cleanup 里 abort —— StrictMode 双跑会立刻 kill 自己刚起的流，
  // 抛 "signal is aborted without reason"。Stop 行为由 TaskHeader 走 abortLocalStream
  // 显式触发。
  useEffect(() => {
    if (!activeTaskId || !pendingFirstPrompt) return;
    if (pendingFirstPrompt.conversationId !== activeTaskId) return;
    if (startedTurns.has(activeTaskId)) return; // StrictMode reentry guard
    startedTurns.add(activeTaskId);

    const conversationId = pendingFirstPrompt.conversationId;
    const text = pendingFirstPrompt.text;
    setPendingFirstPrompt(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    registerLocalAbort(conversationId, ctrl);
    setStreamState(conversationId, {
      status: "streaming",
      textBuffer: "",
      messageId: null,
    });

    (async () => {
      let buffer = "";
      let messageId: string | null = null;
      try {
        for await (const ev of sendMessage(conversationId, text, ctrl.signal)) {
          if (ev.event === "message-start") {
            messageId = ev.data.messageId;
            setStreamState(conversationId, {
              status: "streaming",
              textBuffer: "",
              messageId,
            });
          } else if (ev.event === "text-delta") {
            buffer += ev.data.text;
            setStreamState(conversationId, {
              status: "streaming",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "message-stop") {
            setStreamState(conversationId, {
              status: "done",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "aborted") {
            setStreamState(conversationId, {
              status: "aborted",
              textBuffer: buffer,
              messageId,
            });
          } else if (ev.event === "error") {
            setStreamState(conversationId, {
              status: "error",
              textBuffer: buffer,
              messageId,
              errorMessage: ev.data.message,
            });
          }
        }
      } catch (e) {
        setStreamState(conversationId, {
          status: "error",
          textBuffer: buffer,
          messageId,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      } finally {
        invalidateAfterTurn(conversationId);
        startedTurns.delete(conversationId);
      }
    })();
  }, [
    activeTaskId,
    pendingFirstPrompt,
    setPendingFirstPrompt,
    setStreamState,
    registerLocalAbort,
    invalidateAfterTurn,
  ]);

  if (!activeTaskId) return null;

  const stream = streamingByConversation.get(activeTaskId) ?? null;
  const previewOpen = preview.open && preview.file;

  return (
    <AppShell
      bareAside={Boolean(previewOpen)}
      main={
        <>
          {/* TODO(task-28): replace title with real conversation title from DB */}
          <TaskHeader
            conversationId={activeTaskId}
            streaming={stream?.status === "streaming"}
            title={activeTaskId}
            onMoveToProject={() => {}}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ChatStream messages={messages} stream={stream} loading={loading} />
          </div>
          <div className="shrink-0 px-8 pb-6 pt-2">
            <div className="mx-auto max-w-[760px]">
              <TaskMessageInput />
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

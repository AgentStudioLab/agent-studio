import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { PreviewPane } from "@/features/task/PreviewPane";
import { getMessages, sendMessage } from "@/lib/data/conversations";
import { workingTreeFiles } from "@/lib/mock/files";
import { loadedSkills } from "@/lib/mock/skills";
import { mcpServers } from "@/lib/mock/mcp-servers";
import type { Message } from "@/lib/data/types";
import type { MockTask } from "@/lib/mock/types";

// Stub task used by TaskRightPanel until that panel is migrated to real data.
// TODO(task-27+): replace with real conversation metadata.
const STUB_TASK: MockTask = {
  id: "",
  title: "",
  plan: [],
  messages: [],
  elapsedSeconds: 0,
  status: "done",
};

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

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // 初次加载历史
  useEffect(() => {
    if (!activeTaskId) return;
    setLoading(true);
    getMessages(activeTaskId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [activeTaskId]);

  // 如果 NewTask 跳过来且有 pendingFirstPrompt，触发首轮 stream
  useEffect(() => {
    if (!activeTaskId || !pendingFirstPrompt) return;
    if (pendingFirstPrompt.conversationId !== activeTaskId) return;
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
        // stream 结束后从 DB 重读 messages（包括服务端写入的 assistant row）
        const fresh = await getMessages(conversationId).catch(() => null);
        if (fresh) setMessages(fresh);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [activeTaskId, pendingFirstPrompt, setPendingFirstPrompt, setStreamState, registerLocalAbort]);

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
          <TaskRightPanel
            task={STUB_TASK}
            files={workingTreeFiles}
            skills={loadedSkills}
            mcpServers={mcpServers}
            onOpenFile={openPreview}
          />
        )
      }
    />
  );
}

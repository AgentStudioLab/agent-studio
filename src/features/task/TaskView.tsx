import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/app/AppShell";
import { RenameDialog } from "@/shared/RenameDialog";
import { useAppShell } from "@/app/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { ChatStream } from "@/features/task/ChatStream";
import { TaskMessageInput } from "@/features/task/TaskMessageInput";
import { TaskTodosTrigger } from "@/features/task/TaskTodosTrigger";
import { TaskRightPanel, type TaskRightTabId } from "@/features/task/TaskRightPanel";
import { QueuedMessagesPanel } from "@/features/task/QueuedMessagesPanel";
import { useMessageQueue } from "@/features/task/MessageQueueContext";
import { PreviewPane } from "@/features/task/PreviewPane";
import { useChat } from "@/lib/agui/react/useChat";
import { useThreadTasks } from "@/lib/agui/react/useThreadTasks";
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
import {
  useArchiveConversationMutation,
  useConversation,
  useMessages,
  useUpdateConversationModelMutation,
} from "@/lib/data/queries";
import {
  getProvider,
  type ProviderModelSelection,
} from "@/lib/data/settings";
import { useAuth } from "@/features/auth/useAuth";
import {
  buildProviderRunOptions,
  type TaskRunOptions,
} from "@/features/task/providerRunOptions";
import { resolveThreadProviderSelection } from "@/features/task/threadModelSelection";

type ProviderSelectionMutationState = {
  selection: ProviderModelSelection;
  status: "pending" | "success" | "failed";
};

function touchedFileToPreview(f: TouchedFile): MockFile {
  const lower = f.relativePath.toLowerCase();
  let type: MockFile["type"] = "generic";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) type = "markdown";
  else if (lower.endsWith(".html") || lower.endsWith(".htm")) type = "html";
  else if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) type = "spreadsheet";
  else if (lower.endsWith(".pptx") || lower.endsWith(".key")) type = "presentation";
  // rich 文档：docx/pdf 在预览面板内由 @js-preview/* 渲染（见 preview/richDoc.ts）
  else if (lower.endsWith(".docx")) type = "document";
  else if (lower.endsWith(".pdf")) type = "pdf";
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
  const [providerSelectionByThread, setProviderSelectionByThread] = useState<
    Record<string, ProviderModelSelection | null>
  >({});
  const providerSelectionChangeSeqRef = useRef<Record<string, number>>({});
  const providerSelectionLocalSeqRef = useRef<Record<string, number>>({});
  const providerSelectionMutationStateRef = useRef<
    Record<string, Record<number, ProviderSelectionMutationState>>
  >({});
  const auth = useAuth();
  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
  });

  // History GET — turn-grouped; reducer reads as initialMessages via
  // setHistorical. Don't default `data` to `[]` here: that allocates a fresh
  // empty array each render, which makes the priming effect re-fire endlessly
  // (setHistorical → state change → re-render → new [] → effect → …).
  const messagesQuery = useMessages(activeTaskId);
  const conversationQuery = useConversation(activeTaskId);
  const updateConversationModel = useUpdateConversationModelMutation();
  const localProviderSelection = activeTaskId
    ? providerSelectionByThread[activeTaskId] ?? null
    : null;
  const effectiveProviderSelection = useMemo(
    () =>
      resolveThreadProviderSelection({
        conversationModel: conversationQuery.data?.model ?? null,
        enabledModels: providerQuery.data?.enabledModels ?? [],
        defaultSelection: providerQuery.data?.defaultSelection ?? null,
        localSelection: localProviderSelection,
      }),
    [
      conversationQuery.data?.model,
      providerQuery.data?.enabledModels,
      providerQuery.data?.defaultSelection,
      localProviderSelection,
    ],
  );
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
    resumeRun,
  } = useChat({ threadId: activeTaskId ?? "" });
  const { tasks } = useThreadTasks(state);
  const officialRunPendingRef = useRef(false);

  const resolveDefaultProviderSelection = useCallback(async () => {
    if (providerQuery.data) {
      return providerQuery.data.defaultSelection ?? null;
    }
    const provider = await getProvider();
    return provider.defaultSelection ?? null;
  }, [providerQuery.data]);

  const buildRunOptions = useCallback(
    async (input: {
      permissionMode?: "ask" | "act-without-asking";
      providerSelection?: ProviderModelSelection | null;
      model?: string | null;
      approvalRules?: string[];
    }): Promise<TaskRunOptions> => {
      return buildProviderRunOptions({
        auth,
        providerSelection: input.providerSelection,
        resolveDefaultProviderSelection,
        permissionMode: input.permissionMode,
        model: input.model,
        approvalRules: input.approvalRules,
        onOfficialRunPending: () => {
          officialRunPendingRef.current = true;
        },
      });
    },
    [auth, resolveDefaultProviderSelection],
  );

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
  // 下发给 sidecar 的「始终允许」规则数组（全局 + 当前 cwd 的并集，CC Tool(pattern)
  // 语法）。sidecar 在 canUseTool 内匹配，命中即放行 —— 匹配已从前端闸口移到服务端。
  const approvalRules = useMemo(() => [...allowedTools], [allowedTools]);
  // Permission mode (per-thread). Read here so every send/first-prompt path
  // converges on a single source — the dropdown writes to the same store the
  // useThreadPermissionMode hook subscribes to.
  const { mode: permissionMode, setMode: setPermissionMode } =
    useThreadPermissionMode(activeTaskId);
  const queue = useMessageQueue(activeTaskId);

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
    // 首轮竞态修复：新会话的 /messages 首拉返回 []。若它在 send() 乐观写入
    // 用户消息之后才 resolve，整体替换 historical 会把用户气泡冲掉 —— 直到 run
    // 结束 onRunFinished 失效该 query、重新拉取到已持久化的真实历史才恢复，
    // 表现为「首轮发送时用户消息不显示、跑完才出现」。run 进行中（activeRunId
    // 非空）server 历史为空必是早于乐观写入的过期快照，跳过即可；run 终态后
    // activeRunId 归 null、重新拉取的非空 data 再正常 prime。getState() 同步读
    // 真值，不进依赖数组：否则 activeRunId 归 null 时会拿着旧 [] 重新触发覆盖。
    if (data.length === 0 && runtime.getState().activeRunId !== null) return;
    setHistoricalMessages(data);
  }, [activeTaskId, messagesQuery.data, setHistoricalMessages, runtime]);

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
    const firstProviderSelection = pendingFirstPrompt.providerSelection ?? null;
    // Normal new-task handoff now relies on the active provider preset.
    // `pendingFirstPrompt.model` remains only for legacy seeded flows such as
    // agent workspaces until those semantics are migrated separately.
    const legacyFirstModel = pendingFirstPrompt.model;
    void (async () => {
      const runOptions = await buildRunOptions({
        permissionMode: firstMode,
        providerSelection: firstProviderSelection,
        model: legacyFirstModel,
        approvalRules,
      });
      setPendingFirstPrompt(null);
      setProviderSelectionByThread((previous) => ({
        ...previous,
        [activeTaskId]: firstProviderSelection,
      }));
      if (pendingFirstPrompt.permissionMode) {
        setPermissionMode(pendingFirstPrompt.permissionMode);
      }
      await send(text, runOptions);
    })().catch((e) => {
      if (e instanceof RunInProgressError) queue.add(text);
    });
  }, [
    activeTaskId,
    pendingFirstPrompt,
    setPendingFirstPrompt,
    permissionMode,
    setPermissionMode,
    send,
    activeRun,
    approvalRules,
    buildRunOptions,
    queue.add,
  ]);

  // 「始终允许」的自动放行已从这里（客户端闸口）移到 sidecar 的 canUseTool：
  // 命中规则的工具调用在服务端直接放行、不再产生 interrupt，所以无需前端
  // resumeRun 闸口。规则经 approvalRules 在 run 启动时下发、经 /resume 的
  // persistRule 在 run 内追加。

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

  // Per-thread message queue lives in MessageQueueContext (app-level) so
  // switching threads doesn't drop queued items — only an app restart does.

  // Send a message, but if the sidecar reports the thread already has a live
  // run (409 → RunInProgressError: a scheduled run, or a send from another
  // window), re-queue the text so it auto-flushes when that run finishes,
  // instead of erroring. Other send failures surface via the runtime's own
  // error state. This is the client half of the backend's one-run-per-thread
  // guard — the composer's busy-gating prevents it in the common case, so this
  // only fires on races / multi-window.
  const handleProviderSelectionChange = useCallback(
    (selection: ProviderModelSelection) => {
      if (!activeTaskId) return;
      const previousSelectionSeq =
        providerSelectionLocalSeqRef.current[activeTaskId] ?? 0;
      const changeSeq =
        (providerSelectionChangeSeqRef.current[activeTaskId] ?? 0) + 1;
      providerSelectionChangeSeqRef.current = {
        ...providerSelectionChangeSeqRef.current,
        [activeTaskId]: changeSeq,
      };
      providerSelectionLocalSeqRef.current = {
        ...providerSelectionLocalSeqRef.current,
        [activeTaskId]: changeSeq,
      };
      providerSelectionMutationStateRef.current = {
        ...providerSelectionMutationStateRef.current,
        [activeTaskId]: {
          ...(providerSelectionMutationStateRef.current[activeTaskId] ?? {}),
          [changeSeq]: { selection, status: "pending" },
        },
      };

      const restoreProviderSelection = (targetSeq: number) => {
        const states =
          providerSelectionMutationStateRef.current[activeTaskId] ?? {};
        const targetState = states[targetSeq];
        if (targetState && targetState.status !== "failed") {
          providerSelectionLocalSeqRef.current = {
            ...providerSelectionLocalSeqRef.current,
            [activeTaskId]: targetSeq,
          };
          setProviderSelectionByThread((current) => ({
            ...current,
            [activeTaskId]: targetState.selection,
          }));
          return;
        }

        // 连续失败时不能回到一个已失败的中间选择；向前找最近一次成功的选择，
        // 找不到就清掉本地覆盖，让 conversation/default 的耐久状态重新生效。
        for (let seq = targetSeq - 1; seq > 0; seq -= 1) {
          const state = states[seq];
          if (state?.status === "success") {
            providerSelectionLocalSeqRef.current = {
              ...providerSelectionLocalSeqRef.current,
              [activeTaskId]: seq,
            };
            setProviderSelectionByThread((current) => ({
              ...current,
              [activeTaskId]: state.selection,
            }));
            return;
          }
        }

        providerSelectionLocalSeqRef.current = {
          ...providerSelectionLocalSeqRef.current,
          [activeTaskId]: 0,
        };
        setProviderSelectionByThread((current) => ({
          ...current,
          [activeTaskId]: null,
        }));
      };

      // 先更新本地选择，让输入区和后续 run 立即使用新模型；PATCH 失败时回滚。
      // 已经启动的 run 不撤销，切换只影响之后的发送/重试。
      setProviderSelectionByThread((previous) => ({
        ...previous,
        [activeTaskId]: selection,
      }));
      void updateConversationModel
        .mutateAsync({ id: activeTaskId, model: selection.modelId })
        .then(() => {
          providerSelectionMutationStateRef.current = {
            ...providerSelectionMutationStateRef.current,
            [activeTaskId]: {
              ...(providerSelectionMutationStateRef.current[activeTaskId] ??
                {}),
              [changeSeq]: { selection, status: "success" },
            },
          };
        })
        .catch(() => {
          providerSelectionMutationStateRef.current = {
            ...providerSelectionMutationStateRef.current,
            [activeTaskId]: {
              ...(providerSelectionMutationStateRef.current[activeTaskId] ?? {}),
              [changeSeq]: { selection, status: "failed" },
            },
          };
          if (providerSelectionChangeSeqRef.current[activeTaskId] !== changeSeq) {
            if (providerSelectionLocalSeqRef.current[activeTaskId] === changeSeq) {
              restoreProviderSelection(changeSeq);
            }
            return;
          }
          restoreProviderSelection(previousSelectionSeq);
        });
    },
    [activeTaskId, updateConversationModel],
  );

  const sendOrQueue = useCallback(
    (text: string) => {
      void (async () => {
        const runOptions = await buildRunOptions({
          permissionMode,
          providerSelection: effectiveProviderSelection,
          approvalRules,
        });
        await send(text, runOptions);
      })().catch((e) => {
        if (e instanceof RunInProgressError) queue.add(text);
      });
    },
    [
      send,
      permissionMode,
      effectiveProviderSelection,
      queue.add,
      approvalRules,
      buildRunOptions,
    ],
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

  useEffect(() => {
    if (!officialRunPendingRef.current) return;
    if (isRunning || activeRun !== null) return;

    const shouldRefreshCredits =
      !state.error || state.errorCode === "INSUFFICIENT_CREDITS";
    officialRunPendingRef.current = false;
    if (!shouldRefreshCredits) return;

    void auth.refreshUser().catch(() => {});
  }, [activeRun, auth, isRunning, state.error, state.errorCode]);

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
            agentWorkspaceId={conversationQuery.data?.agentWorkspaceId ?? null}
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
                void (async () => {
                  const runOptions = await buildRunOptions({
                    permissionMode,
                    providerSelection: effectiveProviderSelection,
                    approvalRules,
                  });
                  await regenerate(fromMessageId, runOptions);
                })().catch(() => {
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
              <TaskTodosTrigger tasks={tasks} />
              <TaskMessageInput
                threadId={activeTaskId}
                providerSelection={effectiveProviderSelection}
                onProviderSelectionChange={handleProviderSelectionChange}
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
          <PreviewPane
            file={preview.file!}
            workingDir={preview.workingDir ?? cwd}
            onClose={closePreview}
          />
        ) : (
          <TaskRightPanel
            state={state}
            threadId={activeTaskId}
            agentWorkspaceId={conversationQuery.data?.agentWorkspaceId ?? null}
            scheduledTaskId={conversationQuery.data?.scheduledTaskId ?? null}
            scheduledTaskName={conversationQuery.data?.title ?? null}
            workingDir={cwd}
            onOpenFile={(file) => openPreview(touchedFileToPreview(file))}
            onOpenAgentFile={(file, wd) => openPreview(file, wd)}
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

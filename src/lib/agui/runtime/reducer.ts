// 纯函数 reducer：(state, event) → state。
// 这是项目对 AG-UI 协议的"理解"集中地。所有事件 case 都在这里，
// 任何协议升级、字段调整都改这一份代码。
//
// 设计要点：
//   - 不做 IO（不 fetch、不 setTimeout）
//   - 不读 DOM、不依赖 Vue/React
//   - 同样输入永远返回同样输出（除了内部用的 nanoid，下面有说明）
//
// nanoid 是少数允许的"非纯"调用 —— 服务端没给 messageId 时我们补一个。
// 这不影响测试，因为消费者只关心 id 存在，不关心具体值。

import { nanoid } from "nanoid";
import type {
  AGUIEventLike,
  AgentTask,
  ChatState,
  MessageBlock,
  MessageView,
  NoticeReason,
  PendingInterrupt,
  SideEffectFile,
} from "./types";
import { sweepPendingToolCalls } from "./sweep";

// ============ 工具：定位 / 创建 / 替换 assistant 回合 ============

function currentAssistantTurn(
  live: MessageView[],
): Extract<MessageView, { role: "assistant" }> | null {
  const last = live[live.length - 1];
  return last && last.role === "assistant" ? last : null;
}

function ensureAssistantTurn(
  live: MessageView[],
  seedId?: string,
): {
  turn: Extract<MessageView, { role: "assistant" }>;
  next: MessageView[];
  created: boolean;
} {
  const cur = currentAssistantTurn(live);
  if (cur) return { turn: cur, next: live, created: false };
  const turn: Extract<MessageView, { role: "assistant" }> = {
    id: seedId ?? `msg_${nanoid(10)}`,
    role: "assistant",
    blocks: [],
  };
  return { turn, next: [...live, turn], created: true };
}

function replaceLastTurn(
  live: MessageView[],
  next: Extract<MessageView, { role: "assistant" }>,
): MessageView[] {
  const out = [...live];
  out[out.length - 1] = next;
  return out;
}

const NOTICE_CONTENT: Record<NoticeReason, string> = {
  user: "已被用户中止",
  process_restart: "上次等待用户时应用被关闭，agent 已停止",
};

function makeNoticeBlock(reason: NoticeReason): MessageBlock {
  return {
    kind: "notice",
    id: `notice_${nanoid(8)}`,
    level: "interrupted",
    content: NOTICE_CONTENT[reason],
    reason,
  };
}

/**
 * Append an interrupted notice to the current assistant turn — or push a new
 * assistant turn carrying just that notice when none is open. Idempotent for
 * the same reason: if the last block is already an `interrupted` notice with
 * the same `reason`, the input array is returned unchanged. Different reasons
 * stack (rare but defensive — e.g., user denied during a process_restart card).
 */
export function appendInterruptedNotice(
  live: MessageView[],
  reason: NoticeReason = "user",
): MessageView[] {
  const last = live[live.length - 1];
  if (last && last.role === "assistant") {
    const lastBlock = last.blocks[last.blocks.length - 1];
    if (
      lastBlock?.kind === "notice" &&
      lastBlock.level === "interrupted" &&
      (lastBlock.reason ?? "user") === reason
    ) {
      return live;
    }
    const out = [...live];
    out[out.length - 1] = { ...last, blocks: [...last.blocks, makeNoticeBlock(reason)] };
    return out;
  }
  return [
    ...live,
    {
      id: `msg_${nanoid(10)}`,
      role: "assistant",
      blocks: [makeNoticeBlock(reason)],
    },
  ];
}

// ============ Reducer 主体 ============

/**
 * 工具调用 args 流式解析的累计 buffer。
 * 这是 reducer 的内部隐藏状态 —— 跟 ChatState 同生命周期但不暴露给 UI。
 * 必须由 runtime 在每次新 run 开始时清空。
 */
export type ArgsBuffer = Map<string, string>;

function isAgentTaskStatus(v: unknown): v is AgentTask["status"] {
  return v === "pending" || v === "in_progress" || v === "completed";
}

function parseAgentTasks(value: unknown): AgentTask[] | null {
  if (!value || typeof value !== "object") return null;
  const tasks = (value as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return null;

  return tasks.filter((task): task is AgentTask => {
    if (!task || typeof task !== "object") return false;
    const raw = task as Record<string, unknown>;
    return (
      typeof raw.id === "string" &&
      typeof raw.subject === "string" &&
      typeof raw.description === "string" &&
      isAgentTaskStatus(raw.status) &&
      typeof raw.updatedAt === "number" &&
      (raw.activeForm === undefined || typeof raw.activeForm === "string")
    );
  });
}

/**
 * 把单个 event 应用到 state，返回新 state。
 * argsBuffer 是 mutable 的（性能考虑）—— 同一 run 内会持续累积。
 */
export function applyEvent(
  state: ChatState,
  event: AGUIEventLike,
  argsBuffer: ArgsBuffer,
  cursor?: string,
): ChatState {
  let next = state;
  if (cursor) next = { ...next, lastCursor: cursor };

  switch (event.type) {
    case "TEXT_MESSAGE_START":
      next = handleTextStart(next, event);
      break;
    case "TEXT_MESSAGE_CONTENT":
      next = handleTextContent(next, event);
      break;
    case "TOOL_CALL_START":
      next = handleToolCallStart(next, event);
      break;
    case "TOOL_CALL_ARGS":
      next = handleToolCallArgs(next, event, argsBuffer);
      break;
    case "TOOL_CALL_RESULT":
      next = handleToolCallResult(next, event);
      break;
    case "REASONING_START":
      next = handleReasoningStart(next, event);
      break;
    case "REASONING_MESSAGE_CONTENT":
      next = handleReasoningContent(next, event);
      break;
    case "REASONING_END":
      next = handleReasoningEnd(next, event);
      break;
    case "RUN_STARTED":
      next = { ...next, runStartedAt: Date.now() };
      break;
    case "RUN_FINISHED":
      next = handleRunFinished(next, event);
      break;
    case "RUN_ERROR": {
      const code = (event as { code?: string }).code;
      const message = (event as { message?: string }).message;
      // Clear pendingInterrupts: the run is dead, server's HITL deferred Map
      // entries are either resolved/rejected or wiped (process restart). A
      // stale HITL card pointing at this run would POST /resume → 409.
      // 和服务端等待用户状态的 process_restart 归并保持对称。
      //
      // CANCELLED is a user action (stop button OR HITL deny), not a fault:
      //   - suppress the error banner (no "错误：xxx" text)
      //   - append a "已被用户中止" notice to the current assistant turn
      //     so the live view matches the persisted view that the user sees
      //     after switching threads + coming back (system-note row).
      const isCancelled = code === "CANCELLED";
      const reasonField = (event as { reason?: unknown }).reason;
      const noticeReason: NoticeReason =
        reasonField === "process_restart" ? "process_restart" : "user";
      let live = sweepPendingToolCalls(next.liveMessages);
      if (isCancelled) {
        live = appendInterruptedNotice(live, noticeReason);
      }
      next = {
        ...next,
        liveMessages: live,
        error: isCancelled ? null : message ?? next.error ?? null,
        errorCode: typeof code === "string" ? (code as never) : next.errorCode,
        pendingInterrupts: [],
        runStartedAt: null,
      };
      break;
    }
    case "CUSTOM": {
      const name = (event as { name?: string }).name;
      if (name === "agent.retry") {
        const value = (event as { value?: Record<string, unknown> }).value ?? {};
        next = {
          ...next,
          retry: {
            attempt: Number(value.attempt ?? 0),
            maxRetries: Number(value.maxRetries ?? 0),
            retryDelayMs: Number(value.retryDelayMs ?? 0),
            errorStatus: (value.errorStatus as number | null) ?? null,
            error: String(value.error ?? ""),
            ts: Date.now(),
          },
        };
      } else if (name === "agent.tasks") {
        const tasks = parseAgentTasks((event as { value?: unknown }).value);
        if (tasks) {
          next = {
            ...next,
            tasks,
            hasTaskSnapshot: true,
          };
        }
      } else if (name === "file.side_effects") {
        const value = (event as { value?: Record<string, unknown> }).value ?? {};
        const toolCallId = value.toolCallId;
        const files = value.files;
        if (typeof toolCallId === "string" && Array.isArray(files)) {
          // Validate each entry — bridge may emit malformed data on a future bug.
          const valid: SideEffectFile[] = files.filter(
            (f): f is SideEffectFile =>
              typeof f === "object" &&
              f !== null &&
              typeof (f as Record<string, unknown>).path === "string" &&
              ((f as Record<string, unknown>).kind === "created" ||
                (f as Record<string, unknown>).kind === "modified"),
          );
          next = updateToolCall(next, toolCallId, (tc) => ({
            ...tc,
            sideEffects: valid,
          }));
        }
      }
      break;
    }
    // REASONING_MESSAGE_START / REASONING_MESSAGE_END / STEP_STARTED /
    // STEP_FINISHED 是协议层的薄记，不影响客户端状态。
    default:
      break;
  }

  return next;
}

// ============ 各事件 case 处理函数 ============

function handleTextStart(state: ChatState, ev: AGUIEventLike): ChatState {
  const messageId = ev.messageId as string;
  const { turn, next: nextLive } = ensureAssistantTurn(state.liveMessages, messageId);
  // 幂等：相同 messageId 重入不重复加块（服务端可能 retry START）
  if (turn.blocks.some((b) => b.kind === "text" && b.id === messageId)) {
    return state.liveMessages === nextLive ? state : { ...state, liveMessages: nextLive };
  }
  const updatedTurn = {
    ...turn,
    blocks: [...turn.blocks, { kind: "text" as const, id: messageId, content: "" }],
  };
  return { ...state, liveMessages: replaceLastTurn(nextLive, updatedTurn) };
}

function handleTextContent(state: ChatState, ev: AGUIEventLike): ChatState {
  const messageId = ev.messageId as string;
  const delta = (ev.delta as string) ?? "";
  if (!delta) return state;
  const turn = currentAssistantTurn(state.liveMessages);
  if (!turn) return state;
  const newBlocks = turn.blocks.map((b) =>
    b.kind === "text" && b.id === messageId
      ? { ...b, content: b.content + delta }
      : b,
  );
  return {
    ...state,
    liveMessages: replaceLastTurn(state.liveMessages, { ...turn, blocks: newBlocks }),
  };
}

function handleToolCallStart(state: ChatState, ev: AGUIEventLike): ChatState {
  const parentMsgId = (ev.parentMessageId as string) ?? `msg_${nanoid(10)}`;
  const toolCallId = ev.toolCallId as string;
  const toolName = ev.toolCallName as string;
  const { turn, next: nextLive } = ensureAssistantTurn(state.liveMessages, parentMsgId);
  if (turn.blocks.some((b) => b.kind === "tool_call" && b.toolCall.id === toolCallId)) {
    return state.liveMessages === nextLive ? state : { ...state, liveMessages: nextLive };
  }
  const newBlock: MessageBlock = {
    kind: "tool_call",
    toolCall: { id: toolCallId, toolName, args: {}, result: null, status: "pending" },
  };
  return {
    ...state,
    liveMessages: replaceLastTurn(nextLive, { ...turn, blocks: [...turn.blocks, newBlock] }),
  };
}

function handleToolCallArgs(
  state: ChatState,
  ev: AGUIEventLike,
  argsBuffer: ArgsBuffer,
): ChatState {
  const id = ev.toolCallId as string;
  const buf = (argsBuffer.get(id) ?? "") + ((ev.delta as string) ?? "");
  argsBuffer.set(id, buf);
  let parsed: unknown = buf;
  try {
    parsed = JSON.parse(buf);
  } catch {
    /* 不完整 JSON，保留原始 buffer */
  }
  return updateToolCall(state, id, (tc) => ({ ...tc, args: parsed }));
}

function handleToolCallResult(state: ChatState, ev: AGUIEventLike): ChatState {
  const id = ev.toolCallId as string;
  let result: unknown;
  try {
    result = JSON.parse(ev.content as string);
  } catch {
    result = ev.content;
  }
  return updateToolCall(state, id, (tc) => ({ ...tc, result, status: "success" }));
}

function handleReasoningStart(state: ChatState, ev: AGUIEventLike): ChatState {
  const reasoningId = ev.messageId as string;
  const parent = (ev.parentMessageId as string | undefined) ?? reasoningId;
  const { turn, next: nextLive } = ensureAssistantTurn(state.liveMessages, parent);
  if (turn.blocks.some((b) => b.kind === "reasoning" && b.id === reasoningId)) {
    return state.liveMessages === nextLive ? state : { ...state, liveMessages: nextLive };
  }
  const newBlock: MessageBlock = {
    kind: "reasoning",
    id: reasoningId,
    content: "",
    streaming: true,
  };
  return {
    ...state,
    liveMessages: replaceLastTurn(nextLive, { ...turn, blocks: [...turn.blocks, newBlock] }),
  };
}

function handleReasoningContent(state: ChatState, ev: AGUIEventLike): ChatState {
  const reasoningId = ev.messageId as string;
  const delta = (ev.delta as string) ?? "";
  if (!delta) return state;
  return updateReasoningBlock(state, reasoningId, (b) => ({
    ...b,
    content: b.content + delta,
  }));
}

function handleReasoningEnd(state: ChatState, ev: AGUIEventLike): ChatState {
  const reasoningId = ev.messageId as string;
  return updateReasoningBlock(state, reasoningId, (b) => ({ ...b, streaming: false }));
}

function handleRunFinished(state: ChatState, ev: AGUIEventLike): ChatState {
  // HITL 中断：把 pendingInterrupts 填上，pending 工具调用保持原样
  // —— spinner 同时承担“这个调用正在等待用户处理”的视觉信号。
  if (ev.outcome === "interrupt" && Array.isArray(ev.interrupts)) {
    return {
      ...state,
      pendingInterrupts: ev.interrupts as PendingInterrupt[],
      retry: undefined,
    };
  }
  // 正常结束：清扫 pending 工具调用，清除 retry 状态，并清空 pendingInterrupts
  // —— 跨会话 SSE 重放时，会先吃到 RUN_FINISHED(interrupt) 把卡片填上，
  // 紧接着如果再吃到一个 RUN_FINISHED(success) 或后续的终止事件，必须把
  // 残留的 interrupt 清掉；否则用户点 Allow 会向已经清空 deferred 的 server
  // 发 resume，得到 409。
  return {
    ...state,
    liveMessages: sweepPendingToolCalls(state.liveMessages),
    retry: undefined,
    pendingInterrupts: [],
    runStartedAt: null,
  };
}

// ============ 通用更新工具 ============

function updateToolCall(
  state: ChatState,
  toolCallId: string,
  patch: (tc: import("./types.js").ToolCallView) => import("./types.js").ToolCallView,
): ChatState {
  const newLive = state.liveMessages.map((m) => {
    if (m.role !== "assistant") return m;
    const idx = m.blocks.findIndex(
      (b) => b.kind === "tool_call" && b.toolCall.id === toolCallId,
    );
    if (idx < 0) return m;
    const block = m.blocks[idx]!;
    if (block.kind !== "tool_call") return m;
    const newBlocks = [...m.blocks];
    newBlocks[idx] = { kind: "tool_call", toolCall: patch(block.toolCall) };
    return { ...m, blocks: newBlocks };
  });
  return { ...state, liveMessages: newLive };
}

function updateReasoningBlock(
  state: ChatState,
  reasoningId: string,
  patch: (b: Extract<MessageBlock, { kind: "reasoning" }>) => MessageBlock,
): ChatState {
  const newLive = state.liveMessages.map((m) => {
    if (m.role !== "assistant") return m;
    const idx = m.blocks.findIndex(
      (b) => b.kind === "reasoning" && b.id === reasoningId,
    );
    if (idx < 0) return m;
    const block = m.blocks[idx]!;
    if (block.kind !== "reasoning") return m;
    const newBlocks = [...m.blocks];
    newBlocks[idx] = patch(block);
    return { ...m, blocks: newBlocks };
  });
  return { ...state, liveMessages: newLive };
}

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
  ChatState,
  MessageBlock,
  MessageView,
  PendingInterrupt,
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

// ============ Reducer 主体 ============

/**
 * 工具调用 args 流式解析的累计 buffer。
 * 这是 reducer 的内部隐藏状态 —— 跟 ChatState 同生命周期但不暴露给 UI。
 * 必须由 runtime 在每次新 run 开始时清空。
 */
export type ArgsBuffer = Map<string, string>;

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
    case "RUN_FINISHED":
      next = handleRunFinished(next, event);
      break;
    case "RUN_ERROR": {
      const code = (event as { code?: string }).code;
      const message = (event as { message?: string }).message;
      next = {
        ...next,
        liveMessages: sweepPendingToolCalls(next.liveMessages),
        error: message ?? next.error ?? null,
        errorCode: typeof code === "string" ? (code as never) : next.errorCode,
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
  // —— spinner 同时承担"这个调用正在等审批"的视觉信号。
  if (ev.outcome === "interrupt" && Array.isArray(ev.interrupts)) {
    return {
      ...state,
      pendingInterrupts: ev.interrupts as PendingInterrupt[],
      retry: undefined,
    };
  }
  // 正常结束：清扫 pending 工具调用，清除 retry 状态
  return { ...state, liveMessages: sweepPendingToolCalls(state.liveMessages), retry: undefined };
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

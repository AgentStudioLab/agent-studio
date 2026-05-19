// runtime 组装层 —— 把 reducer + SSE + thinking timer + HTTP 命令拼起来。
// 对外暴露一个 ChatRuntime 接口，业务侧（Vue/React 等）拿到这个接口就能：
//   - 订阅 state 变化
//   - 派发命令（send/cancel/resume/attachToRun/restoreAwaiting）
//   - 销毁时统一清理
//
// 这一层依然不依赖任何框架，但允许做副作用（HTTP / setTimeout / 事件订阅）。

import { nanoid } from "nanoid";
import {
  createInitialState,
  type AGUIEventLike,
  type ChatState,
  type MessageBlock,
  type MessageView,
  type PendingInterrupt,
} from "./types";
import { applyEvent, type ArgsBuffer } from "./reducer";
import { sweepPendingToolCalls, buildViewMessages } from "./sweep";
import { ThinkingTimer } from "./thinking";
import { createResumableRun } from "./sse";
import { AGUIHttpClient, type AGUIApiOptions } from "./api";
import { buildResumeRequest } from "./protocol";

// ============ 公开 API ============

export interface ChatRuntimeOptions extends AGUIApiOptions {
  /** 当前会话 id，runtime 内部记录用，所有 send 默认带上它。 */
  threadId: string;
  /** 初始历史消息（来自 /threads/:id/messages）。可后续通过 setHistorical 重置。 */
  initialMessages?: unknown[];
  /** state-change 之外的事件钩子，给业务做埋点 / 失效缓存等。 */
  onRunFinished?: () => void;
  onRunError?: (msg: string) => void;
}

export interface ChatRuntime {
  // —— 状态 ——
  getState(): ChatState;
  subscribe(listener: (state: ChatState) => void): () => void;

  // —— 命令 ——
  send(text: string): Promise<void>;
  cancel(): Promise<void>;
  resume(payload: unknown): Promise<void>;
  attachToRun(runId: string, opts?: { cursor?: string; preserveLive?: boolean }): void;
  restoreAwaiting(runId: string, interrupts: PendingInterrupt[], cursor: string): void;

  // —— 状态注入 ——
  setHistoricalMessages(turns: unknown[]): void;
  /** 清空 live + 错误，用于切换 thread。historicalMessages 会被新的覆盖。 */
  reset(initialMessages?: unknown[]): void;

  // —— 释放 ——
  destroy(): void;
}

// ============ 实现 ============

/**
 * 创建一个 ChatRuntime 实例。每个 useChat / useChat-equivalent 拥有一个。
 */
export function createChatRuntime(opts: ChatRuntimeOptions): ChatRuntime {
  const http = new AGUIHttpClient({
    apiBase: opts.apiBase,
    fetchImpl: opts.fetchImpl,
  });

  // —— 状态与订阅 ——
  let state: ChatState = {
    ...createInitialState(),
    historicalMessages: buildViewMessages(opts.initialMessages ?? []),
  };
  const listeners = new Set<(s: ChatState) => void>();

  function setState(patch: Partial<ChatState> | ((s: ChatState) => ChatState)): void {
    state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
    listeners.forEach((l) => l(state));
  }

  // —— reducer 内部的 args buffer，跟随 run 生命周期 ——
  const argsBuffer: ArgsBuffer = new Map();

  // —— SSE 句柄与 thinking 定时器 ——
  let activeHandle: { abort: () => void } | null = null;
  const thinking = new ThinkingTimer({
    onChange: (v) => setState({ isThinking: v }),
  });

  // —— 内部：处理事件 ——
  function onEvent(ev: AGUIEventLike, cursor: string): void {
    thinking.ping();
    setState((s) => applyEvent(s, ev, argsBuffer, cursor));
  }

  // —— 内部：SSE 关闭回调 ——
  function onClose(reason: "finished" | "error" | "cursor_expired" | "aborted"): void {
    activeHandle = null;
    thinking.setRunning(false);
    // argsBuffer 必须在任何终态都清空：error / cursor_expired / aborted 时若不清，
    // 残留的部分 JSON 会跟下一个 run 的 TOOL_CALL_ARGS 拼起来，破坏解析。
    // 唯一例外是 finished 但 pendingInterrupts 非空（HITL 暂停）—— 那个 run
    // 还会 resume 续写，需要保留 buffer。
    setState((s) => {
      let next = { ...s, isRunning: false };
      if (reason === "finished") {
        // 没等待中的 interrupt 才把 live 归档进 historical
        if (s.pendingInterrupts.length === 0) {
          next = {
            ...next,
            activeRunId: null,
            historicalMessages: [...s.historicalMessages, ...s.liveMessages],
            liveMessages: [],
          };
          argsBuffer.clear();
        }
      } else {
        next.activeRunId = null;
        argsBuffer.clear();
      }
      if (reason === "error") next.error = "stream error";
      if (reason === "cursor_expired") next.error = "游标已过期，请刷新";
      return next;
    });
    if (reason === "finished") opts.onRunFinished?.();
    if (reason === "error") opts.onRunError?.("stream error");
  }

  // —— 命令实现 ——

  function attachToRun(
    runId: string,
    o?: { cursor?: string; preserveLive?: boolean },
  ): void {
    if (state.activeRunId === runId && activeHandle) return;
    if (activeHandle) activeHandle.abort();

    setState((s) => {
      const next: ChatState = { ...s, activeRunId: runId, isRunning: true };
      if (!o?.preserveLive) {
        next.liveMessages = [];
        argsBuffer.clear();
      }
      return next;
    });
    thinking.setRunning(true);

    activeHandle = createResumableRun({
      runId,
      resumeUrl: http.eventsUrl(runId),
      initialCursor: o?.cursor,
      onEvent,
      onClose,
      // CRITICAL: forward fetchImpl from runtime opts. Without it, sse.ts
      // defaults to global fetch which hits the page origin (e.g. Vite at
      // :1420 returning index.html) instead of the sidecar. fetchImpl is
      // also how Authorization: Bearer gets injected for cross-origin auth.
      fetchImpl: opts.fetchImpl,
    });
  }

  async function send(text: string): Promise<void> {
    if (state.isRunning) return;
    if (state.pendingInterrupts.some((it) => it.reason === "tool_approval")) return;

    // 先把 live 归档（如果有），再追加用户消息进 historical
    setState((s) => {
      const merged: MessageView[] =
        s.liveMessages.length > 0
          ? [...s.historicalMessages, ...s.liveMessages]
          : s.historicalMessages;
      const userMsg: MessageView = {
        id: `msg_${nanoid(10)}`,
        role: "user",
        content: text,
      };
      return {
        ...s,
        error: null,
        isRunning: true,
        historicalMessages: [...merged, userMsg],
        liveMessages: [],
      };
    });

    const runId = `run_${nanoid(10)}`;
    setState({ activeRunId: runId });

    try {
      await http.postRun({
        threadId: opts.threadId,
        runId,
        message: { role: "user", content: text },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ error: msg, isRunning: false, activeRunId: null });
      thinking.clear();
      opts.onRunError?.(msg);
      return;
    }

    attachToRun(runId);
  }

  async function cancel(): Promise<void> {
    if (!state.activeRunId) return;
    await http.cancelRun(state.activeRunId);
    // 乐观 UI：在 live 尾部插一条 notice，无需等 SSE 关闭。
    // 刷新页面后服务端持久化的 system note 会通过 turn transform 重生
    // 等价的 notice —— 不会重复因为 live 只 merge 一次。
    setState((s) => {
      const live = [...s.liveMessages];
      const last = live[live.length - 1];
      const noticeBlock: MessageBlock = {
        kind: "notice",
        id: `notice_${nanoid(8)}`,
        level: "interrupted",
        content: "已被用户中止",
      };
      if (last && last.role === "assistant") {
        live[live.length - 1] = { ...last, blocks: [...last.blocks, noticeBlock] };
      } else {
        live.push({
          id: `msg_${nanoid(10)}`,
          role: "assistant",
          blocks: [noticeBlock],
        });
      }
      return { ...s, liveMessages: live };
    });
  }

  async function resume(payload: unknown): Promise<void> {
    const runId = state.activeRunId;
    if (!runId || state.pendingInterrupts.length === 0) return;

    // LangGraph 的并行 interrupt batch resume 在 LangChain JS 1.3.x 没暴露完整语义
    // —— 多个 pending interrupt 时只 forward 第一个。此前是静默吞掉，这里加一个
    // 警告让消费方至少能感知到。详见 CLAUDE.md "多 interrupt 批处理是半残的"。
    if (state.pendingInterrupts.length > 1) {
      console.warn(
        `[agui-vue] resume() forwards only the first of ${state.pendingInterrupts.length} pending interrupts; ` +
          `LangGraph batch resume is not supported.`,
      );
    }

    const interruptId = state.pendingInterrupts[0]!.id;
    const cursor = state.lastCursor ?? undefined;

    const { request, needsSweep } = buildResumeRequest(payload, interruptId);

    // reject 决定下，预先清扫 live 里的 pending 工具调用
    // —— 因为 LangChain HITL middleware 不会发 on_tool_end。
    setState((s) => ({
      ...s,
      pendingInterrupts: [],
      liveMessages: needsSweep ? sweepPendingToolCalls(s.liveMessages) : s.liveMessages,
    }));

    try {
      await http.resumeRun(runId, request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ error: msg });
      opts.onRunError?.(msg);
      return;
    }

    setState({ isRunning: true });
    attachToRun(runId, { cursor, preserveLive: true });
  }

  function restoreAwaiting(
    runId: string,
    interrupts: PendingInterrupt[],
    cursor: string,
  ): void {
    setState({
      activeRunId: runId,
      pendingInterrupts: interrupts,
      lastCursor: cursor,
    });
  }

  function setHistoricalMessages(turns: unknown[]): void {
    setState({ historicalMessages: buildViewMessages(turns) });
  }

  function reset(initialMessages?: unknown[]): void {
    if (activeHandle) {
      activeHandle.abort();
      activeHandle = null;
    }
    thinking.clear();
    argsBuffer.clear();
    setState({
      ...createInitialState(),
      historicalMessages: buildViewMessages(initialMessages ?? []),
    });
  }

  function destroy(): void {
    if (activeHandle) {
      activeHandle.abort();
      activeHandle = null;
    }
    thinking.destroy();
    listeners.clear();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send,
    cancel,
    resume,
    attachToRun,
    restoreAwaiting,
    setHistoricalMessages,
    reset,
    destroy,
  };
}

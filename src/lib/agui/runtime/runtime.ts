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
  type MessageView,
  type PendingInterrupt,
} from "./types";
import { applyEvent, appendInterruptedNotice, type ArgsBuffer } from "./reducer";
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
  send(
    text: string,
    opts?: {
      permissionMode?: "ask" | "act-without-asking";
      model?: string;
    },
  ): Promise<void>;
  /**
   * 重新生成：丢弃 fromMessageId（某条 user 消息）及其后所有轮次，回滚该轮
   * 通过 Write/Edit/NotebookEdit 产生的文件改动，用同一句 prompt 重跑。
   * 乐观地把 historical 截断到该 user 消息（含），新回答流式接到其下。
   */
  regenerate(
    fromMessageId: string,
    opts?: {
      permissionMode?: "ask" | "act-without-asking";
      model?: string;
    },
  ): Promise<void>;
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

  async function send(
    text: string,
    sendOpts?: {
      permissionMode?: "ask" | "act-without-asking";
      model?: string;
    },
  ): Promise<void> {
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
        ...(sendOpts?.permissionMode
          ? { permissionMode: sendOpts.permissionMode }
          : {}),
        ...(sendOpts?.model ? { model: sendOpts.model } : {}),
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

  async function regenerate(
    fromMessageId: string,
    regenOpts?: {
      permissionMode?: "ask" | "act-without-asking";
      model?: string;
    },
  ): Promise<void> {
    if (state.isRunning) return;
    if (state.pendingInterrupts.some((it) => it.reason === "tool_approval")) return;

    // 乐观截断：保留到目标 user 消息（含）为止，丢弃旧回答 + 其后所有轮次。
    // 找不到（不在 historical，例如还在 live）就放弃，避免误删。
    const idx = state.historicalMessages.findIndex((m) => m.id === fromMessageId);
    if (idx < 0) return;

    setState((s) => ({
      ...s,
      error: null,
      isRunning: true,
      historicalMessages: s.historicalMessages.slice(0, idx + 1),
      liveMessages: [],
    }));

    const runId = `run_${nanoid(10)}`;
    setState({ activeRunId: runId });

    try {
      await http.postRegenerate({
        threadId: opts.threadId,
        fromMessageId,
        runId,
        ...(regenOpts?.permissionMode
          ? { permissionMode: regenOpts.permissionMode }
          : {}),
        ...(regenOpts?.model ? { model: regenOpts.model } : {}),
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
    // 乐观 UI：立刻插 notice，避免等 SSE 终态事件回来的延迟。helper 幂等，
    // 后续 RUN_ERROR(CANCELLED) 走 reducer 同一路径不会重复加。
    setState((s) => ({ ...s, liveMessages: appendInterruptedNotice(s.liveMessages) }));
  }

  async function resume(payload: unknown): Promise<void> {
    // Snapshot the state we depend on at call entry. Without this, an await
    // here can race with another setState (e.g., a stray RUN_FINISHED replay
    // populating new interrupts) and we'd POST against an inconsistent
    // {runId, interruptId} pair — symptom: spurious 409 on a fresh run.
    const runId = state.activeRunId;
    const pending = state.pendingInterrupts;
    const cursor = state.lastCursor ?? undefined;
    if (!runId || pending.length === 0) return;

    if (pending.length > 1) {
      console.warn(
        `[agui-vue] resume() forwards only the first of ${pending.length} pending interrupts; ` +
          `LangGraph batch resume is not supported.`,
      );
    }

    const interruptId = pending[0]!.id;
    const { request, needsSweep, isDeny } = buildResumeRequest(payload, interruptId);

    // Deny 路径：(1) 预清扫 pending 工具调用（spinner 不能继续转），
    // (2) 立刻插"已被用户中止" notice —— 用户一点拒绝就要看到反馈，
    // 不能等 server abort 信号经过 SDK→bridge→SSE 一圈再到 reducer。
    // 双触发保护：reducer 的 RUN_ERROR(CANCELLED) 也调同一个幂等 helper。
    setState((s) => {
      let live = s.liveMessages;
      if (needsSweep) live = sweepPendingToolCalls(live);
      if (isDeny) live = appendInterruptedNotice(live);
      return { ...s, pendingInterrupts: [], liveMessages: live };
    });

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
    regenerate,
    cancel,
    resume,
    attachToRun,
    restoreAwaiting,
    setHistoricalMessages,
    reset,
    destroy,
  };
}

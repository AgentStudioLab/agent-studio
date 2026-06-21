// 续连式 SSE 客户端 —— AG-UI 协议在浏览器端的网络层。
// 关键能力：
//   1. SSE 帧解析（id / event / data 三字段）
//   2. cursor 单调递增，断线重连时带 ?after=N 续接
//   3. 终态事件（RUN_FINISHED / RUN_ERROR）后由调用方 abort fetch
//      —— 服务端不主动关连接，详见 docs/.../sse-bilateral-close.md
//   4. 退避重连：网络错误 / 空连接（receivedAny=false）走指数退避

import type { AGUIEventLike } from "./types";

export type ResumableCloseReason = "finished" | "error" | "cursor_expired" | "aborted";

/**
 * attempt 退避计数的上限。`500 * 2 ** 30 ≈ 5e11ms`，且 `Math.min(30_000, …)` 早就把
 * 延迟限到 30s —— 这里只是防止 attempt 这个数字本身在长时间 awaiting_user
 * 等场景下无界累加（理论上能涨到 Number.MAX_SAFE_INTEGER）。
 */
const MAX_RETRY_ATTEMPT = 30;

export interface ResumableRunOptions {
  runId: string;
  resumeUrl: string;
  /**
   * 续接的起始游标。
   * - 不传：服务端从 0 全量回放，让 reducer 从头重建 UI 状态（用于
   *   内存态丢失场景：刷新、切 thread）
   * - 传：服务端只回放 cursor 之后的事件
   * 内部游标随事件到达推进，所以 SSE 中途断开也能续连。
   */
  initialCursor?: string;
  onEvent: (event: AGUIEventLike, cursor: string) => void;
  onClose: (reason: ResumableCloseReason) => void;
  fetchImpl?: typeof fetch;
  retryDelayMs?: (attempt: number) => number;
}

const TERMINAL = new Set(["RUN_FINISHED", "RUN_ERROR"]);

function parseFrame(buf: string): { id?: string; event?: string; data?: string } {
  const out: { id?: string; event?: string; data?: string } = {};
  let data = "";
  for (const line of buf.split("\n")) {
    if (line.startsWith("id:")) out.id = line.slice(3).trim();
    else if (line.startsWith("event:")) out.event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (data) out.data = data;
  return out;
}

export function createResumableRun(opts: ResumableRunOptions): { abort: () => void } {
  const {
    resumeUrl,
    onEvent,
    onClose,
    fetchImpl = fetch,
    retryDelayMs = (n) => Math.min(30_000, 500 * 2 ** n),
  } = opts;
  let cursor = opts.initialCursor;
  let aborted = false;
  let attempt = 0;

  const ctrl = new AbortController();

  function done(reason: ResumableCloseReason) {
    if (aborted) return;
    aborted = true;
    // 终态事件也要主动 abort fetch。否则 RUN_FINISHED(outcome=interrupt)
    // 会让 response stream 半开：服务端 streamFrom 看到 awaiting_user / legacy awaiting_approval
    // 不主动关 generator，bus listener 一直挂着。下一次 resume 时新事件
    // 会被同时序列化写到老连接和新 after=cursor 连接 —— 老连接没人读但
    // 一直在膨胀。这里主动 abort 把 server 的 streamSSE signal 触发掉，
    // 让 generator 干净退出。详见 docs/.../sse-bilateral-close.md。
    ctrl.abort();
    try { onClose(reason); } catch { /* 调用方异常不传染 */ }
  }

  function buildUrl(): string {
    // 用哨兵 base 让相对路径也能 new URL 解析；保留原有 query 参数。
    const base = typeof location !== "undefined" ? location.origin : "http://_";
    const u = new URL(resumeUrl, base);
    if (cursor) u.searchParams.set("after", cursor);
    if (!/^https?:/i.test(resumeUrl)) return u.pathname + u.search;
    return u.toString();
  }

  function bumpAttempt(): number {
    const n = attempt;
    attempt = Math.min(attempt + 1, MAX_RETRY_ATTEMPT);
    return n;
  }

  async function loop() {
    while (!aborted) {
      const finalUrl = buildUrl();
      // 标记本次连接是否真的收到了事件。
      // 如果服务端立刻关（如 awaiting_user / legacy awaiting_approval 且 cursor 已追到 lastSeq），
      // 没有这个标记就会紧密重连死循环。和网络错误共用同一套退避。
      let receivedAny = false;

      try {
        const res = await fetchImpl(finalUrl, { signal: ctrl.signal });
        if (res.status === 410) return done("cursor_expired");
        if (res.status === 404) return done("error");
        if (!res.ok || !res.body) throw new Error(`http ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!aborted) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const parsed = parseFrame(frame);
            if (!parsed.data) continue;
            let event: AGUIEventLike;
            try { event = JSON.parse(parsed.data) as AGUIEventLike; } catch { continue; }
            const c = parsed.id ?? cursor ?? "";
            if (c) cursor = c;
            receivedAny = true;
            onEvent(event, c);
            if (TERMINAL.has(event.type)) {
              if (event.type === "RUN_FINISHED") return done("finished");
              // RUN_ERROR with code "CANCELLED" is a user-initiated cancel
              // (stop button OR reject-during-approval): treat as `aborted`
              // so the runtime doesn't surface "stream error" to the user.
              // The "已被用户中止" notice is appended via runWorker.
              if (event.code === "CANCELLED") return done("aborted");
              return done("error");
            }
          }
        }
        // 服务端关连接但没发终态事件。两种可能：
        //  - 本次连接收到过事件 → 多半是流中途的网络抖动，
        //    重置 attempt 计数立刻重连
        //  - 一个事件没收到 → 服务端处于"无事件可发"状态
        //    （如 awaiting_user / legacy awaiting_approval）。走和网络错误同样的退避，
        //    避免 tight-loop 把服务端打爆
        if (receivedAny) {
          attempt = 0;
        } else {
          await new Promise((r) => setTimeout(r, retryDelayMs(bumpAttempt())));
        }
      } catch (_err) {
        if (aborted || ctrl.signal.aborted) return done("aborted");
        await new Promise((r) => setTimeout(r, retryDelayMs(bumpAttempt())));
      }
    }
  }

  loop();

  return {
    abort() {
      // 幂等：如果已关闭（自然结束 / 此前 abort 过），no-op。
      if (aborted) { ctrl.abort(); return; }
      aborted = true;
      ctrl.abort();
      try { onClose("aborted"); } catch { /* 调用方异常不传染 */ }
    },
  };
}

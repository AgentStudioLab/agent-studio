// AG-UI HTTP 命令封装。
// 把 send / cancel / resume 这三个写操作收拢到一处，方便：
//   - 业务侧注入自定义 fetch（鉴权 header、metric 拦截等）
//   - 测试时 stub 单点
//   - 协议路径若调整，只改这一个文件
//
// 路径遵循 packages/shared/CONTRACT.md §B / §D。

export interface AGUIApiOptions {
  /** 拼到所有 endpoint 前面，默认空（同源相对路径）。 */
  apiBase?: string;
  /** 自定义 fetch 实现，默认全局 fetch。 */
  fetchImpl?: typeof fetch;
}

export interface PostRunRequest {
  threadId: string;
  runId: string;
  message: { role: "user"; content: string };
  /**
   * "ask" (default) — every mutation tool surfaces an HITL card.
   * "act-without-asking" — bypass approval for this run; provider's
   *  `canUseTool` short-circuits to allow. Sent per-run so the user can
   *  toggle mid-thread; the sidecar doesn't persist this server-side.
   */
  permissionMode?: "ask" | "act-without-asking";
}

export interface ResumeRequest {
  resumes: Array<{ interruptId: string; payload: unknown }>;
  /**
   * 要"总是允许"的 actionRequests 下标列表，对应 resume payload 的
   * decisions 数组位置。server 按 `computeActionKey(name, args)` 计算出 key
   * 写白名单（bash 是 `bash:<first-token>`，其它是 toolName）。
   *
   * 用 indices 而不是单 boolean —— 这样 UI 可以混合决策：approve 一个
   * 带"总是允许"，另一个只 approve 一次。形态对齐 Claude Code 的
   * per-prompt 审批。
   */
  alwaysAllowIndices?: number[];
}

export class AGUIHttpClient {
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AGUIApiOptions = {}) {
    this.apiBase = opts.apiBase ?? "";
    this.fetchImpl =
      opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  /** 启动一次 run。返回服务端确认的 runId（与 req.runId 一致）。 */
  async postRun(req: PostRunRequest): Promise<{ runId: string }> {
    const res = await this.fetchImpl(`${this.apiBase}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status !== 202) {
      throw new Error(`POST /runs failed: ${res.status}`);
    }
    return (await res.json()) as { runId: string };
  }

  /** 取消正在跑的 run。服务端会写一条 system note 让 agent 感知。 */
  async cancelRun(runId: string): Promise<void> {
    await this.fetchImpl(`${this.apiBase}/runs/${runId}`, {
      method: "DELETE",
    });
  }

  /** HITL 决策提交：approve / reject / 表单值。v1 未挂路由，保留占位以便后续接 HITL。 */
  async resumeRun(runId: string, body: ResumeRequest): Promise<void> {
    const res = await this.fetchImpl(`${this.apiBase}/runs/${runId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 202) {
      throw new Error(`POST /runs/${runId}/resume failed: ${res.status}`);
    }
  }

  /** 拼出 SSE endpoint URL，给 createResumableRun 用。 */
  eventsUrl(runId: string): string {
    return `${this.apiBase}/runs/${runId}/events`;
  }
}

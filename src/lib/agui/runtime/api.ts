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
  /** 当前 UI 语言（如 i18n.language）。每次 postRun/postRegenerate 调用时读取，
   *  随请求带给 sidecar，用于在 systemPrompt.append 注入"用该语言回答"。
   *  返回空 → 不带 locale（模型默认英文）。框架无关：React 层注入。 */
  getLocale?: () => string | undefined;
}

export interface PostRunRequest {
  threadId: string;
  runId: string;
  message: { role: "user"; content: string };
  providerSelection?: { providerId: string; modelId: string };
  /**
   * "ask" (default) — every mutation tool surfaces an HITL card.
   * "act-without-asking" — bypass approval for this run; provider's
   *  `canUseTool` short-circuits to allow. Sent per-run so the user can
   *  toggle mid-thread; the sidecar doesn't persist this server-side.
   */
  permissionMode?: "ask" | "act-without-asking";
  /**
   * Model id (e.g. "claude-opus-4-7"). Forwarded to the SDK as
   * `options.model` for this run. If omitted, sidecar falls back to its
   * ANTHROPIC_MODEL env (and ultimately the SDK's own default).
   */
  model?: string;
  /** 「始终允许」命令规则（CC Tool(pattern) 语法）。sidecar 在 canUseTool 内匹配。 */
  approvalRules?: string[];
  /** 官方服务商经官网扣积分接口调用时使用的 desktop access token。 */
  officialAuthToken?: string;
  /** 官网 origin，由 sidecar official provider 拼接 /api/desktop/ai/chat。 */
  officialWebsiteOrigin?: string;
}

export interface PostRegenerateRequest {
  threadId: string;
  /** DB id of the user message to regenerate from (re-runs the same prompt,
   *  discarding it + every later turn, and rolling back its file edits). */
  fromMessageId: string;
  runId: string;
  permissionMode?: "ask" | "act-without-asking";
  providerSelection?: { providerId: string; modelId: string };
  model?: string;
  /** 「始终允许」命令规则（CC Tool(pattern) 语法）。sidecar 在 canUseTool 内匹配。 */
  approvalRules?: string[];
  /** 官方服务商经官网扣积分接口调用时使用的 desktop access token。 */
  officialAuthToken?: string;
  /** 官网 origin，由 sidecar official provider 拼接 /api/desktop/ai/chat。 */
  officialWebsiteOrigin?: string;
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

/**
 * Thrown when the sidecar rejects a run start (POST /runs or regenerate) with
 * 409 because the thread already has a non-terminal run — e.g. a scheduled run
 * is still executing, or another window started one. Callers treat this as
 * "re-queue and retry when that run finishes", NOT as a fatal error, so it
 * stays distinct from the generic Error thrown on other non-2xx responses.
 */
export class RunInProgressError extends Error {
  readonly activeRunId: string | null;
  constructor(activeRunId: string | null) {
    super("run_in_progress");
    this.name = "RunInProgressError";
    this.activeRunId = activeRunId;
  }
}

export class AGUIHttpClient {
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getLocale?: () => string | undefined;

  constructor(opts: AGUIApiOptions = {}) {
    this.apiBase = opts.apiBase ?? "";
    this.fetchImpl =
      opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.getLocale = opts.getLocale;
  }

  /** 启动一次 run。返回服务端确认的 runId（与 req.runId 一致）。 */
  async postRun(req: PostRunRequest): Promise<{ runId: string }> {
    const locale = this.getLocale?.();
    const res = await this.fetchImpl(`${this.apiBase}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(locale ? { ...req, locale } : req),
    });
    if (res.status === 409) {
      const b = (await res.json().catch(() => null)) as { activeRunId?: string } | null;
      throw new RunInProgressError(b?.activeRunId ?? null);
    }
    if (res.status !== 202) {
      throw new Error(`POST /runs failed: ${res.status}`);
    }
    return (await res.json()) as { runId: string };
  }

  /** 重新生成某一轮：丢弃该 user 消息及其后所有轮次、回滚文件、重跑同一句。
   *  返回服务端确认的 runId。 */
  async postRegenerate(
    req: PostRegenerateRequest,
  ): Promise<{ runId: string }> {
    const locale = this.getLocale?.();
    const res = await this.fetchImpl(
      `${this.apiBase}/threads/${req.threadId}/regenerate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromMessageId: req.fromMessageId,
          runId: req.runId,
          ...(req.permissionMode ? { permissionMode: req.permissionMode } : {}),
          ...(req.providerSelection
            ? { providerSelection: req.providerSelection }
            : {}),
          ...(req.model ? { model: req.model } : {}),
          ...(locale ? { locale } : {}),
          ...(req.approvalRules?.length ? { approvalRules: req.approvalRules } : {}),
          ...(req.officialAuthToken
            ? { officialAuthToken: req.officialAuthToken }
            : {}),
          ...(req.officialWebsiteOrigin
            ? { officialWebsiteOrigin: req.officialWebsiteOrigin }
            : {}),
        }),
      },
    );
    if (res.status === 409) {
      const b = (await res.json().catch(() => null)) as { activeRunId?: string } | null;
      throw new RunInProgressError(b?.activeRunId ?? null);
    }
    if (res.status !== 202) {
      throw new Error(`POST regenerate failed: ${res.status}`);
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

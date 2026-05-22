// HITL resume payload 的协议拆解。
// 业务侧给的 payload 可能夹带本仓库私有的带外字段（alwaysAllowIndices），
// 也可能在 decisions 数组里带 reject —— 这些都是协议层知识，不应该
// 散落在 runtime 组装层。
//
// 单独成文件，方便协议演进（edit 决定、新带外字段等）只改这一处。

import type { ResumeRequest } from "./api";

interface ResumeInterpretation {
  /** 直接喂给 http.resumeRun 的请求体。 */
  request: ResumeRequest;
  /** 是否需要预清扫 live 里 pending 的工具调用（deny 路径）。 */
  needsSweep: boolean;
  /** decisions 中是否含 deny — 用于在 deny 时乐观追加"已被用户中止" notice。 */
  isDeny: boolean;
}

/**
 * 把外部传入的 payload 翻译成 server 期望的 ResumeRequest。
 *
 * 责任：
 *  1. 拆出 alwaysAllowIndices 这种本仓库私有的带外提示，不混进 LangGraph
 *     payload。具体白名单 key 由 server 根据下标取 actionRequest 后用
 *     `computeActionKey(name, args)` 计算。
 *  2. 嗅探 decisions 是否含 reject —— 决定是否预清扫 spinner。
 *  3. 包装成 server `/ag-ui/runs/:id/resume` 期望的信封。
 */
export function buildResumeRequest(
  payload: unknown,
  interruptId: string,
): ResumeInterpretation {
  let alwaysAllowIndices: number[] | undefined;
  let resumePayload = payload;

  if (
    payload &&
    typeof payload === "object" &&
    "alwaysAllowIndices" in (payload as Record<string, unknown>)
  ) {
    const { alwaysAllowIndices: hint, ...rest } = payload as {
      alwaysAllowIndices?: number[];
    } & Record<string, unknown>;
    alwaysAllowIndices = hint;
    resumePayload = rest;
  }

  const decisions =
    ((resumePayload as { decisions?: { type?: string }[] } | null)?.decisions ?? []) as {
      type?: string;
    }[];
  // Server contract is `type: "deny"` (see routes/runs.ts resume handler);
  // legacy "reject" kept for any historical caller still using the old word.
  const isDeny = decisions.some((d) => d?.type === "deny" || d?.type === "reject");

  const request: ResumeRequest = {
    resumes: [{ interruptId, payload: resumePayload }],
    ...(alwaysAllowIndices?.length ? { alwaysAllowIndices } : {}),
  };

  return { request, needsSweep: isDeny, isDeny };
}

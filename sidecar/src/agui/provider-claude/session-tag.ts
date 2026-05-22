// Thread ↔ Claude SDK session 的桥接。
// 借助 SDK 的 tagSession / listSessions：每个 thread 对应一个 SDK session，
// 通过 tag 反查 sessionId 实现 resume，避免在 sidecar 进程内维护映射 Map
// （进程重启会丢失）。

import {
  listSessions as sdkListSessions,
  tagSession as sdkTagSession,
} from "@anthropic-ai/claude-agent-sdk";

type ListSessionsFn = typeof sdkListSessions;
type TagSessionFn = typeof sdkTagSession;

/**
 * 在 `dir` 下找 tag === threadId 的 session，返回最新一条的 sessionId。
 * 没找到 / 调用抛错 → 返回 undefined（视为"无可恢复 session，下一轮新建"）。
 *
 * 第三参 `listFn` 仅为单测注入；生产代码省略即可。
 */
export async function getResumeSessionId(
  threadId: string,
  dir: string,
  listFn: ListSessionsFn = sdkListSessions,
): Promise<string | undefined> {
  try {
    const sessions = await listFn({ dir });
    return sessions.find((s) => s.tag === threadId)?.sessionId;
  } catch {
    return undefined;
  }
}

/**
 * 把 threadId tag 到 sessionId 上。幂等：重复 tag 同值 SDK 会去重。
 * 失败不抛错——上层不阻断 turn，但下一轮 resume 会失败，模型会丢上下文。
 */
export async function tagThreadSession(
  sessionId: string,
  threadId: string,
  dir: string,
  tagFn: TagSessionFn = sdkTagSession,
): Promise<void> {
  try {
    await tagFn(sessionId, threadId, { dir });
  } catch (err) {
    console.error(`[session-tag] tagSession failed for ${sessionId}/${threadId}:`, err);
  }
}

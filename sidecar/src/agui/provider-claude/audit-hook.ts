// PreToolUse / PostToolUse hook callbacks.
//
// 同步逻辑只做：拿到 input → 写 AuditService → 返回空 HookOutput。
// 不调 SDK、不 await IO 之外的任何东西，保证 hook 在 CLI 内同步路径 < 1ms。

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { AuditService } from "../../services/audit";

export interface AuditHookContext {
  threadId: string;
  runId: string;
}

export function createAuditHooks(
  audit: AuditService,
  ctx: AuditHookContext,
): { pre: HookCallback; post: HookCallback } {
  const pre: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    audit.appendPre({
      ts: Date.now(),
      sessionId: input.session_id,
      threadId: ctx.threadId,
      runId: ctx.runId,
      toolName: input.tool_name,
      toolUseId: input.tool_use_id,
      input: input.tool_input,
      cwd: input.cwd,
    });
    return {};
  };

  const post: HookCallback = async (input) => {
    if (input.hook_event_name !== "PostToolUse") return {};
    audit.appendPost({
      ts: Date.now(),
      sessionId: input.session_id,
      threadId: ctx.threadId,
      runId: ctx.runId,
      toolName: input.tool_name,
      toolUseId: input.tool_use_id,
      durationMs: input.duration_ms,
      isError: false,
      cwd: input.cwd,
    });
    return {};
  };

  return { pre, post };
}

// AgentProvider — agent runtime adapter. v1 = claude-agent-sdk; future-proof
// for swapping (Vercel AI SDK, OpenAI Agents, Mastra). Any runtime producing
// AG-UI events implements this.

import type { AGUIEvent } from "./types";
import type { AGUIInterrupt } from "./interrupts";
import type { SDKPermissionDenial } from "@anthropic-ai/claude-agent-sdk";
import type { SideEffectFile } from "../provider-claude/bash-side-effects";

export interface ProviderCallbacks {
  onMessageEnd?: (msg: {
    id: string;
    content: string;
    reasoning?: string;
    phase?: "reasoning" | "conclusion";
    /** SDK transcript uuid of this assistant message (`am.uuid`). Persisted to
     *  messages.sdk_uuid so it can anchor a later resumeSessionAt. */
    sdkUuid?: string;
  }) => void | Promise<void>;
  /**
   * Fired once per turn when the SDK echoes the live user prompt with its
   * transcript uuid (requires `extraArgs: { 'replay-user-messages': null }`).
   * runWorker persists it onto the just-appended user message row so a future
   * regenerate can use it as the rewindFiles checkpoint id.
   */
  onUserMessageId?: (uuid: string) => void;
  onToolCallEnd?: (tc: {
    id: string;
    toolName: string;
    args: unknown;
    parentMessageId: string | null;
  }) => void | Promise<void>;
  onToolCallResult?: (tc: {
    id: string;
    result: unknown;
    status: "success" | "error";
    errorMsg?: string;
    /**
     * Files indirectly produced/modified by this tool call (Bash only).
     * Bridge populates this from BashSideEffectsTracker.takeEffects; runWorker
     * persists it to tool_calls.side_effects so FilesTab survives a reload.
     */
    sideEffects?: SideEffectFile[];
  }) => void | Promise<void>;
  /**
   * Fired once per SDKResultMessage (success and error). runWorker uses this
   * to write the runs table usage columns + append a usage_ledger row.
   */
  onRunUsage?: (u: {
    runId: string;
    threadId: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCostUsd: number;
    permissionDenials: SDKPermissionDenial[];
    model?: string;
  }) => void | Promise<void>;
}

/**
 * Per-run HITL policy. "ask" surfaces every mutation tool through canUseTool;
 * "act-without-asking" short-circuits canUseTool to allow so the SDK runs
 * tools without the round-trip. Sent per-run (not stored sidecar-side), so
 * the user can flip mid-thread.
 */
export type PermissionMode = "ask" | "act-without-asking";

export interface RunContext {
  threadId: string;
  runId: string;
  userMessage: { role: "user"; content: string };
  abortSignal: AbortSignal;
  callbacks?: ProviderCallbacks;
  /** Working directory passed to the SDK as `options.cwd`. */
  cwd: string;
  permissionMode?: PermissionMode;
  /**
   * Per-run model override. When set, takes precedence over the provider's
   * default model (which falls back to ANTHROPIC_MODEL). Forwarded to the SDK
   * as `options.model`.
   */
  model?: string;
  /**
   * Per-run allow-list for background (scheduled) runs. Tool names listed here
   * are auto-approved inside `canUseTool` — AFTER the workspace sandbox and the
   * destructive-action guardrail — so unattended runs don't stall on every
   * step. Deliberately NOT the SDK-native `allowedTools` option (which bypasses
   * canUseTool, and therefore the sandbox). Empty/undefined → no auto-approval.
   */
  autoApproveTools?: string[];
  /**
   * 交互式 run 的「始终允许」命令规则（CC `Tool(pattern)` 语法，见
   * provider-claude/approval-rules.ts）。前端把 cwd + 全局 allowlist 的并集经
   * POST /runs 传入；provider 在 run 启动时种入 interruptBus（按 runId），
   * canUseTool 命中即放行。run 内经 /resume 的 persistRule 追加。
   * autoApproveTools（裸名）与本字段在 canUseTool 内走同一匹配器。
   * 背景 run（scheduler/remote）无前端 → undefined。
   */
  approvalRules?: string[];
  /**
   * Regenerate: SDK message uuid to resume the session AT (transcript is
   * restored up to and including this message, then `userMessage` re-runs).
   * Maps to the SDK `resumeSessionAt` option. Omit for a normal turn.
   */
  resumeSessionAt?: string;
  /**
   * Regenerate of the FIRST turn: there's no preceding message to anchor on,
   * so skip resume entirely and let the SDK allocate a fresh session (which is
   * then re-tagged to this thread). Ignored when resumeSessionAt is set.
   */
  freshSession?: boolean;
  /**
   * Agent-workspace sandbox extras (P2). When the thread is bound to an agent,
   * runWorker resolves its external folders into:
   *   additionalReadDirs  = all mounted folders (readable)
   *   additionalWriteDirs = the writable subset
   * The provider adds `cwd` (the agent home / default workspace) to both,
   * fills `options.additionalDirectories` + `sandbox.filesystem.allowWrite`,
   * and passes the roots to `checkWorkspaceSandbox`. Empty/undefined for a
   * non-agent thread → the sandbox stays scoped to `[cwd]`.
   */
  additionalReadDirs?: string[];
  additionalWriteDirs?: string[];
  /**
   * Bound agent's context block (P3): its `<home>/CLAUDE.md` instructions plus
   * saved memories, composed by runWorker. The provider merges it into
   * `systemPrompt.append` after the per-user profile addition. Undefined for a
   * non-agent thread.
   */
  appendContext?: string;
  /**
   * The bound agent's id (P3). When set (and the host wired `onRemember`), the
   * provider exposes the in-process `remember` tool scoped to this agent and
   * adds its FQN to `allowedTools`. Undefined for a non-agent thread.
   */
  agentWorkspaceId?: string;
  /**
   * Caller's UI locale (the frontend forwards `i18n.language`). The provider
   * derives a language directive from it and merges it into `systemPrompt.append`
   * so the model answers (and reasons) in the user's language. Undefined for
   * background runs (scheduler) → no directive, model default (English).
   */
  locale?: string;
}

export interface ResumeContext {
  threadId: string;
  runId: string;
  resumePayload: unknown;
  abortSignal: AbortSignal;
  callbacks?: ProviderCallbacks;
  cwd: string;
  permissionMode?: PermissionMode;
  model?: string;
  autoApproveTools?: string[];
}

/**
 * Contracts (implementations MUST satisfy):
 * P1: `run` / `resume` stream MUST start with RUN_STARTED and end with
 *     RUN_FINISHED or RUN_ERROR.
 * P2: event.type MUST use @ag-ui/core EventType enum.
 * P3: on abortSignal.aborted, stop producing events ASAP.
 * P4: getPendingInterrupts returns true state after stream end.
 * P5: provider MUST call ctx.callbacks.* in order.
 * P6: resumePayload shape is provider-defined.
 * P7: providers do not share state.
 */
export interface AgentProvider {
  readonly name: string;
  run(ctx: RunContext): AsyncIterable<AGUIEvent>;
  resume(ctx: ResumeContext): AsyncIterable<AGUIEvent>;
  getPendingInterrupts(
    threadId: string,
    runId: string,
  ): Promise<AGUIInterrupt[]>;
  notifyCancelled?(threadId: string): Promise<void>;
  /**
   * Roll back files (Write/Edit/NotebookEdit only) to the state captured at the
   * given SDK checkpoint uuid. Optional — providers without file checkpointing
   * omit it. Resolves the thread's session internally; best-effort (returns
   * `canRewind: false` when there's no session/checkpoint, never throws into
   * the caller's flow).
   */
  rewindFiles?(input: {
    threadId: string;
    cwd: string;
    checkpointUuid: string;
    signal?: AbortSignal;
  }): Promise<{ canRewind: boolean; error?: string; filesChanged?: number }>;
}

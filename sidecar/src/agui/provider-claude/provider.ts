// Claude Agent SDK adapter for AgentProvider.
//
// Multi-turn strategy: each turn's system.init carries a session_id.
// We tag it with threadId via SDK tagSession; the next turn's runTurn
// calls listSessions to recover the sessionId for resume. The SDK's
// JSONL store is the sole source of truth — sidecar restart preserves
// multi-turn context, unlike the previous in-memory Map.
//
// Per-turn abort: each turn spawns a fresh `query()` with its own
// AbortController. Cancelling a turn does NOT lose multi-turn context,
// because session_id is captured on the next successful turn's init.

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { claudeSdkToAgui } from "./bridge";
import { getResumeSessionId, tagThreadSession } from "./session-tag";
import { checkWorkspaceSandbox } from "./sandbox";
import { createAuditHooks } from "./audit-hook";
import type {
  AgentProvider,
  RunContext,
  ResumeContext,
} from "../core/provider-types";
import type { AGUIEvent } from "../core/types";
import type { AGUIInterrupt } from "../core/interrupts";
import type { InterruptBus } from "./interrupt-bus";
import type { AuditService } from "../../services/audit";

export interface ClaudeProviderOptions {
  /**
   * API key required by claude-agent-sdk. Forwarded through `options.env`
   * since the SDK spawns the Claude Code CLI and inherits env from there.
   */
  apiKey: string;
  /** Forwarded to the SDK CLI env. Useful for DeepSeek-compat endpoints. */
  baseUrl?: string;
  /** Forwarded to the SDK CLI env. */
  model?: string;
  /**
   * @deprecated Use `resolveAllowedTools` instead. Kept for backwards compatibility.
   * Tools the SDK is allowed to invoke. Each call hits `canUseTool` first.
   */
  allowedTools?: string[];
  /**
   * Called per-turn with threadId; returns the effective allowedTools for that thread.
   * If provided, takes precedence over the deprecated `allowedTools` field.
   */
  resolveAllowedTools?: (threadId: string) => string[];
  /**
   * HITL bus. When provided, the provider wires `canUseTool` to
   * `bus.requestApproval` so each tool invocation requires explicit user
   * approval through the existing /runs/:id/resume route.
   */
  interruptBus?: InterruptBus;
  /** Optional audit sink. When omitted, no hooks installed. */
  audit?: AuditService;
}

export function createClaudeProvider(opts: ClaudeProviderOptions): AgentProvider {
  function buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env.ANTHROPIC_API_KEY = opts.apiKey;
    if (opts.baseUrl) env.ANTHROPIC_BASE_URL = opts.baseUrl;
    if (opts.model) env.ANTHROPIC_MODEL = opts.model;
    return env;
  }

  async function runTurn(
    ctx: RunContext | ResumeContext,
    prompt: string,
  ): Promise<AsyncIterable<AGUIEvent>> {
    const ac = new AbortController();
    // Bridge external signal → SDK's controller.
    if (ctx.abortSignal.aborted) {
      ac.abort(ctx.abortSignal.reason);
    } else {
      ctx.abortSignal.addEventListener(
        "abort",
        () => ac.abort(ctx.abortSignal.reason),
        { once: true },
      );
    }

    const resumeSessionId = await getResumeSessionId(ctx.threadId, ctx.cwd);

    const allowedTools = opts.resolveAllowedTools
      ? opts.resolveAllowedTools(ctx.threadId)
      : opts.allowedTools ?? [];

    const bus = opts.interruptBus;
    // canUseTool runs for every tool call. Two gates layered:
    //   1. Workspace sandbox (sync, policy) — paths outside ctx.cwd are
    //      auto-denied so the user isn't asked to approve filesystem reads
    //      outside the directory they explicitly bound to this conversation.
    //   2. HITL bus (async, user decision) — anything that passes the
    //      sandbox surfaces an approval card.
    const canUseTool: CanUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      sdkOpts,
    ) => {
      const sandboxDeny = checkWorkspaceSandbox(toolName, input, ctx.cwd);
      if (sandboxDeny) {
        return { behavior: "deny" as const, message: sandboxDeny };
      }
      if (!bus) return { behavior: "allow" as const };
      return bus.requestApproval({
        runId: ctx.runId,
        threadId: ctx.threadId,
        toolUseID: sdkOpts.toolUseID,
        toolName,
        input,
        title: sdkOpts.title,
        description: sdkOpts.description,
      });
    };

    const auditHooks = opts.audit
      ? createAuditHooks(opts.audit, { threadId: ctx.threadId, runId: ctx.runId })
      : null;

    const sdkStream = sdkQuery({
      prompt,
      options: {
        abortController: ac,
        cwd: ctx.cwd,
        env: buildEnv(),
        allowedTools,
        // Emit fine-grained SDKPartialAssistantMessage (stream_event) frames so
        // the bridge can turn them into per-token TEXT_MESSAGE_CONTENT events
        // and the UI shows characters arriving in real time. Without this, the
        // SDK only yields the full SDKAssistantMessage at the end of a turn,
        // which collapses the response into a single chunk.
        includePartialMessages: true,
        // Always installed: even when there's no HITL bus, the sandbox
        // layer inside canUseTool needs to gate file paths.
        canUseTool,
        ...(auditHooks ? {
          hooks: {
            PreToolUse:  [{ hooks: [auditHooks.pre], timeout: 2 }],
            PostToolUse: [{ hooks: [auditHooks.post], timeout: 2 }],
          },
        } : {}),
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          // Disabled so Bash is not auto-allowed; HITL bus handles approval.
          autoAllowBashIfSandboxed: false,
          allowUnsandboxedCommands: false,
          excludedCommands: [],
          filesystem: {
            allowWrite: [ctx.cwd],
          },
          // network 不限——本 phase 决策"仅写限"
        },
        // Force every mutation tool through canUseTool (HITL bus) even when
        // sandbox.allowWrite / autoAllowBashIfSandboxed would otherwise
        // auto-approve them. Read-only tools (Read/Glob/Grep/WebSearch) are
        // intentionally omitted — the workspace path check in canUseTool still
        // rejects out-of-cwd reads without surfacing a noisy approval card.
        settings: {
          permissions: {
            ask: [
              "Bash(*)",
              "Write(*)",
              "Edit(*)",
              "MultiEdit(*)",
              "NotebookEdit(*)",
              "Task(*)",
              "WebFetch(*)",
            ],
          },
        },
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      },
    });

    return claudeSdkToAgui(sdkStream, {
      threadId: ctx.threadId,
      runId: ctx.runId,
      callbacks: ctx.callbacks,
      onSessionId: (sid) => {
        // First turn allocates a fresh session_id; subsequent turns echo the
        // resumed one. Either way, tag idempotently so resume lookup works.
        void tagThreadSession(sid, ctx.threadId, ctx.cwd);
      },
    });
  }

  return {
    name: "claude-agent-sdk",

    run(ctx: RunContext) {
      return asyncIterableFromPromise(runTurn(ctx, ctx.userMessage.content));
    },

    resume(ctx: ResumeContext) {
      const payload = ctx.resumePayload as { text?: string } | null;
      return asyncIterableFromPromise(runTurn(ctx, payload?.text ?? ""));
    },

    async getPendingInterrupts(
      _threadId: string,
      _runId: string,
    ): Promise<AGUIInterrupt[]> {
      // Interrupts are surfaced mid-stream via the InterruptBus
      // (canUseTool → bus.requestApproval writes a synthetic RUN_FINISHED
      // event to the store). This end-of-stream path is unused for the
      // claude-agent-sdk provider; the runLoop's `interrupted` outcome
      // branch only fires for providers that report interrupts on stream
      // termination (e.g., LangGraph-style runtimes).
      return [];
    },

    async notifyCancelled(_threadId: string): Promise<void> {
      // No-op for SDK provider. The next user message will land via resume
      // sessionId, and the cancelled assistant message stays in the SDK's
      // session transcript (it's recorded by the CLI before kill).
    },
  };
}

function asyncIterableFromPromise<T>(
  p: Promise<AsyncIterable<T>>,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let inner: AsyncIterator<T> | null = null;
      return {
        async next() {
          if (!inner) inner = (await p)[Symbol.asyncIterator]();
          return inner.next();
        },
      };
    },
  };
}

// Claude Agent SDK adapter for AgentProvider.
//
// Multi-turn strategy: capture session_id from each turn's `system.init`
// event and pass it as `options.resume` on the next turn. This delegates
// transcript persistence to the Claude SDK itself (it writes JSONL session
// files); we just remember which session_id belongs to which threadId.
//
// Per-turn abort: each turn spawns a fresh `query()` with its own
// AbortController. Cancelling a turn does NOT lose multi-turn context,
// because session_id is captured on the next successful turn's init.

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { claudeSdkToAgui } from "./bridge";
import type {
  AgentProvider,
  RunContext,
  ResumeContext,
} from "../core/provider-types";
import type { AGUIEvent } from "../core/types";
import type { AGUIInterrupt } from "../core/interrupts";
import type { InterruptBus } from "./interrupt-bus";

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
  /** Tools the SDK is allowed to invoke. Each call hits `canUseTool` first. */
  allowedTools?: string[];
  /**
   * HITL bus. When provided, the provider wires `canUseTool` to
   * `bus.requestApproval` so each tool invocation requires explicit user
   * approval through the existing /runs/:id/resume route.
   */
  interruptBus?: InterruptBus;
}

export function createClaudeProvider(opts: ClaudeProviderOptions): AgentProvider {
  // Per-thread session_id memo. v1 keeps in memory (sidecar restart → fresh).
  const sessionByThread = new Map<string, string>();

  function buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env.ANTHROPIC_API_KEY = opts.apiKey;
    if (opts.baseUrl) env.ANTHROPIC_BASE_URL = opts.baseUrl;
    if (opts.model) env.ANTHROPIC_MODEL = opts.model;
    return env;
  }

  function runTurn(
    ctx: RunContext | ResumeContext,
    prompt: string,
  ): AsyncIterable<AGUIEvent> {
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

    const resumeSessionId = sessionByThread.get(ctx.threadId);

    const bus = opts.interruptBus;
    const canUseTool = bus
      ? async (
          toolName: string,
          input: Record<string, unknown>,
          sdkOpts: {
            toolUseID: string;
            title?: string;
            description?: string;
          },
        ) => bus.requestApproval({
          runId: ctx.runId,
          threadId: ctx.threadId,
          toolUseID: sdkOpts.toolUseID,
          toolName,
          input,
          title: sdkOpts.title,
          description: sdkOpts.description,
        })
      : undefined;

    const sdkStream = sdkQuery({
      prompt,
      options: {
        abortController: ac,
        env: buildEnv() as never,
        allowedTools: opts.allowedTools ?? [],
        // Emit fine-grained SDKPartialAssistantMessage (stream_event) frames so
        // the bridge can turn them into per-token TEXT_MESSAGE_CONTENT events
        // and the UI shows characters arriving in real time. Without this, the
        // SDK only yields the full SDKAssistantMessage at the end of a turn,
        // which collapses the response into a single chunk.
        includePartialMessages: true,
        // `as never`: our closure types `options` with the three fields the
        // bus actually reads (toolUseID/title/description); the SDK's
        // CanUseTool surface is wider (signal, suggestions, blockedPath, …).
        // The SDK's options.signal abort path is covered downstream by
        // runWorker calling bus.cancelAll(runId) on terminal — see Task 4
        // of docs/superpowers/plans/2026-05-20-hitl-tool-approval.md.
        ...(canUseTool ? { canUseTool: canUseTool as never } : {}),
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      },
    });

    return claudeSdkToAgui(sdkStream, {
      threadId: ctx.threadId,
      runId: ctx.runId,
      callbacks: ctx.callbacks,
      onSessionId: (sid) => {
        // Capture each turn's session_id; the resume path returns the SAME
        // id we passed in, but the no-resume first turn allocates a fresh
        // one that we MUST remember for turn 2.
        sessionByThread.set(ctx.threadId, sid);
      },
    });
  }

  return {
    name: "claude-agent-sdk",

    run(ctx: RunContext) {
      return runTurn(ctx, ctx.userMessage.content);
    },

    resume(ctx: ResumeContext) {
      // v1: no HITL interrupts surface in our run loop (tools:[] means no
      // tool_approval). Provide a no-op resume that yields a synthetic
      // RUN_FINISHED so the loop terminates cleanly if ever called.
      const payload = ctx.resumePayload as { text?: string } | null;
      return runTurn(ctx, payload?.text ?? "");
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

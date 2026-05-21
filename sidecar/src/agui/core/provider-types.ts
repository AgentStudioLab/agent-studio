// AgentProvider — agent runtime adapter. v1 = claude-agent-sdk; future-proof
// for swapping (Vercel AI SDK, OpenAI Agents, Mastra). Any runtime producing
// AG-UI events implements this.

import type { AGUIEvent } from "./types";
import type { AGUIInterrupt } from "./interrupts";

export interface ProviderCallbacks {
  onMessageEnd?: (msg: {
    id: string;
    content: string;
    reasoning?: string;
    phase?: "reasoning" | "conclusion";
  }) => void | Promise<void>;
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
  }) => void | Promise<void>;
}

export interface RunContext {
  threadId: string;
  runId: string;
  userMessage: { role: "user"; content: string };
  abortSignal: AbortSignal;
  callbacks?: ProviderCallbacks;
  /** Working directory passed to the SDK as `options.cwd`. */
  cwd: string;
}

export interface ResumeContext {
  threadId: string;
  runId: string;
  resumePayload: unknown;
  abortSignal: AbortSignal;
  callbacks?: ProviderCallbacks;
  cwd: string;
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
}

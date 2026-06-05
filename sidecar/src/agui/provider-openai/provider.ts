import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { EventType } from "@ag-ui/core";
import type {
  AgentProvider,
  RunContext,
  ResumeContext,
} from "../core/provider-types";
import type { AGUIEvent } from "../core/types";
import { streamOpenAITextToAgui } from "./bridge";

export interface OpenAICompatibleProviderOptions {
  apiKey: string;
  baseUrl: string;
  model?: string;
  streamTextImpl?: typeof streamText;
}

export function createOpenAICompatibleProvider(
  opts: OpenAICompatibleProviderOptions,
): AgentProvider {
  const streamTextImpl = opts.streamTextImpl ?? streamText;
  const provider = createOpenAICompatible({
    name: "agent-studio-openai-compatible",
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl,
  });

  function resolveModel(ctxModel?: string): string {
    const model = ctxModel ?? opts.model;
    if (!model) throw new Error("model_missing");
    return model;
  }

  return {
    name: "openai-compatible",
    async *run(ctx: RunContext): AsyncIterable<AGUIEvent> {
      const modelId = resolveModel(ctx.model);
      const result = streamTextImpl({
        model: provider.chatModel(modelId),
        prompt: ctx.userMessage.content,
        abortSignal: ctx.abortSignal,
      });

      yield* streamOpenAITextToAgui({
        runId: ctx.runId,
        threadId: ctx.threadId,
        textStream: result.textStream,
        usage: Promise.resolve(result.usage),
        model: modelId,
        callbacks: ctx.callbacks,
      });
    },
    async *resume(ctx: ResumeContext): AsyncIterable<AGUIEvent> {
      yield {
        type: EventType.RUN_STARTED,
        threadId: ctx.threadId,
        runId: ctx.runId,
      } as AGUIEvent;
      yield {
        type: EventType.RUN_ERROR,
        code: "EXECUTION_ERROR",
        message:
          "OpenAI-compatible runtime has no pending interrupt to resume.",
      } as AGUIEvent;
    },
    async getPendingInterrupts() {
      return [];
    },
    async notifyCancelled() {
      return;
    },
    async rewindFiles() {
      return { canRewind: false, error: "unsupported" };
    },
  };
}

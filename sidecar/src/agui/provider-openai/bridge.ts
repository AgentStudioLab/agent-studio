import { EventType } from "@ag-ui/core";
import { nanoid } from "nanoid";
import type { ProviderCallbacks } from "../core/provider-types";
import type { AGUIEvent } from "../core/types";
import { mapOpenAIError } from "./error-map";

export interface OpenAIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface StreamOpenAITextInput {
  runId: string;
  threadId: string;
  textStream: AsyncIterable<string>;
  usage?: Promise<OpenAIUsage | undefined>;
  model?: string;
  callbacks?: ProviderCallbacks;
}

export async function* streamOpenAITextToAgui(
  input: StreamOpenAITextInput,
): AsyncIterable<AGUIEvent> {
  const { runId, threadId, textStream, callbacks, model } = input;
  yield { type: EventType.RUN_STARTED, threadId, runId } as AGUIEvent;

  const messageId = `msg_${nanoid(10)}`;
  let started = false;
  let content = "";

  try {
    for await (const delta of textStream) {
      if (!started) {
        started = true;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        } as AGUIEvent;
      }
      content += delta;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      } as AGUIEvent;
    }

    if (started) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
      await callbacks?.onMessageEnd?.({
        id: messageId,
        content,
        phase: "conclusion",
      });
    }

    const usage = await input.usage?.catch(() => undefined);
    await callbacks?.onRunUsage?.({
      runId,
      threadId,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      permissionDenials: [],
      model,
    });

    yield { type: EventType.RUN_FINISHED, threadId, runId } as AGUIEvent;
  } catch (err) {
    if (started) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
    }
    const mapped = mapOpenAIError(err);
    yield {
      type: EventType.RUN_ERROR,
      code: mapped.code,
      message: mapped.message,
    } as AGUIEvent;
  }
}

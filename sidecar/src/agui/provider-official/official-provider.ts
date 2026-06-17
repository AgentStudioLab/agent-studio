import { EventType } from "@ag-ui/core";
import { nanoid } from "nanoid";
import type {
  AgentProvider,
  RunContext,
  ResumeContext,
} from "../core/provider-types";
import type { AGUIEvent } from "../core/types";

interface OfficialProviderOptions {
  fetchImpl?: typeof fetch;
}

interface OfficialUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

type OfficialNdjsonLine =
  | { type: "text_delta"; text?: unknown }
  | { type: "usage"; usage?: unknown }
  | { type: "billing"; remainingCredits?: unknown }
  | { type: "done" }
  | { type: "error"; code?: unknown; message?: unknown; remainingCredits?: unknown };

function normalizeOrigin(origin: string): string {
  const url = new URL(origin);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function parseLine(line: string): OfficialNdjsonLine | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as OfficialNdjsonLine;
    return parsed && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeUsage(value: unknown): OfficialUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  return {
    promptTokens:
      typeof raw.promptTokens === "number" ? raw.promptTokens : undefined,
    completionTokens:
      typeof raw.completionTokens === "number" ? raw.completionTokens : undefined,
    totalTokens: typeof raw.totalTokens === "number" ? raw.totalTokens : undefined,
  };
}

function mapOfficialErrorCode(code: unknown): string {
  return code === "insufficient_credits"
    ? "INSUFFICIENT_CREDITS"
    : "OFFICIAL_AI_ERROR";
}

async function readNdjsonLines(response: Response): Promise<OfficialNdjsonLine[]> {
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => parseLine(line))
    .filter((line): line is OfficialNdjsonLine => line !== null);
}

export function createOfficialProvider(
  options: OfficialProviderOptions = {},
): AgentProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    name: "official",
    async *run(ctx: RunContext): AsyncIterable<AGUIEvent> {
      yield {
        type: EventType.RUN_STARTED,
        threadId: ctx.threadId,
        runId: ctx.runId,
      } as AGUIEvent;

      if (ctx.abortSignal.aborted) {
        yield {
          type: EventType.RUN_ERROR,
          code: "CANCELLED",
          message: "cancelled",
        } as AGUIEvent;
        return;
      }

      if (!ctx.officialAuthToken || !ctx.officialWebsiteOrigin) {
        yield {
          type: EventType.RUN_ERROR,
          code: "OFFICIAL_AUTH_REQUIRED",
          message: "official_auth_required",
        } as AGUIEvent;
        return;
      }

      const model = ctx.model;
      if (!model) {
        yield {
          type: EventType.RUN_ERROR,
          code: "MODEL_MISSING",
          message: "model_missing",
        } as AGUIEvent;
        return;
      }

      const messageId = `msg_${nanoid(10)}`;
      let started = false;
      let content = "";
      let usage: OfficialUsage | undefined;

      try {
        const websiteOrigin = normalizeOrigin(ctx.officialWebsiteOrigin);
        const response = await fetchImpl(`${websiteOrigin}/api/desktop/ai/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ctx.officialAuthToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId: ctx.runId,
            threadId: ctx.threadId,
            model,
            messages: [ctx.userMessage],
          }),
          signal: ctx.abortSignal,
        });
        const lines = await readNdjsonLines(response);

        for (const line of lines) {
          if (line.type === "text_delta") {
            const delta = typeof line.text === "string" ? line.text : "";
            if (!delta) continue;
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
            continue;
          }

          if (line.type === "usage") {
            usage = normalizeUsage(line.usage);
            continue;
          }

          if (line.type === "error") {
            if (started) {
              yield {
                type: EventType.TEXT_MESSAGE_END,
                messageId,
              } as AGUIEvent;
              await ctx.callbacks?.onMessageEnd?.({
                id: messageId,
                content,
                phase: "conclusion",
              });
            }
            yield {
              type: EventType.RUN_ERROR,
              code: mapOfficialErrorCode(line.code),
              message:
                typeof line.message === "string"
                  ? line.message
                  : "official_ai_error",
            } as AGUIEvent;
            return;
          }
        }

        if (!response.ok) {
          yield {
            type: EventType.RUN_ERROR,
            code: "OFFICIAL_AI_ERROR",
            message: "official_ai_error",
          } as AGUIEvent;
          return;
        }

        if (started) {
          yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
          await ctx.callbacks?.onMessageEnd?.({
            id: messageId,
            content,
            phase: "conclusion",
          });
        }

        await ctx.callbacks?.onRunUsage?.({
          runId: ctx.runId,
          threadId: ctx.threadId,
          inputTokens: usage?.promptTokens ?? 0,
          outputTokens: usage?.completionTokens ?? 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalCostUsd: 0,
          permissionDenials: [],
          model,
        });

        yield {
          type: EventType.RUN_FINISHED,
          threadId: ctx.threadId,
          runId: ctx.runId,
        } as AGUIEvent;
      } catch (error) {
        if (started) {
          yield { type: EventType.TEXT_MESSAGE_END, messageId } as AGUIEvent;
        }
        const aborted =
          ctx.abortSignal.aborted ||
          (error instanceof Error && error.name === "AbortError");
        yield {
          type: EventType.RUN_ERROR,
          code: aborted ? "CANCELLED" : "OFFICIAL_AI_ERROR",
          message: aborted
            ? "cancelled"
            : error instanceof Error
              ? error.message
              : String(error),
        } as AGUIEvent;
      }
    },
    async *resume(ctx: ResumeContext): AsyncIterable<AGUIEvent> {
      yield {
        type: EventType.RUN_STARTED,
        threadId: ctx.threadId,
        runId: ctx.runId,
      } as AGUIEvent;
      yield {
        type: EventType.RUN_ERROR,
        code: "OFFICIAL_RESUME_UNSUPPORTED",
        message: "official_resume_unsupported",
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

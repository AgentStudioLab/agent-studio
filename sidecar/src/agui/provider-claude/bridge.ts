// SDK → AG-UI translation layer.
//
// Reads SDKMessage stream from claude-agent-sdk's `query()` generator, emits
// AG-UI events conforming to the @ag-ui/core schema. Only handles the text +
// tool subset that's actually useful to UI; system/init/control/etc. are
// inspected for side-effects (capturing session_id) but not surfaced.
//
// One bridge call = one TURN: emits RUN_STARTED → (TEXT_MESSAGE_* / TOOL_CALL_*)*
// → (RUN_FINISHED on `result` | RUN_ERROR on error). Caller wraps the iteration
// in `provider.run()` so each turn looks self-contained to the run loop.

import { nanoid } from "nanoid";
import { EventType } from "@ag-ui/core";
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  SDKAPIRetryMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { mapAssistantError, mapResultErrorSubtype } from "./error-map";
import type { BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages";
import type { AGUIEvent } from "../core/types";
import type { ProviderCallbacks } from "../core/provider-types";

export interface BridgeOptions {
  threadId: string;
  runId: string;
  callbacks?: ProviderCallbacks;
  onSessionId?: (sessionId: string) => void;
  /**
   * Fires once per turn when SDK's system.init carries mcp_servers + tools.
   * Used by sidecar to populate SessionMetadataStore so the GET /threads/:id/
   * context route can answer with what the SDK actually loaded for this run.
   */
  onInitMetadata?: (meta: {
    mcpServers: Array<{ name: string; status: string }>;
    tools: string[];
  }) => void;
}

/**
 * Translate one turn's worth of SDK messages into AG-UI events.
 *
 * Persistence contract — every assistant AIMessage produces ONE `messages`
 * row (via callbacks.onMessageEnd), even if content is empty. tool_use
 * blocks reference that row through `parentMessageId`. Without this, a
 * tool-only AIMessage would leave tool_calls orphaned (FK skipped in
 * runWorker) and they vanish after page refresh.
 */
export async function* claudeSdkToAgui(
  sdkStream: AsyncIterable<SDKMessage>,
  opts: BridgeOptions,
): AsyncIterable<AGUIEvent> {
  const { threadId, runId, callbacks, onSessionId, onInitMetadata } = opts;

  // Defer onSessionId until the SDK CLI has actually written the session
  // JSONL to disk. The CLI emits `system.init` carrying session_id BEFORE
  // flushing the file, so calling tagSession at init races with the write
  // and produces "Session not found in project directory" errors. Holding
  // the id and firing on the first persisted message (assistant or result)
  // sidesteps the race: by then the CLI has appended messages to the file.
  let pendingSessionId: string | null = null;
  let sessionIdEmitted = false;
  const flushSessionId = (): void => {
    if (sessionIdEmitted || !pendingSessionId) return;
    sessionIdEmitted = true;
    onSessionId?.(pendingSessionId);
  };

  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
  } as AGUIEvent;

  // Per-message accumulators. Reset on each SDKAssistantMessage we close.
  let currentTextMsgId: string | null = null;
  // currentReasoningId tracks the open thinking content block so reducer
  // events (REASONING_MESSAGE_CONTENT / REASONING_END) can address it.
  // Without this, START + accumulatedReasoning would land in the DB column
  // but the live UI block stays empty until a page refresh.
  let currentReasoningId: string | null = null;
  let accumulatedText = "";
  let accumulatedReasoning = "";

  // Close any open reasoning block. Called before opening a new block of a
  // different kind (text / tool_use) or when the assistant message arrives.
  function closeReasoningBlock(): AGUIEvent | null {
    if (!currentReasoningId) return null;
    const ev = {
      type: EventType.REASONING_END,
      messageId: currentReasoningId,
    } as AGUIEvent;
    currentReasoningId = null;
    return ev;
  }

  // Tool-call tracking. parentMsgId may be null when content_block_start
  // for tool_use fires before any text block opened — finalized in the
  // assistant-message handler against the actual persisted message id.
  type ToolState = {
    id: string;
    toolName: string;
    argsBuf: string;
    parentMsgId: string | null;
    ended: boolean; // already emitted TOOL_CALL_END + persisted via callback
  };
  const toolById = new Map<string, ToolState>();

  try {
    for await (const m of sdkStream) {
      if (!m || !m.type) continue;

      // system.init — capture session id once; api_retry — surface to UI
      if (m.type === "system") {
        if ((m as SDKAPIRetryMessage).subtype === "api_retry") {
          const r = m as SDKAPIRetryMessage;
          yield {
            type: EventType.CUSTOM,
            name: "agent.retry",
            value: {
              attempt: r.attempt,
              maxRetries: r.max_retries,
              retryDelayMs: r.retry_delay_ms,
              errorStatus: r.error_status,
              error: r.error,
            },
          } as AGUIEvent;
        } else {
          const sys = m as SDKSystemMessage;
          if (typeof sys.session_id === "string") {
            pendingSessionId = sys.session_id;
          }
          // SDK init carries the active capability surface for this turn:
          // mcp_servers + tools. Fire the callback whenever the SDK reports
          // init — an empty list is a valid signal (no MCPs / no tools) for
          // Task 4's GET /threads/:id/context. We still defensive-default
          // missing arrays to `[]` because test mocks and partial wire payloads
          // occasionally omit them; the SDK .d.ts declares them as required but
          // the wire format is external data we don't fully control.
          if (onInitMetadata) {
            const rawServers = Array.isArray(sys.mcp_servers) ? sys.mcp_servers : [];
            const rawTools = Array.isArray(sys.tools) ? sys.tools : [];
            onInitMetadata({
              mcpServers: rawServers
                .filter((s) => typeof s?.name === "string")
                .map((s) => ({
                  name: String(s.name),
                  status: typeof s.status === "string" ? s.status : "unknown",
                })),
              tools: rawTools.filter((t): t is string => typeof t === "string"),
            });
          }
        }
        continue;
      }

      // stream_event — fine-grained deltas from Anthropic's streaming API.
      // Fires UI events early so the user sees text appearing per-token; the
      // authoritative SDKAssistantMessage handler below does the persistence.
      if (m.type === "stream_event") {
        const ev = (m as SDKPartialAssistantMessage).event;
        if (!ev) continue;

        if (ev.type === "content_block_start" && ev.content_block) {
          const cb = ev.content_block;
          if (cb.type === "text") {
            // A non-thinking block is starting — close any open reasoning.
            const endR = closeReasoningBlock();
            if (endR) yield endR;
            currentTextMsgId = `msg_${nanoid(10)}`;
            accumulatedText = "";
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: currentTextMsgId,
              role: "assistant",
            } as AGUIEvent;
          } else if (cb.type === "tool_use" && cb.id && cb.name) {
            const endR = closeReasoningBlock();
            if (endR) yield endR;
            toolById.set(cb.id, {
              id: cb.id,
              toolName: cb.name,
              argsBuf: "",
              parentMsgId: currentTextMsgId,
              ended: false,
            });
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: cb.id,
              toolCallName: cb.name,
              parentMessageId: currentTextMsgId ?? undefined,
            } as AGUIEvent;
          } else if (cb.type === "thinking") {
            // If a previous thinking block was still open (rare — model
            // emits multiple consecutive thinking blocks), close it first.
            const endR = closeReasoningBlock();
            if (endR) yield endR;
            currentReasoningId = `rsn_${nanoid(10)}`;
            yield {
              type: EventType.REASONING_START,
              messageId: currentReasoningId,
              parentMessageId: currentTextMsgId ?? undefined,
            } as AGUIEvent;
          }
        } else if (ev.type === "content_block_delta" && ev.delta) {
          if (ev.delta.type === "text_delta" && ev.delta.text && currentTextMsgId) {
            accumulatedText += ev.delta.text;
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: currentTextMsgId,
              delta: ev.delta.text,
            } as AGUIEvent;
          } else if (ev.delta.type === "input_json_delta" && ev.delta.partial_json) {
            // Tool args streaming. Anthropic's API ties the delta to the
            // open content_block by index, which the SDK doesn't surface
            // here. We rely on the assistant-message handler to emit the
            // full TOOL_CALL_ARGS once `input` parses on the final message.
          } else if (ev.delta.type === "thinking_delta") {
            const delta = ev.delta.thinking;
            if (delta && currentReasoningId) {
              accumulatedReasoning += delta;
              yield {
                type: EventType.REASONING_MESSAGE_CONTENT,
                messageId: currentReasoningId,
                delta,
              } as AGUIEvent;
            }
          }
        } else if (ev.type === "content_block_stop") {
          // No event yet — wait for the SDKAssistantMessage authoritative
          // pass to close text/tool blocks consistently. Reasoning blocks
          // get explicitly closed when the next non-thinking block opens
          // (above) or when the assistant message arrives (below).
        }
        continue;
      }

      // assistant — authoritative end of one AIMessage. This is where we
      // persist (messages row + tool_calls rows) and emit *_END events.
      if (m.type === "assistant") {
        // By the time an assistant message arrives, the SDK has already
        // appended the user prompt to the session JSONL, so the file is
        // safe to tag. See pendingSessionId/flushSessionId above.
        flushSessionId();
        const am = m as SDKAssistantMessage;
        if (am.error) {
          // Close any in-flight reasoning/text blocks before surfacing the
          // error — stream_events may have already opened them before the
          // assistant message arrived carrying an error field.
          const endR = closeReasoningBlock();
          if (endR) yield endR;
          if (currentTextMsgId) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: currentTextMsgId,
            } as AGUIEvent;
          }
          yield {
            type: EventType.RUN_ERROR,
            code: mapAssistantError(am.error),
            message: am.error,
          } as AGUIEvent;
          return;
        }
        // Close any still-open reasoning block first — content_block_stop
        // for thinking doesn't carry the block type, so we wait until the
        // wrapping assistant message arrives to flush it.
        const endR = closeReasoningBlock();
        if (endR) yield endR;
        const content = am.message?.content;
        const blocks = Array.isArray(content) ? content : [];
        const textBlock = blocks.find((b) => b.type === "text");
        const toolUseBlocks = blocks.filter(
          (b): b is BetaToolUseBlock => b.type === "tool_use",
        );

        // Allocate a stable message id for THIS AIMessage. Reuse the
        // stream_event text id when there was one; otherwise synthesize a
        // fresh id (covers: tool-only AIMessage AND non-stream synth path).
        // Tool calls bound to this AIMessage will FK to messageId.
        let messageId: string;
        let textOpened: boolean;
        if (currentTextMsgId) {
          messageId = currentTextMsgId;
          textOpened = true;
        } else if (textBlock?.text) {
          // Synthesize START + CONTENT for the non-stream-event path.
          messageId = `msg_${nanoid(10)}`;
          accumulatedText = textBlock.text;
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: "assistant",
          } as AGUIEvent;
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: textBlock.text,
          } as AGUIEvent;
          textOpened = true;
        } else {
          // Tool-only or empty AIMessage — still allocate so tool_calls
          // have a valid parent row.
          messageId = `msg_${nanoid(10)}`;
          textOpened = false;
        }

        if (textOpened) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId,
          } as AGUIEvent;
        }

        // Persist the messages row UNCONDITIONALLY for AIMessages that have
        // any content — including tool-only — so the tool_calls FK is valid.
        // Heuristic phase: if the AIMessage ends with tool_use blocks, this
        // is an intermediate "reasoning" step; otherwise it's the conclusion.
        const phase: "reasoning" | "conclusion" =
          toolUseBlocks.length > 0 ? "reasoning" : "conclusion";
        await callbacks?.onMessageEnd?.({
          id: messageId,
          content: accumulatedText,
          reasoning: accumulatedReasoning || undefined,
          phase,
        });

        // Reset per-message accumulators BEFORE handling tool_use blocks so
        // any followup AIMessage starts clean.
        currentTextMsgId = null;
        accumulatedText = "";
        accumulatedReasoning = "";

        // Tool-use blocks: synthesize START (if streaming didn't), emit ARGS
        // + END, then persist the tool_calls row keyed to messageId.
        for (const block of toolUseBlocks) {
          let st = toolById.get(block.id);
          if (!st) {
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: block.id,
              toolCallName: block.name,
              parentMessageId: messageId,
            } as AGUIEvent;
            st = {
              id: block.id,
              toolName: block.name,
              argsBuf: "",
              parentMsgId: messageId,
              ended: false,
            };
            toolById.set(block.id, st);
          } else if (!st.parentMsgId) {
            // Stream_event captured the tool_use before any text block was
            // open; bind it to this AIMessage's id now.
            st.parentMsgId = messageId;
          }

          if (st.ended) continue; // already finalised earlier

          const argsJson = JSON.stringify(block.input ?? {});
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: argsJson,
          } as AGUIEvent;
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: block.id,
          } as AGUIEvent;
          st.ended = true;

          await callbacks?.onToolCallEnd?.({
            id: block.id,
            toolName: block.name,
            args: block.input,
            parentMessageId: st.parentMsgId ?? messageId,
          });
        }
        continue;
      }

      // user — tool_result blocks come back as a user message with
      // `parent_tool_use_id` set (subagent) or with `content[]` containing
      // tool_result entries. Emit TOOL_CALL_RESULT so the UI flips the
      // spinner to a checkmark + the tool_calls row gets `result`/`status`.
      if (m.type === "user") {
        const um = m as SDKUserMessage;
        const content = um.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const status = block.is_error ? "error" : "success";
            // result content can be a string, an array of content blocks, or
            // arbitrary structure; serialize a stable text form for the UI.
            const resultText =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
            yield {
              type: EventType.TOOL_CALL_RESULT,
              toolCallId: block.tool_use_id,
              content: resultText,
            } as AGUIEvent;
            await callbacks?.onToolCallResult?.({
              id: block.tool_use_id,
              result: block.content ?? null,
              status,
              errorMsg: block.is_error
                ? typeof block.content === "string"
                  ? block.content
                  : undefined
                : undefined,
            });
          }
        }
        continue;
      }

      // result — turn finished
      if (m.type === "result") {
        // Fallback flush — covers turns that end without ever emitting an
        // assistant message (errors, abort before first token). By result
        // the JSONL has at minimum the user prompt persisted.
        flushSessionId();
        const r = m as SDKResultMessage;
        // Usage callback — fired for both success and error results so that
        // cost and permission_denials are captured even on failed runs.
        if (callbacks?.onRunUsage) {
          const usage = (r as unknown as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          }).usage;
          const rExt = r as unknown as {
            total_cost_usd?: number;
            permission_denials?: unknown[];
            modelUsage?: Record<string, unknown>;
          };
          await callbacks.onRunUsage({
            runId,
            threadId,
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
            cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
            totalCostUsd: rExt.total_cost_usd ?? 0,
            permissionDenials: (rExt.permission_denials ?? []) as Parameters<NonNullable<typeof callbacks.onRunUsage>>[0]["permissionDenials"],
            model: rExt.modelUsage
              ? Object.keys(rExt.modelUsage)[0]
              : undefined,
          });
        }
        // Same close-reasoning safety as the assistant handler, in case the
        // turn ended without ever emitting an SDKAssistantMessage frame.
        const endR = closeReasoningBlock();
        if (endR) yield endR;
        // If the last AIMessage didn't close cleanly (no SDKAssistantMessage
        // arrived after stream_event), finalize here to keep persistence
        // contract.
        if (currentTextMsgId) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: currentTextMsgId,
          } as AGUIEvent;
          await callbacks?.onMessageEnd?.({
            id: currentTextMsgId,
            content: accumulatedText,
            reasoning: accumulatedReasoning || undefined,
            phase: "conclusion",
          });
          currentTextMsgId = null;
          accumulatedText = "";
          accumulatedReasoning = "";
        }
        if (r.is_error) {
          // r.is_error means r is SDKResultError — subtype is one of the
          // error_* literals and errors[] carries the detail strings.
          const re = r as { subtype: string; errors?: string[] };
          const subtype = re.subtype;
          yield {
            type: EventType.RUN_ERROR,
            code: mapResultErrorSubtype(subtype),
            message: re.errors?.[0] ?? subtype,
          } as AGUIEvent;
        } else {
          yield {
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
          } as AGUIEvent;
        }
        return;
      }
    }

    // Stream ended without `result` — defensive close.
    const endRfinal = closeReasoningBlock();
    if (endRfinal) yield endRfinal;
    if (currentTextMsgId) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: currentTextMsgId,
      } as AGUIEvent;
      await callbacks?.onMessageEnd?.({
        id: currentTextMsgId,
        content: accumulatedText,
        reasoning: accumulatedReasoning || undefined,
        phase: "conclusion",
      });
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
    } as AGUIEvent;
  } catch (err) {
    // Tag aborts so the frontend doesn't render "stream error" — the worker
    // appends a "已被用户中止" notice that already conveys the cancellation.
    // Covers both user-Stop and HITL-deny paths (both flow through aborter.abort()).
    const isAbort = err instanceof Error && err.name === "AbortError";
    yield {
      type: EventType.RUN_ERROR,
      message: err instanceof Error ? err.message : String(err),
      ...(isAbort ? { code: "CANCELLED" } : {}),
    } as AGUIEvent;
  }
}

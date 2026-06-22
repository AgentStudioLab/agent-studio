// Bridge contract tests — exercise the SDK → AG-UI translation against
// synthetic SDKMessage streams. The persistence regression these guard
// against: tool_use blocks emitted in a tool-only AIMessage (no text)
// must still get a parent messageId and trigger callbacks.onToolCallEnd
// with a non-null parentMessageId so the tool_calls row can FK back to
// messages.id. Before the fix, parentMessageId was null and runWorker
// silently skipped the INSERT, causing tool calls to vanish after refresh.

import { describe, expect, it } from "bun:test";
import { claudeSdkToAgui } from "./bridge";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderCallbacks } from "../core/provider-types";

interface OnMessageEndArg {
  id: string;
  content: string;
  reasoning?: string;
  phase?: "reasoning" | "conclusion";
}
interface OnToolCallEndArg {
  id: string;
  toolName: string;
  args: unknown;
  parentMessageId: string | null;
}
interface OnToolCallResultArg {
  id: string;
  result: unknown;
  status: "success" | "error";
  errorMsg?: string;
}

function makeCallbacks() {
  const messageEnds: OnMessageEndArg[] = [];
  const toolCallEnds: OnToolCallEndArg[] = [];
  const toolCallResults: OnToolCallResultArg[] = [];
  const callbacks: ProviderCallbacks = {
    onMessageEnd: (m) => {
      messageEnds.push(m);
    },
    onToolCallEnd: (t) => {
      toolCallEnds.push(t);
    },
    onToolCallResult: (t) => {
      toolCallResults.push(t);
    },
  };
  return { callbacks, messageEnds, toolCallEnds, toolCallResults };
}

async function drain(
  stream: AsyncIterable<{ type: string; [k: string]: unknown }>,
) {
  const out: { type: string; [k: string]: unknown }[] = [];
  for await (const ev of stream) out.push(ev as never);
  return out;
}

describe("bridge — assistant message persistence", () => {
  it("tool-only AIMessage persists messages row + tool_calls with valid FK", async () => {
    // Simulates a model that goes straight to a tool with no preamble.
    // Before fix: parentMessageId would be null → tool call orphaned.
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      // No stream_event text block — model goes directly to tool_use.
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_01",
              name: "Bash",
              input: { command: "ls" },
            },
          ],
        },
      };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "",
      };
    })();

    const { callbacks, messageEnds, toolCallEnds } = makeCallbacks();
    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    // Exactly one assistant message persisted, even though no text content.
    expect(messageEnds).toHaveLength(1);
    expect(messageEnds[0]!.content).toBe("");
    expect(messageEnds[0]!.phase).toBe("reasoning");

    // The tool call carries a valid parent — the just-persisted messageId.
    expect(toolCallEnds).toHaveLength(1);
    expect(toolCallEnds[0]!.parentMessageId).toBe(messageEnds[0]!.id);
    expect(toolCallEnds[0]!.toolName).toBe("Bash");
    expect(toolCallEnds[0]!.args).toEqual({ command: "ls" });

    // Wire events: RUN_STARTED + (TOOL_CALL_START + ARGS + END) + RUN_FINISHED.
    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "RUN_FINISHED",
    ]);
  });

  it("text-then-tool AIMessage uses streamed text msg id as parent", async () => {
    const sdkStream = (async function* () {
      // Stream_event opens text block first.
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "text" },
        },
      };
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "checking" },
        },
      };
      // Then tool_use block_start while text is still open.
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", id: "toolu_02", name: "Read" },
        },
      };
      // Full AIMessage arrives carrying both blocks.
      yield {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "checking" },
            {
              type: "tool_use",
              id: "toolu_02",
              name: "Read",
              input: { path: "/tmp/x" },
            },
          ],
        },
      };
      yield { type: "result", subtype: "success" };
    })();

    const { callbacks, messageEnds, toolCallEnds } = makeCallbacks();
    await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    expect(messageEnds).toHaveLength(1);
    expect(messageEnds[0]!.content).toBe("checking");
    expect(messageEnds[0]!.phase).toBe("reasoning");
    // tool call FK matches the streamed text msg id (single source of truth).
    expect(toolCallEnds).toHaveLength(1);
    expect(toolCallEnds[0]!.parentMessageId).toBe(messageEnds[0]!.id);
  });

  it("tool_result from SDK user message emits TOOL_CALL_RESULT + callback", async () => {
    const sdkStream = (async function* () {
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_03",
              name: "Bash",
              input: { command: "echo hi" },
            },
          ],
        },
      };
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_03",
              content: "hi\n",
              is_error: false,
            },
          ],
        },
      };
      yield { type: "result", subtype: "success" };
    })();

    const { callbacks, toolCallResults } = makeCallbacks();
    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    expect(toolCallResults).toHaveLength(1);
    expect(toolCallResults[0]!.id).toBe("toolu_03");
    expect(toolCallResults[0]!.status).toBe("success");
    expect(toolCallResults[0]!.result).toBe("hi\n");
    expect(events.some((e) => e.type === "TOOL_CALL_RESULT")).toBe(true);
  });

  it("multiple tool_use blocks in same AIMessage share the same parent", async () => {
    // Parallel tool calls — both must FK to the same assistant message row.
    const sdkStream = (async function* () {
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_a",
              name: "Read",
              input: { path: "/a" },
            },
            {
              type: "tool_use",
              id: "toolu_b",
              name: "Read",
              input: { path: "/b" },
            },
          ],
        },
      };
      yield { type: "result", subtype: "success" };
    })();

    const { callbacks, messageEnds, toolCallEnds } = makeCallbacks();
    await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    expect(messageEnds).toHaveLength(1);
    expect(toolCallEnds).toHaveLength(2);
    expect(toolCallEnds[0]!.parentMessageId).toBe(messageEnds[0]!.id);
    expect(toolCallEnds[1]!.parentMessageId).toBe(messageEnds[0]!.id);
  });

  it("streams thinking_delta as REASONING_MESSAGE_CONTENT (live UI fill)", async () => {
    // Reproduces the bug: bridge used to emit REASONING_START + accumulate
    // deltas privately into onMessageEnd's reasoning field, leaving the live
    // UI block empty (only filled in by /messages history GET on refresh).
    // After fix: each thinking_delta becomes a REASONING_MESSAGE_CONTENT
    // event on the wire so the reducer can grow the block in place.
    const sdkStream = (async function* () {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "thinking" },
        },
      };
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "Let me " },
        },
      };
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "plan." },
        },
      };
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text: "ok" }] },
      };
      yield { type: "result", subtype: "success" };
    })();

    const { callbacks, messageEnds } = makeCallbacks();
    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    // REASONING_START + 2x REASONING_MESSAGE_CONTENT + REASONING_END appear
    // on the wire, in order.
    const types = events.map((e) => e.type);
    expect(types).toContain("REASONING_START");
    expect(types).toContain("REASONING_END");

    const contents = events.filter((e) => e.type === "REASONING_MESSAGE_CONTENT");
    expect(contents).toHaveLength(2);
    expect((contents[0] as unknown as { delta: string }).delta).toBe("Let me ");
    expect((contents[1] as unknown as { delta: string }).delta).toBe("plan.");

    // All three reasoning events share the SAME messageId (the same block).
    const reasoningEvents = events.filter((e) =>
      String(e.type).startsWith("REASONING_"),
    );
    const ids = new Set(reasoningEvents.map((e) => (e as unknown as { messageId: string }).messageId));
    expect(ids.size).toBe(1);

    // The persisted reasoning column gets the full accumulated text — that's
    // what /conversations/:id/messages returns on refresh.
    expect(messageEnds[0]!.reasoning).toBe("Let me plan.");
  });

  it("error tool_result surfaces status=error in callback", async () => {
    const sdkStream = (async function* () {
      yield {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "toolu_e", name: "Bash", input: {} },
          ],
        },
      };
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_e",
              content: "command not found",
              is_error: true,
            },
          ],
        },
      };
      yield { type: "result", subtype: "success" };
    })();

    const { callbacks, toolCallResults } = makeCallbacks();
    await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    expect(toolCallResults[0]!.status).toBe("error");
    expect(toolCallResults[0]!.errorMsg).toBe("command not found");
  });
});

describe("bridge — agent task snapshots", () => {
  it("emits CUSTOM agent.tasks after TaskCreate result", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "task_create_1",
              name: "TaskCreate",
              input: {
                subject: "实现任务面板",
                description: "输入框上方展示 tasks",
                activeForm: "实现任务面板",
              },
            },
          ],
        },
      };
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "task_create_1",
              content: JSON.stringify({
                task: { id: "task_1", subject: "实现任务面板" },
              }),
            },
          ],
        },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "" };
    })();

    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
      }),
    );

    const taskEvent = events.find(
      (event) => event.type === "CUSTOM" && event.name === "agent.tasks",
    );
    expect(taskEvent?.value).toEqual({
      tasks: [
        {
          id: "task_1",
          subject: "实现任务面板",
          description: "输入框上方展示 tasks",
          activeForm: "实现任务面板",
          status: "pending",
          updatedAt: expect.any(Number),
        },
      ],
    });
  });

  it("emits CUSTOM agent.tasks when TaskCreate result is returned as text content block", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "task_create_block",
              name: "TaskCreate",
              input: {
                subject: "只读检查链路",
                description: "检查 SDK 到 UI 的任务链路",
              },
            },
          ],
        },
      };
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "task_create_block",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    task: { id: "task_block_1", subject: "只读检查链路" },
                  }),
                },
              ],
            },
          ],
        },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "" };
    })();

    const events = await drain(
      claudeSdkToAgui(sdkStream as AsyncIterable<SDKMessage>, {
        threadId: "t",
        runId: "r",
      }),
    );

    const taskEvent = events.find(
      (event) => event.type === "CUSTOM" && event.name === "agent.tasks",
    );
    expect(taskEvent?.value).toEqual({
      tasks: [
        {
          id: "task_block_1",
          subject: "只读检查链路",
          description: "检查 SDK 到 UI 的任务链路",
          status: "pending",
          updatedAt: expect.any(Number),
        },
      ],
    });
  });
});

describe("bridge — user prompt uuid capture (regenerate checkpoint)", () => {
  // With `extraArgs: { 'replay-user-messages': null }`, the SDK re-delivers
  // user prompts as SDKUserMessageReplay (isReplay:true) carrying the uuid
  // we need as the file-checkpoint id. The capture MUST include replays.
  it("captures the replayed prompt uuid (isReplay:true)", async () => {
    const captured: string[] = [];
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "user",
        uuid: "umsg_current",
        isReplay: true,
        message: { role: "user", content: "summarize the repo" },
      };
      yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        onUserMessageId: (u) => captured.push(u),
      }),
    );
    expect(captured).toContain("umsg_current");
  });

  it("keeps the latest prompt uuid; never a tool_result carrier", async () => {
    const captured: string[] = [];
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield { type: "user", uuid: "u_old", isReplay: true, message: { role: "user", content: "old q" } };
      yield {
        type: "user",
        uuid: "u_toolresult",
        isReplay: true,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "r", is_error: false }] },
      };
      yield { type: "user", uuid: "u_current", isReplay: true, message: { role: "user", content: "new q" } };
      yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        onUserMessageId: (u) => captured.push(u),
      }),
    );
    expect(captured).not.toContain("u_toolresult");
    expect(captured[captured.length - 1]).toBe("u_current");
  });

  it("does not re-emit TOOL_CALL_RESULT for replayed historical tool_results", async () => {
    const { callbacks, toolCallResults } = makeCallbacks();
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "user",
        uuid: "u_tr",
        isReplay: true,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "old", content: "x", is_error: false }] },
      };
      yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r", callbacks }),
    );
    expect(toolCallResults).toHaveLength(0);
    expect(events.some((e) => e.type === "TOOL_CALL_RESULT")).toBe(false);
  });

  it("still emits TOOL_CALL_RESULT for LIVE (non-replay) tool_results", async () => {
    const { callbacks, toolCallResults } = makeCallbacks();
    const sdkStream = (async function* () {
      yield {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "toolu_x", name: "Bash", input: {} }] },
      };
      yield {
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_x", content: "ok", is_error: false }] },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    await drain(claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r", callbacks }));
    expect(toolCallResults).toHaveLength(1);
    expect(toolCallResults[0]!.id).toBe("toolu_x");
  });
});

describe("bridge — usage callback", () => {
  it("invokes onRunUsage with totals from result.usage", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "done",
        session_id: "s1",
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 50,
        },
        total_cost_usd: 0.0123,
        permission_denials: [{ tool_name: "Bash", input: {} }],
      };
    })();

    const usageCalls: unknown[] = [];
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        callbacks: {
          onRunUsage: (u) => { usageCalls.push(u); },
        },
      }),
    );

    expect(usageCalls).toHaveLength(1);
    const call = usageCalls[0] as { inputTokens: number; outputTokens: number; cacheReadTokens: number; totalCostUsd: number };
    expect(call.inputTokens).toBe(100);
    expect(call.outputTokens).toBe(200);
    expect(call.cacheReadTokens).toBe(50);
    expect(call.totalCostUsd).toBe(0.0123);
  });
});

describe("bridge — retry + error events", () => {
  it("emits CUSTOM agent.retry on api_retry system message", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        max_retries: 5,
        retry_delay_ms: 1500,
        error_status: 503,
        error: "server_error",
      };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const retry = events.find((e) => e.type === "CUSTOM" && (e as { name?: string }).name === "agent.retry");
    expect(retry).toBeDefined();
    expect((retry as unknown as { value: { attempt: number } }).value.attempt).toBe(2);
    expect((retry as unknown as { value: { retryDelayMs: number } }).value.retryDelayMs).toBe(1500);
  });

  it("emits RUN_ERROR with AUTH_FAILED on assistant message error", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "assistant",
        message: { content: [] },
        error: "authentication_failed",
      };
      yield { type: "result", subtype: "error_during_execution", is_error: true, result: "" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const err = events.find((e) => e.type === "RUN_ERROR");
    expect(err).toBeDefined();
    expect((err as unknown as { code: string }).code).toBe("AUTH_FAILED");
  });

  it("emits RUN_ERROR with MAX_TURNS on result error_max_turns", async () => {
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield { type: "result", subtype: "error_max_turns", is_error: true, result: "" };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const err = events.find((e) => e.type === "RUN_ERROR");
    expect((err as unknown as { code: string }).code).toBe("MAX_TURNS");
  });

  it("closes in-flight text block before emitting RUN_ERROR on assistant error", async () => {
    // Reproduces: stream_event opened a text block, then the assistant message
    // arrives with an error field. The bridge must emit TEXT_MESSAGE_END before
    // RUN_ERROR so the frontend reducer doesn't have an unclosed text block.
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield {
        type: "stream_event",
        event: { type: "content_block_start", content_block: { type: "text" } },
      };
      yield {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } },
      };
      yield {
        type: "assistant",
        message: { content: [] },
        error: "rate_limit",
      };
    })();
    const events = await drain(
      claudeSdkToAgui(sdkStream as never, { threadId: "t", runId: "r" }),
    );
    const types = events.map((e) => e.type);
    // TEXT_MESSAGE_END must precede RUN_ERROR
    const endIdx = types.indexOf("TEXT_MESSAGE_END");
    const errIdx = types.indexOf("RUN_ERROR");
    expect(endIdx).toBeGreaterThan(-1);
    expect(errIdx).toBeGreaterThan(endIdx);
    expect((events[errIdx] as unknown as { code: string }).code).toBe("RATE_LIMIT");
  });
});

describe("bridge — onSessionId timing", () => {
  // Regression: tagSession at system/init races with SDK CLI's JSONL flush,
  // producing "Session not found in project directory" warnings. The fix
  // defers onSessionId until the first persisted message (assistant or
  // result), by which time the CLI has written the file.
  it("defers onSessionId until first assistant message", async () => {
    const fires: { at: string; sid: string }[] = [];
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      fires.push({ at: "after-init", sid: "(none yet)" });
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s1" };
    })();
    await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        onSessionId: (sid) => fires.push({ at: "callback", sid }),
      }),
    );
    // The callback must fire AFTER the after-init checkpoint and exactly once.
    expect(fires).toEqual([
      { at: "after-init", sid: "(none yet)" },
      { at: "callback", sid: "s1" },
    ]);
  });

  it("fires onSessionId at result when no assistant arrives", async () => {
    const fires: string[] = [];
    const sdkStream = (async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield { type: "result", subtype: "error_max_turns", is_error: true, result: "" };
    })();
    await drain(
      claudeSdkToAgui(sdkStream as never, {
        threadId: "t",
        runId: "r",
        onSessionId: (sid) => fires.push(sid),
      }),
    );
    expect(fires).toEqual(["s1"]);
  });
});

describe("claudeSdkToAgui — onInitMetadata", () => {
  it("invokes onInitMetadata when system.init carries mcp_servers + tools", async () => {
    const seenMeta: Array<{ mcpServers: unknown; tools: unknown }> = [];
    const stream = (async function* () {
      yield {
        type: "system",
        subtype: "init",
        session_id: "sess_1",
        mcp_servers: [
          { name: "github", status: "connected" },
          { name: "slack", status: "disconnected" },
        ],
        tools: ["Read", "Write", "mcp__github__list_issues"],
      } as never;
      yield { type: "result", subtype: "success", is_error: false } as never;
    })();

    for await (const _ev of claudeSdkToAgui(stream, {
      threadId: "t",
      runId: "r",
      onInitMetadata: (m) => seenMeta.push(m),
    })) {
      // drain
    }

    expect(seenMeta).toHaveLength(1);
    expect(seenMeta[0]!.mcpServers).toEqual([
      { name: "github", status: "connected" },
      { name: "slack", status: "disconnected" },
    ]);
    expect(seenMeta[0]!.tools).toEqual([
      "Read",
      "Write",
      "mcp__github__list_issues",
    ]);
  });

  it("invokes onInitMetadata with empty arrays when fields are missing", async () => {
    const seenMeta: Array<{ mcpServers: unknown; tools: unknown }> = [];
    const stream = (async function* () {
      yield { type: "system", session_id: "sess_1" } as never;
      yield { type: "result", subtype: "success", is_error: false } as never;
    })();
    for await (const _ev of claudeSdkToAgui(stream, {
      threadId: "t",
      runId: "r",
      onInitMetadata: (m) => seenMeta.push(m),
    })) {
      // drain
    }
    expect(seenMeta).toHaveLength(1);
    expect(seenMeta[0]!.mcpServers).toEqual([]);
    expect(seenMeta[0]!.tools).toEqual([]);
  });

  it("filters malformed mcp_servers entries and defaults missing status", async () => {
    const seenMeta: Array<{ mcpServers: unknown; tools: unknown }> = [];
    const stream = (async function* () {
      yield {
        type: "system",
        subtype: "init",
        session_id: "sess_1",
        mcp_servers: [
          { name: "good", status: "connected" },
          { name: 42 }, // bad: name not a string — should be dropped
          { name: "no-status" }, // missing status — should default to "unknown"
          { status: "connected" }, // bad: no name field — should be dropped
        ],
        tools: ["Read", 99, "Write"], // 99 should be filtered out
      } as never;
      yield { type: "result", subtype: "success", is_error: false } as never;
    })();
    for await (const _ev of claudeSdkToAgui(stream, {
      threadId: "t",
      runId: "r",
      onInitMetadata: (m) => seenMeta.push(m),
    })) {
      // drain
    }
    expect(seenMeta).toHaveLength(1);
    expect(seenMeta[0]!.mcpServers).toEqual([
      { name: "good", status: "connected" },
      { name: "no-status", status: "unknown" },
    ]);
    expect(seenMeta[0]!.tools).toEqual(["Read", "Write"]);
  });
});

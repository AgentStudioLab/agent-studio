// Bridge contract tests — exercise the SDK → AG-UI translation against
// synthetic SDKMessage streams. The persistence regression these guard
// against: tool_use blocks emitted in a tool-only AIMessage (no text)
// must still get a parent messageId and trigger callbacks.onToolCallEnd
// with a non-null parentMessageId so the tool_calls row can FK back to
// messages.id. Before the fix, parentMessageId was null and runWorker
// silently skipped the INSERT, causing tool calls to vanish after refresh.

import { describe, expect, it } from "bun:test";
import { claudeSdkToAgui } from "./bridge";
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
      claudeSdkToAgui(sdkStream, {
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
      claudeSdkToAgui(sdkStream, {
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
      claudeSdkToAgui(sdkStream, {
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
      claudeSdkToAgui(sdkStream, {
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
      claudeSdkToAgui(sdkStream, {
        threadId: "t",
        runId: "r",
        callbacks,
      }),
    );

    expect(toolCallResults[0]!.status).toBe("error");
    expect(toolCallResults[0]!.errorMsg).toBe("command not found");
  });
});

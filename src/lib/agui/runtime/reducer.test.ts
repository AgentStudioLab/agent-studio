import { describe, expect, it } from "bun:test";
import { applyEvent } from "./reducer";
import { createInitialState, type ChatState } from "./types";

describe("reducer — RUN_STARTED captures runStartedAt", () => {
  it("sets runStartedAt to a number on RUN_STARTED", () => {
    const buf = new Map<string, string>();
    const before = Date.now();
    const next = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const after = Date.now();
    expect(next.runStartedAt).toBeGreaterThanOrEqual(before);
    expect(next.runStartedAt).toBeLessThanOrEqual(after);
  });

  it("RUN_FINISHED clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    expect(started.runStartedAt).not.toBeNull();
    const finished = applyEvent(
      started,
      { type: "RUN_FINISHED", threadId: "t", runId: "r" },
      buf,
    );
    expect(finished.runStartedAt).toBeNull();
  });

  it("RUN_ERROR clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const errored = applyEvent(
      started,
      { type: "RUN_ERROR", message: "boom" },
      buf,
    );
    expect(errored.runStartedAt).toBeNull();
  });

  it("RUN_FINISHED(interrupt) keeps runStartedAt alive (HITL pause, not completion)", () => {
    // Elapsed timer should keep ticking while user reviews an approval card.
    // Removing this test would let a future "cleanup" of handleRunFinished's
    // interrupt branch silently break the UX.
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const interrupted = applyEvent(
      started,
      {
        type: "RUN_FINISHED",
        threadId: "t",
        runId: "r",
        outcome: "interrupt",
        interrupts: [],
      },
      buf,
    );
    expect(interrupted.runStartedAt).not.toBeNull();
    expect(interrupted.runStartedAt).toBe(started.runStartedAt);
  });
});

describe("reducer — process restart notice", () => {
  it("uses neutral waiting copy for process_restart", () => {
    const buf = new Map<string, string>();
    const next = applyEvent(
      createInitialState(),
      {
        type: "RUN_ERROR",
        code: "CANCELLED",
        reason: "process_restart",
        message: "process restart",
      },
      buf,
    );
    const turn = next.liveMessages[0];
    if (!turn || turn.role !== "assistant") throw new Error("expected assistant notice");
    const notice = turn.blocks[0];
    if (!notice || notice.kind !== "notice") throw new Error("expected notice");
    expect(notice.content).toBe("上次等待用户时应用被关闭，agent 已停止");
  });
});

describe("reducer — CUSTOM file.side_effects updates ToolCallView", () => {
  function makeStateWithBashCall(toolCallId: string): ChatState {
    const buf = new Map<string, string>();
    let state = createInitialState();
    state = applyEvent(state, { type: "RUN_STARTED", threadId: "t", runId: "r" }, buf);
    state = applyEvent(
      state,
      {
        type: "TOOL_CALL_START",
        toolCallId,
        toolCallName: "Bash",
        parentMessageId: "msg_1",
      },
      buf,
    );
    return state;
  }

  it("attaches sideEffects to the matching tool_call", () => {
    const buf = new Map<string, string>();
    const state = makeStateWithBashCall("tc_a");
    const next = applyEvent(
      state,
      {
        type: "CUSTOM",
        name: "file.side_effects",
        value: {
          toolCallId: "tc_a",
          files: [
            { path: "/work/out.pptx", kind: "created" },
            { path: "/work/log.txt", kind: "modified" },
          ],
        },
      },
      buf,
    );
    const turn = next.liveMessages[next.liveMessages.length - 1];
    if (turn?.role !== "assistant") throw new Error("expected assistant turn");
    const toolBlock = turn.blocks.find(
      (b) => b.kind === "tool_call" && b.toolCall.id === "tc_a",
    );
    if (!toolBlock || toolBlock.kind !== "tool_call") {
      throw new Error("expected tool_call block");
    }
    expect(toolBlock.toolCall.sideEffects).toEqual([
      { path: "/work/out.pptx", kind: "created" },
      { path: "/work/log.txt", kind: "modified" },
    ]);
  });

  it("filters out malformed entries", () => {
    const buf = new Map<string, string>();
    const state = makeStateWithBashCall("tc_b");
    const next = applyEvent(
      state,
      {
        type: "CUSTOM",
        name: "file.side_effects",
        value: {
          toolCallId: "tc_b",
          files: [
            { path: "/ok.md", kind: "created" },
            { path: "/missing-kind.md" }, // no kind
            { kind: "modified" }, // no path
            { path: "/bad-kind.md", kind: "deleted" }, // wrong kind
            "not-an-object",
            null,
          ],
        },
      },
      buf,
    );
    const turn = next.liveMessages[next.liveMessages.length - 1];
    if (turn?.role !== "assistant") throw new Error("expected assistant turn");
    const toolBlock = turn.blocks.find(
      (b) => b.kind === "tool_call" && b.toolCall.id === "tc_b",
    );
    if (!toolBlock || toolBlock.kind !== "tool_call") {
      throw new Error("expected tool_call block");
    }
    expect(toolBlock.toolCall.sideEffects).toEqual([
      { path: "/ok.md", kind: "created" },
    ]);
  });

  it("ignores event when toolCallId does not match any tool_call", () => {
    const buf = new Map<string, string>();
    const state = makeStateWithBashCall("tc_real");
    const next = applyEvent(
      state,
      {
        type: "CUSTOM",
        name: "file.side_effects",
        value: {
          toolCallId: "tc_nonexistent",
          files: [{ path: "/x.md", kind: "created" }],
        },
      },
      buf,
    );
    // State should pass through unchanged for the real tool_call.
    const turn = next.liveMessages[next.liveMessages.length - 1];
    if (turn?.role !== "assistant") throw new Error("expected assistant turn");
    const toolBlock = turn.blocks.find(
      (b) => b.kind === "tool_call" && b.toolCall.id === "tc_real",
    );
    if (!toolBlock || toolBlock.kind !== "tool_call") {
      throw new Error("expected tool_call block");
    }
    expect(toolBlock.toolCall.sideEffects).toBeUndefined();
  });
});

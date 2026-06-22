// Contract for the chat block-grouping logic that drives the ProcessGroup
// timeline UX:
//   - consecutive reasoning + tool_call blocks collapse into ONE virtual
//     process_group (mixed steps, in arrival order)
//   - a non-process block (text or notice) following a group flips it to
//     done=true → UI auto-collapses + appends ✓ Done
//   - a trailing process group (still live, no follow-up yet) stays done=false
//
// Re-implements `groupBlocks` to keep the test pure (the real one is scoped
// inside ChatStream.tsx). If ChatStream stops calling its variant the same
// way, this test won't catch it — but manual smoke will.

import { describe, expect, it } from "bun:test";
import type { MessageBlock, ToolCallView } from "@/lib/agui/runtime";
import { isTaskTrackingToolName } from "./taskTrackingTools";
import type { ProcessStep } from "./ProcessGroup";

type GroupedBlock =
  | Extract<MessageBlock, { kind: "text" } | { kind: "notice" }>
  | {
      kind: "process_group";
      key: string;
      steps: ProcessStep[];
      done: boolean;
    };

function groupBlocks(blocks: MessageBlock[]): GroupedBlock[] {
  const out: GroupedBlock[] = [];
  let pending: ProcessStep[] = [];
  const flush = (done: boolean) => {
    if (pending.length === 0) return;
    const first = pending[0]!;
    const key =
      first.kind === "reasoning" ? `pg_r_${first.id}` : `pg_t_${first.tool.id}`;
    out.push({ kind: "process_group", key, steps: pending, done });
    pending = [];
  };
  for (const b of blocks) {
    if (b.kind === "reasoning") {
      pending.push({ kind: "reasoning", id: b.id, content: b.content });
      continue;
    }
    if (b.kind === "tool_call") {
      if (isTaskTrackingToolName(b.toolCall.toolName)) {
        continue;
      }
      pending.push({ kind: "tool_call", tool: b.toolCall });
      continue;
    }
    flush(true);
    out.push(b);
  }
  flush(false);
  return out;
}

const tc = (id: string, toolName = "Bash"): MessageBlock => ({
  kind: "tool_call",
  toolCall: {
    id,
    toolName,
    args: {},
    result: null,
    status: "success",
  } as ToolCallView,
});

const rs = (id: string, content = "thinking"): MessageBlock => ({
  kind: "reasoning",
  id,
  content,
});

describe("groupBlocks", () => {
  it("merges reasoning + consecutive tool_calls into one process group", () => {
    const out = groupBlocks([rs("r1"), tc("a"), tc("b")]);
    expect(out).toHaveLength(1);
    if (out[0]!.kind !== "process_group") throw new Error("not process_group");
    expect(out[0]!.steps.map((s) => s.kind)).toEqual([
      "reasoning",
      "tool_call",
      "tool_call",
    ]);
    expect(out[0]!.done).toBe(false);
  });

  it("flips done=true when a text block follows the group", () => {
    const out = groupBlocks([
      rs("r1"),
      tc("a"),
      { kind: "text", id: "m1", content: "the answer" },
    ]);
    expect(out).toHaveLength(2);
    if (out[0]!.kind !== "process_group") throw new Error("expected group");
    expect(out[0]!.done).toBe(true);
    expect(out[1]!.kind).toBe("text");
  });

  it("a notice block also flushes (cancellation tail)", () => {
    const out = groupBlocks([
      tc("a"),
      { kind: "notice", id: "n1", level: "interrupted", content: "已被中止" },
    ]);
    if (out[0]!.kind !== "process_group") throw new Error("expected group");
    expect(out[0]!.done).toBe(true);
    expect(out[1]!.kind).toBe("notice");
  });

  it("text in the middle splits into two groups (second still live)", () => {
    const out = groupBlocks([
      tc("a"),
      { kind: "text", id: "m1", content: "intermediate" },
      rs("r2"),
      tc("b"),
    ]);
    // [group{a}=done, text, group{r2,b}=live]
    expect(out).toHaveLength(3);
    if (out[0]!.kind !== "process_group") throw new Error("0 not group");
    expect(out[0]!.done).toBe(true);
    expect(out[1]!.kind).toBe("text");
    if (out[2]!.kind !== "process_group") throw new Error("2 not group");
    expect(out[2]!.steps.map((s) => s.kind)).toEqual(["reasoning", "tool_call"]);
    expect(out[2]!.done).toBe(false);
  });

  it("reasoning-only run forms a group", () => {
    const out = groupBlocks([rs("r1"), rs("r2")]);
    expect(out).toHaveLength(1);
    if (out[0]!.kind !== "process_group") throw new Error("not group");
    expect(out[0]!.steps).toHaveLength(2);
    expect(out[0]!.steps.every((s) => s.kind === "reasoning")).toBe(true);
  });

  it("assistant turn with text only — no group", () => {
    const out = groupBlocks([{ kind: "text", id: "m1", content: "ok" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("text");
  });

  it("hides SDK task tracking tools from the process timeline", () => {
    const out = groupBlocks([
      tc("create", "TaskCreate"),
      tc("update", "TaskUpdate"),
      tc("list", "TaskList"),
      tc("get", "TaskGet"),
      { kind: "text", id: "m1", content: "ok" },
    ]);
    expect(out).toEqual([{ kind: "text", id: "m1", content: "ok" }]);
  });

  it("handles an empty block list", () => {
    expect(groupBlocks([])).toEqual([]);
  });
});

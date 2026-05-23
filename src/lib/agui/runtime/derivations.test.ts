import { describe, expect, it } from "bun:test";
import { deriveTodos, deriveTouchedFiles } from "./derivations";
import type { ChatState, MessageView } from "./types";
import { createInitialState } from "./types";

function withMessages(messages: MessageView[]): ChatState {
  return { ...createInitialState(), liveMessages: messages };
}

function todoToolCallBlock(
  toolCallId: string,
  todos: Array<{ content: string; activeForm?: string; status: string }>,
): MessageView {
  return {
    id: `msg_${toolCallId}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: {
          id: toolCallId,
          toolName: "TodoWrite",
          args: { todos },
          result: null,
          status: "pending",
        },
      },
    ],
  };
}

describe("deriveTodos", () => {
  it("returns empty array when no TodoWrite calls present", () => {
    expect(deriveTodos(createInitialState())).toEqual([]);
  });

  it("ignores non-TodoWrite tool calls", () => {
    const state = withMessages([
      {
        id: "m1",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "t1",
              toolName: "Read",
              args: { file_path: "/x" },
              result: null,
              status: "pending",
            },
          },
        ],
      },
    ]);
    expect(deriveTodos(state)).toEqual([]);
  });

  it("returns the todos array from the most recent TodoWrite call", () => {
    const state = withMessages([
      todoToolCallBlock("tc1", [
        { content: "old", status: "completed" },
      ]),
      todoToolCallBlock("tc2", [
        { content: "newest A", activeForm: "Doing A", status: "in_progress" },
        { content: "newest B", status: "pending" },
      ]),
    ]);
    expect(deriveTodos(state)).toEqual([
      { content: "newest A", activeForm: "Doing A", status: "in_progress" },
      { content: "newest B", status: "pending" },
    ]);
  });

  it("walks both historicalMessages and liveMessages, latest wins", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        todoToolCallBlock("tc1", [{ content: "h", status: "completed" }]),
      ],
      liveMessages: [
        todoToolCallBlock("tc2", [{ content: "l", status: "pending" }]),
      ],
    };
    expect(deriveTodos(state)).toEqual([
      { content: "l", status: "pending" },
    ]);
  });

  it("filters out malformed todo entries gracefully", () => {
    const state = withMessages([
      todoToolCallBlock("tc", [
        { content: "valid", status: "pending" },
        // @ts-expect-error — intentionally malformed
        { status: "pending" }, // no content
        // @ts-expect-error — intentionally malformed
        { content: "bad-status", status: "weird" },
      ]),
    ]);
    expect(deriveTodos(state)).toEqual([
      { content: "valid", status: "pending" },
    ]);
  });

  it("falls back to previous call when latest TodoWrite has all-malformed entries", () => {
    const state = withMessages([
      todoToolCallBlock("tc-good", [
        { content: "good", status: "pending" },
      ]),
      todoToolCallBlock("tc-bad", [
        // @ts-expect-error — all malformed
        { status: "pending" },
        // @ts-expect-error — all malformed
        { content: "wrong-status", status: "weird" },
      ]),
    ]);
    // tc-bad is more recent but produces null from extractTodosFromArgs
    // (all entries fail isTodoEntry on a non-empty input). The selector
    // must scan backward and return tc-good's todos.
    expect(deriveTodos(state)).toEqual([
      { content: "good", status: "pending" },
    ]);
  });
});

function fileToolCall(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
): MessageView {
  return {
    id: `msg_${id}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: { id, toolName, args, result: null, status: "success" },
      },
    ],
  };
}

describe("deriveTouchedFiles", () => {
  const CWD = "/work/proj";

  it("returns empty when no file tool calls", () => {
    expect(deriveTouchedFiles(createInitialState(), CWD)).toEqual([]);
  });

  it("collects Read/Write/Edit/MultiEdit/NotebookEdit, ignores others", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
      fileToolCall("b", "Write", { file_path: "/work/proj/b.ts" }),
      fileToolCall("c", "Edit", { file_path: "/work/proj/c.ts" }),
      fileToolCall("d", "MultiEdit", { file_path: "/work/proj/d.ts" }),
      fileToolCall("e", "NotebookEdit", { notebook_path: "/work/proj/e.ipynb" }),
      fileToolCall("f", "Bash", { command: "ls" }),
      fileToolCall("g", "Glob", { pattern: "*" }),
    ]);
    const got = deriveTouchedFiles(state, CWD).map((f) => f.relativePath).sort();
    expect(got).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ipynb"]);
  });

  it("filters out paths outside cwd", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
      fileToolCall("b", "Read", { file_path: "/home/user/.zshrc" }),
      fileToolCall("c", "Read", { file_path: "/work/other-proj/x.ts" }),
    ]);
    const paths = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    expect(paths).toEqual(["a.ts"]);
  });

  it("dedupes by path; lastTool reflects most recent action", () => {
    const state = withMessages([
      fileToolCall("a1", "Read", { file_path: "/work/proj/x.ts" }),
      fileToolCall("a2", "Edit", { file_path: "/work/proj/x.ts" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    expect(files[0]!.firstTool).toBe("Read");
    expect(files[0]!.lastTool).toBe("Edit");
  });

  it("first-seen Write marks file new=true; first-seen Read marks new=false", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/new.ts" }),
      fileToolCall("b", "Read", { file_path: "/work/proj/old.ts" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    const newOne = files.find((f) => f.relativePath === "new.ts");
    const oldOne = files.find((f) => f.relativePath === "old.ts");
    expect(newOne?.firstTool).toBe("Write");
    expect(oldOne?.firstTool).toBe("Read");
  });

  it("sorts by lastTouched descending (most-recent-action first)", () => {
    const state = withMessages([
      fileToolCall("1", "Read", { file_path: "/work/proj/early.ts" }),
      fileToolCall("2", "Read", { file_path: "/work/proj/middle.ts" }),
      fileToolCall("3", "Edit", { file_path: "/work/proj/early.ts" }),
    ]);
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // After edit, early.ts becomes most recent again
    expect(order).toEqual(["early.ts", "middle.ts"]);
  });

  it("returns empty when workingDir is null", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
    ]);
    expect(deriveTouchedFiles(state, null)).toEqual([]);
  });
});

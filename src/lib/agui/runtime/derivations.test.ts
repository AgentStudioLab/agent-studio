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

  it("collects Write/Edit/MultiEdit/NotebookEdit; skips Read-only files; ignores non-file tools", () => {
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
    // a.ts (Read-only) and bash/glob are excluded
    expect(got).toEqual(["b.ts", "c.ts", "d.ts", "e.ipynb"]);
  });

  it("filters out paths outside cwd", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/a.ts" }),
      fileToolCall("b", "Write", { file_path: "/home/user/.zshrc" }),
      fileToolCall("c", "Write", { file_path: "/work/other-proj/x.ts" }),
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

  it("firstTool is Write for new files; Read-only files are dropped entirely", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/new.ts" }),
      fileToolCall("b", "Read", { file_path: "/work/proj/read-only.ts" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files.map((f) => f.relativePath)).toEqual(["new.ts"]);
    expect(files[0]!.firstTool).toBe("Write");
  });

  it("sorts by lastTouched descending; drops Read-only", () => {
    const state = withMessages([
      fileToolCall("1", "Read", { file_path: "/work/proj/early.ts" }),
      fileToolCall("2", "Read", { file_path: "/work/proj/middle.ts" }),
      fileToolCall("3", "Edit", { file_path: "/work/proj/early.ts" }),
    ]);
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // middle.ts is Read-only and is dropped; early.ts has Edit so it stays
    expect(order).toEqual(["early.ts"]);
  });

  it("returns empty when workingDir is null", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.ts" }),
    ]);
    expect(deriveTouchedFiles(state, null)).toEqual([]);
  });

  it("ranks live-only file above historical-only file in sort", () => {
    // Even if the historical file's intra-history block index is higher
    // than the live file's intra-live block index, live should win.
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        fileToolCall("h1", "Write", { file_path: "/work/proj/old.ts" }),
        fileToolCall("h2", "Write", { file_path: "/work/proj/older.ts" }),
        fileToolCall("h3", "Write", { file_path: "/work/proj/oldest.ts" }),
      ],
      liveMessages: [
        fileToolCall("l1", "Write", { file_path: "/work/proj/fresh.ts" }),
      ],
    };
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // fresh.ts (live) must rank above any historical file
    expect(order[0]).toBe("fresh.ts");
  });

  it("dedupes same file across historical+live; firstSeenAt from historical, lastTouched from live", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        fileToolCall("h1", "Read", { file_path: "/work/proj/shared.ts" }),
      ],
      liveMessages: [
        fileToolCall("l1", "Edit", { file_path: "/work/proj/shared.ts" }),
      ],
    };
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    const f = files[0]!;
    expect(f.relativePath).toBe("shared.ts");
    expect(f.firstTool).toBe("Read");
    expect(f.lastTool).toBe("Edit");
    // lastTouched (set in live) must be strictly greater than firstSeenAt
    // (set in historical) — the offset mechanism guarantees this.
    expect(f.lastTouched).toBeGreaterThan(f.firstSeenAt);
  });
});

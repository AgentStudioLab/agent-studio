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
      fileToolCall("a", "Read", { file_path: "/work/proj/a.md" }),
      fileToolCall("b", "Write", { file_path: "/work/proj/b.md" }),
      fileToolCall("c", "Edit", { file_path: "/work/proj/c.md" }),
      fileToolCall("d", "MultiEdit", { file_path: "/work/proj/d.md" }),
      fileToolCall("e", "NotebookEdit", { notebook_path: "/work/proj/e.ipynb" }),
      fileToolCall("f", "Bash", { command: "ls" }),
      fileToolCall("g", "Glob", { pattern: "*" }),
    ]);
    const got = deriveTouchedFiles(state, CWD).map((f) => f.relativePath).sort();
    // a.md (Read-only) and bash/glob are excluded
    expect(got).toEqual(["b.md", "c.md", "d.md", "e.ipynb"]);
  });

  it("filters out paths outside cwd", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/a.md" }),
      fileToolCall("b", "Write", { file_path: "/home/user/.zshrc" }),
      fileToolCall("c", "Write", { file_path: "/work/other-proj/x.md" }),
    ]);
    const paths = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    expect(paths).toEqual(["a.md"]);
  });

  it("dedupes by path; lastTool reflects most recent action", () => {
    const state = withMessages([
      fileToolCall("a1", "Read", { file_path: "/work/proj/x.md" }),
      fileToolCall("a2", "Edit", { file_path: "/work/proj/x.md" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    expect(files[0]!.firstTool).toBe("Read");
    expect(files[0]!.lastTool).toBe("Edit");
  });

  it("firstTool is Write for new files; Read-only files are dropped entirely", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/new.md" }),
      fileToolCall("b", "Read", { file_path: "/work/proj/read-only.md" }),
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files.map((f) => f.relativePath)).toEqual(["new.md"]);
    expect(files[0]!.firstTool).toBe("Write");
  });

  it("sorts by lastTouched descending; drops Read-only", () => {
    const state = withMessages([
      fileToolCall("1", "Read", { file_path: "/work/proj/early.md" }),
      fileToolCall("2", "Read", { file_path: "/work/proj/middle.md" }),
      fileToolCall("3", "Edit", { file_path: "/work/proj/early.md" }),
    ]);
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // middle.md is Read-only and is dropped; early.md has Edit so it stays
    expect(order).toEqual(["early.md"]);
  });

  it("returns empty when workingDir is null", () => {
    const state = withMessages([
      fileToolCall("a", "Read", { file_path: "/work/proj/a.md" }),
    ]);
    expect(deriveTouchedFiles(state, null)).toEqual([]);
  });

  it("ranks live-only file above historical-only file in sort", () => {
    // Even if the historical file's intra-history block index is higher
    // than the live file's intra-live block index, live should win.
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        fileToolCall("h1", "Write", { file_path: "/work/proj/old.md" }),
        fileToolCall("h2", "Write", { file_path: "/work/proj/older.md" }),
        fileToolCall("h3", "Write", { file_path: "/work/proj/oldest.md" }),
      ],
      liveMessages: [
        fileToolCall("l1", "Write", { file_path: "/work/proj/fresh.md" }),
      ],
    };
    const order = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    // fresh.md (live) must rank above any historical file
    expect(order[0]).toBe("fresh.md");
  });

  it("dedupes same file across historical+live; firstSeenAt from historical, lastTouched from live", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        fileToolCall("h1", "Read", { file_path: "/work/proj/shared.md" }),
      ],
      liveMessages: [
        fileToolCall("l1", "Edit", { file_path: "/work/proj/shared.md" }),
      ],
    };
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    const f = files[0]!;
    expect(f.relativePath).toBe("shared.md");
    expect(f.firstTool).toBe("Read");
    expect(f.lastTool).toBe("Edit");
    // lastTouched (set in live) must be strictly greater than firstSeenAt
    // (set in historical) — the offset mechanism guarantees this.
    expect(f.lastTouched).toBeGreaterThan(f.firstSeenAt);
  });

  it("hides non-artifact extensions (.py, .sh, etc) even when Write produces them", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/script.py" }),
      fileToolCall("b", "Write", { file_path: "/work/proj/install.sh" }),
      fileToolCall("c", "Write", { file_path: "/work/proj/report.md" }),
    ]);
    const got = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    expect(got).toEqual(["report.md"]);
  });

  it("hides files with no extension", () => {
    const state = withMessages([
      fileToolCall("a", "Write", { file_path: "/work/proj/Makefile" }),
      fileToolCall("b", "Write", { file_path: "/work/proj/README.md" }),
    ]);
    const got = deriveTouchedFiles(state, CWD).map((f) => f.relativePath);
    expect(got).toEqual(["README.md"]);
  });

  it("includes files from Bash sideEffects (kind=created → firstTool=Write)", () => {
    const state = withMessages([
      {
        id: "msg_1",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "tc_bash",
              toolName: "Bash",
              args: { command: "python make_ppt.py" },
              result: { stdout: "done" },
              status: "success",
              sideEffects: [
                { path: "/work/proj/out.pptx", kind: "created" },
                { path: "/work/proj/log.md", kind: "modified" },
              ],
            },
          },
        ],
      },
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files.map((f) => f.relativePath).sort()).toEqual(["log.md", "out.pptx"]);
    const pptx = files.find((f) => f.relativePath === "out.pptx")!;
    const log = files.find((f) => f.relativePath === "log.md")!;
    expect(pptx.firstTool).toBe("Write");  // created → Write
    expect(log.firstTool).toBe("Edit");    // modified → Edit
  });

  it("Bash sideEffects with non-artifact extensions are also filtered", () => {
    const state = withMessages([
      {
        id: "msg_1",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "tc_bash",
              toolName: "Bash",
              args: { command: "cargo build" },
              result: { stdout: "ok" },
              status: "success",
              sideEffects: [
                { path: "/work/proj/target/debug/app", kind: "created" },
                { path: "/work/proj/Cargo.lock", kind: "modified" },
                { path: "/work/proj/build.log", kind: "created" },
              ],
            },
          },
        ],
      },
    ]);
    const files = deriveTouchedFiles(state, CWD);
    // "app" has no ext; ".lock" not whitelisted; ".log" not whitelisted — all filtered.
    expect(files).toEqual([]);
  });

  it("Bash sideEffects + Write together — same file from both sources dedupes", () => {
    const state = withMessages([
      {
        id: "msg_1",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "tc_write",
              toolName: "Write",
              args: { file_path: "/work/proj/shared.md" },
              result: null,
              status: "success",
            },
          },
          {
            kind: "tool_call",
            toolCall: {
              id: "tc_bash",
              toolName: "Bash",
              args: { command: "echo more >> shared.md" },
              result: { stdout: "" },
              status: "success",
              sideEffects: [{ path: "/work/proj/shared.md", kind: "modified" }],
            },
          },
        ],
      },
    ]);
    const files = deriveTouchedFiles(state, CWD);
    expect(files).toHaveLength(1);
    expect(files[0]!.firstTool).toBe("Write");  // first seen via Write tool call
    expect(files[0]!.lastTool).toBe("Edit");    // last touch via Bash sideEffect (kind=modified → Edit)
  });
});

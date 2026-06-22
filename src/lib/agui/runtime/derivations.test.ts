import { describe, expect, it } from "bun:test";
import {
  deriveAgentTasks,
  deriveAgentTasksFromMessages,
  deriveInvokedSkills,
  deriveProgressPhases,
  deriveTouchedFiles,
} from "./derivations";
import type { ChatState, MessageView } from "./types";
import { createInitialState } from "./types";

function withMessages(messages: MessageView[]): ChatState {
  return { ...createInitialState(), liveMessages: messages };
}

function taskToolCallBlock(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown = null,
): MessageView {
  return {
    id: `msg_${toolCallId}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: {
          id: toolCallId,
          toolName,
          args,
          result,
          status: result ? "success" : "pending",
        },
      },
    ],
  };
}

describe("deriveAgentTasks", () => {
  it("returns state.tasks when a snapshot has been replayed", () => {
    const state: ChatState = {
      ...createInitialState(),
      hasTaskSnapshot: true,
      tasks: [
        {
          id: "task_1",
          subject: "from snapshot",
          description: "",
          status: "completed",
          updatedAt: 1000,
        },
      ],
    };
    expect(deriveAgentTasks(state)).toEqual(state.tasks);
  });

  it("derives tasks from TaskCreate and TaskUpdate tool history when no snapshot exists", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          {
            subject: "写 normalizer",
            description: "覆盖 create/update",
            activeForm: "写 normalizer",
          },
          JSON.stringify({ task: { id: "task_1", subject: "写 normalizer" } }),
        ),
        taskToolCallBlock(
          "tc_update",
          "TaskUpdate",
          { taskId: "task_1", status: "completed" },
          JSON.stringify({ success: true, taskId: "task_1", updatedFields: ["status"] }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)).toEqual([
      {
        id: "task_1",
        subject: "写 normalizer",
        description: "覆盖 create/update",
        activeForm: "写 normalizer",
        status: "completed",
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it("replays task calls from raw historical and live messages without relying on snapshot state", () => {
    const historicalMessages = [
      taskToolCallBlock(
        "tc_create",
        "TaskCreate",
        { subject: "跨 run 任务", description: "先创建" },
        JSON.stringify({ task: { id: "task_1", subject: "跨 run 任务" } }),
      ),
    ];
    const liveMessages = [
      taskToolCallBlock(
        "tc_update",
        "TaskUpdate",
        { taskId: "task_1", status: "completed" },
        JSON.stringify({ success: true, taskId: "task_1", updatedFields: ["status"] }),
      ),
    ];

    expect(deriveAgentTasksFromMessages(historicalMessages, liveMessages)).toEqual([
      {
        id: "task_1",
        subject: "跨 run 任务",
        description: "先创建",
        status: "completed",
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it("can surface a TaskUpdate-only history when no agent.tasks snapshot was replayed", () => {
    const tasks = deriveAgentTasksFromMessages([
      taskToolCallBlock(
        "tc_update",
        "TaskUpdate",
        { taskId: "task_1", subject: "延迟同步任务", status: "in_progress" },
        JSON.stringify({ success: true, taskId: "task_1", updatedFields: ["subject", "status"] }),
      ),
    ]);

    expect(tasks).toEqual([
      {
        id: "task_1",
        subject: "延迟同步任务",
        description: "",
        status: "in_progress",
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it("removes deleted tasks from TaskUpdate tool history when no snapshot exists", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "写 normalizer" },
          JSON.stringify({ task: { id: "task_1", subject: "写 normalizer" } }),
        ),
        taskToolCallBlock(
          "tc_delete",
          "TaskUpdate",
          { taskId: "task_1", status: "deleted" },
          JSON.stringify({ success: true, taskId: "task_1", updatedFields: ["status"] }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)).toEqual([]);
  });

  it("ignores TaskUpdate when result reports failure", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "保留任务", description: "不能被失败结果修改" },
          JSON.stringify({ task: { id: "task_1", subject: "保留任务" } }),
        ),
        taskToolCallBlock(
          "tc_update",
          "TaskUpdate",
          { taskId: "task_1", status: "completed" },
          JSON.stringify({ success: false, taskId: "task_1" }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)[0]).toMatchObject({
      id: "task_1",
      status: "pending",
      description: "不能被失败结果修改",
    });
  });

  it("ignores TaskUpdate when result taskId is missing or mismatched", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "目标任务", description: "只能被匹配结果修改" },
          JSON.stringify({ task: { id: "task_1", subject: "目标任务" } }),
        ),
        taskToolCallBlock(
          "tc_missing_id",
          "TaskUpdate",
          { taskId: "task_1", status: "completed" },
          JSON.stringify({ success: true, updatedFields: ["status"] }),
        ),
        taskToolCallBlock(
          "tc_mismatch",
          "TaskUpdate",
          { taskId: "task_1", subject: "错误修改" },
          JSON.stringify({ success: true, taskId: "task_2", updatedFields: ["subject"] }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)[0]).toMatchObject({
      id: "task_1",
      subject: "目标任务",
      status: "pending",
      description: "只能被匹配结果修改",
    });
  });

  it("applies TaskUpdate when result omits success but taskId matches", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "兼容旧结果" },
          JSON.stringify({ task: { id: "task_1", subject: "兼容旧结果" } }),
        ),
        taskToolCallBlock(
          "tc_update",
          "TaskUpdate",
          { taskId: "task_1", status: "completed" },
          JSON.stringify({ taskId: "task_1", updatedFields: ["status"] }),
        ),
      ],
    };
    expect(deriveAgentTasks(state)[0]).toMatchObject({
      id: "task_1",
      status: "completed",
    });
  });

  it("resyncs fallback tasks from TaskList result", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "旧任务" },
          JSON.stringify({ task: { id: "old", subject: "旧任务" } }),
        ),
        taskToolCallBlock(
          "tc_list",
          "TaskList",
          {},
          {
            tasks: [
              { id: "task_1", subject: "列表任务 A", status: "running" },
              { id: "task_2", subject: "列表任务 B", status: "completed" },
              { id: "task_deleted", subject: "删除任务", status: "deleted" },
              { id: "task_bad", status: "pending" },
            ],
          },
        ),
      ],
    };
    expect(deriveAgentTasks(state)).toEqual([
      {
        id: "task_1",
        subject: "列表任务 A",
        description: "",
        status: "in_progress",
        updatedAt: expect.any(Number),
      },
      {
        id: "task_2",
        subject: "列表任务 B",
        description: "",
        status: "completed",
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it("upserts a fallback task from TaskGet result", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [
        taskToolCallBlock(
          "tc_create",
          "TaskCreate",
          { subject: "旧标题", description: "旧描述" },
          JSON.stringify({ task: { id: "task_1", subject: "旧标题" } }),
        ),
        taskToolCallBlock(
          "tc_get",
          "TaskGet",
          { taskId: "task_1" },
          {
            task: {
              id: "task_1",
              subject: "读取标题",
              description: "读取描述",
              status: "running",
            },
          },
        ),
      ],
    };
    expect(deriveAgentTasks(state)).toEqual([
      {
        id: "task_1",
        subject: "读取标题",
        description: "读取描述",
        status: "in_progress",
        updatedAt: expect.any(Number),
      },
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

function toolCallMsg(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  status: "pending" | "success" | "error" = "success",
): MessageView {
  return {
    id: `msg_${id}`,
    role: "assistant",
    blocks: [
      {
        kind: "tool_call",
        toolCall: { id, toolName, args, result: null, status },
      },
    ],
  };
}

describe("deriveProgressPhases", () => {
  it("idle initial state — all phases pending, none active", () => {
    const phases = deriveProgressPhases(createInitialState());
    expect(phases.map((p) => p.id)).toEqual(["context", "plan", "execute", "finish"]);
    expect(phases.every((p) => p.status === "pending")).toBe(true);
    expect(phases.every((p) => p.count === 0)).toBe(true);
  });

  it("running with no tool calls yet → plan active (agent is thinking)", () => {
    const state: ChatState = { ...createInitialState(), isRunning: true };
    const phases = deriveProgressPhases(state);
    expect(phases.find((p) => p.id === "plan")!.status).toBe("active");
    expect(phases.find((p) => p.id === "context")!.status).toBe("completed");
    expect(phases.find((p) => p.id === "execute")!.status).toBe("pending");
    expect(phases.find((p) => p.id === "finish")!.status).toBe("pending");
  });

  it("Read-only tools land in context phase", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
        toolCallMsg("b", "Glob", { pattern: "*.md" }),
      ],
    };
    const phases = deriveProgressPhases(state);
    const ctx = phases.find((p) => p.id === "context")!;
    expect(ctx.status).toBe("active");
    expect(ctx.count).toBe(2);
    expect(ctx.lastToolLabel).toBe("Glob *.md");
  });

  it("Task tools land in plan phase", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
        toolCallMsg("b", "TaskCreate", { subject: "Plan", description: "Plan work" }),
      ],
    };
    const phases = deriveProgressPhases(state);
    expect(phases.find((p) => p.id === "context")!.status).toBe("completed");
    expect(phases.find((p) => p.id === "plan")!.status).toBe("active");
    expect(phases.find((p) => p.id === "plan")!.count).toBe(1);
  });

  it("Write / Edit / Bash all land in execute phase", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
        toolCallMsg("b", "Write", { file_path: "/x/b.md" }),
        toolCallMsg("c", "Bash", { command: "python b.py" }),
        toolCallMsg("d", "Edit", { file_path: "/x/c.md" }),
      ],
    };
    const phases = deriveProgressPhases(state);
    const exec = phases.find((p) => p.id === "execute")!;
    expect(exec.status).toBe("active");
    expect(exec.count).toBe(3);
    expect(exec.lastToolLabel).toBe("Edit c.md");
  });

  it("run finished → finish phase is active, prior phases completed", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: false,
      runStartedAt: null,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
        toolCallMsg("b", "Write", { file_path: "/x/b.md" }, "success"),
      ],
    };
    const phases = deriveProgressPhases(state);
    expect(phases.find((p) => p.id === "context")!.status).toBe("completed");
    expect(phases.find((p) => p.id === "plan")!.status).toBe("completed"); // skipped → still completed
    expect(phases.find((p) => p.id === "execute")!.status).toBe("completed");
    expect(phases.find((p) => p.id === "finish")!.status).toBe("active");
  });

  it("skipped phase still renders completed when later phase is active", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/x/a.md" }),
        toolCallMsg("b", "Write", { file_path: "/x/b.md" }),
      ],
    };
    const phases = deriveProgressPhases(state);
    expect(phases.find((p) => p.id === "context")!.status).toBe("completed");
    // No Task tool was called, but execute is active → plan still renders as completed (skipped).
    expect(phases.find((p) => p.id === "plan")!.status).toBe("completed");
    expect(phases.find((p) => p.id === "plan")!.count).toBe(0);
    expect(phases.find((p) => p.id === "plan")!.lastToolLabel).toBe(null);
    expect(phases.find((p) => p.id === "execute")!.status).toBe("active");
  });

  it("uncategorized tool names (unknown MCP tools) are ignored", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "SomeRandomMCPTool", { foo: "bar" }),
      ],
    };
    const phases = deriveProgressPhases(state);
    // No categorized phase has activity — but assistant *output* would; here
    // there's no text/reasoning block either, so it falls through to "agent
    // composing" → plan active.
    expect(phases.find((p) => p.id === "plan")!.status).toBe("active");
    expect(phases.find((p) => p.id === "context")!.count).toBe(0);
  });

  it("walks both historical and live messages", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      historicalMessages: [toolCallMsg("h", "Read", { file_path: "/a.md" })],
      liveMessages: [toolCallMsg("l", "Write", { file_path: "/b.md" })],
    };
    const phases = deriveProgressPhases(state);
    expect(phases.find((p) => p.id === "context")!.count).toBe(1);
    expect(phases.find((p) => p.id === "execute")!.count).toBe(1);
    expect(phases.find((p) => p.id === "execute")!.status).toBe("active");
  });

  it("lastToolLabel uses labelForToolCall (basename for files)", () => {
    const state: ChatState = {
      ...createInitialState(),
      isRunning: true,
      liveMessages: [
        toolCallMsg("a", "Read", { file_path: "/Users/x/proj/sub/dir/file.md" }),
      ],
    };
    expect(
      deriveProgressPhases(state).find((p) => p.id === "context")!.lastToolLabel,
    ).toBe("Read file.md");
  });
});

describe("deriveInvokedSkills", () => {
  function skillCall(id: string, skill: unknown): MessageView {
    return {
      id: `msg_${id}`,
      role: "assistant",
      blocks: [
        {
          kind: "tool_call",
          toolCall: {
            id,
            toolName: "Skill",
            args: typeof skill === "object" && skill !== null ? skill : { skill },
            result: null,
            status: "pending",
          },
        },
      ],
    };
  }

  it("returns empty for state without Skill calls", () => {
    expect(deriveInvokedSkills(createInitialState())).toEqual([]);
  });

  it("extracts skill ids in first-invocation order, deduped", () => {
    const state = withMessages([
      skillCall("t1", "agent-studio:docx"),
      skillCall("t2", "agent-studio:xlsx"),
      skillCall("t3", "agent-studio:docx"), // 重复调用 → 去重
    ]);
    expect(deriveInvokedSkills(state)).toEqual([
      "agent-studio:docx",
      "agent-studio:xlsx",
    ]);
  });

  it("walks historical messages before live messages", () => {
    const state: ChatState = {
      ...createInitialState(),
      historicalMessages: [skillCall("h1", "skill-a")],
      liveMessages: [skillCall("l1", "skill-b")],
    };
    expect(deriveInvokedSkills(state)).toEqual(["skill-a", "skill-b"]);
  });

  it("ignores malformed args and other tools", () => {
    const state = withMessages([
      skillCall("t1", { notSkill: true }), // 无 skill 字段
      skillCall("t2", { skill: 42 }), // 非字符串
      {
        id: "m3",
        role: "assistant",
        blocks: [
          {
            kind: "tool_call",
            toolCall: {
              id: "t3",
              toolName: "Read",
              args: { skill: "not-a-skill-call" },
              result: null,
              status: "pending",
            },
          },
        ],
      },
    ]);
    expect(deriveInvokedSkills(state)).toEqual([]);
  });
});

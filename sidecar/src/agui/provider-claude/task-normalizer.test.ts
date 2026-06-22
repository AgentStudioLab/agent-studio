import { describe, expect, it } from "bun:test";
import {
  createTaskSnapshot,
  handleTaskToolCall,
  handleTaskToolResult,
} from "./task-normalizer";

describe("task normalizer", () => {
  it("creates a task from TaskCreate input and result", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: {
        subject: "实现 tasks UI",
        description: "在输入框上方展示任务列表",
        activeForm: "实现 tasks UI",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "实现 tasks UI" } },
    });
    expect(snapshot.tasks).toEqual([
      {
        id: "task_1",
        subject: "实现 tasks UI",
        description: "在输入框上方展示任务列表",
        activeForm: "实现 tasks UI",
        status: "pending",
        updatedAt: 1000,
      },
    ]);
  });

  it("updates status and activeForm from TaskUpdate when result succeeds", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "写测试", description: "覆盖 reducer" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "写测试" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_update",
      toolName: "TaskUpdate",
      input: {
        taskId: "task_1",
        status: "in_progress",
        activeForm: "正在写测试",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_update",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_1", updatedFields: ["status", "activeForm"] },
    });
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      status: "in_progress",
      activeForm: "正在写测试",
      updatedAt: 1000,
    });
  });

  it("deletes a task on TaskUpdate status deleted", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "旧任务", description: "会删除" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "旧任务" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_delete",
      toolName: "TaskUpdate",
      input: { taskId: "task_1", status: "deleted" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_delete",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_1", updatedFields: ["status"] },
    });
    expect(snapshot.tasks).toEqual([]);
  });

  it("resyncs from TaskList result", () => {
    const snapshot = handleTaskToolResult(createTaskSnapshot(2000), {
      toolCallId: "tc_list",
      toolName: "TaskList",
      result: {
        tasks: [
          { id: "a", subject: "A", status: "pending", blockedBy: [] },
          { id: "b", subject: "B", status: "completed", owner: "agent", blockedBy: [] },
        ],
      },
    });
    expect(snapshot.tasks).toEqual([
      {
        id: "a",
        subject: "A",
        description: "",
        status: "pending",
        updatedAt: 2000,
      },
      {
        id: "b",
        subject: "B",
        description: "",
        status: "completed",
        updatedAt: 2000,
      },
    ]);
  });

  it("ignores malformed payloads without throwing", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_bad",
      toolName: "TaskCreate",
      input: { description: "missing subject" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_bad",
      toolName: "TaskCreate",
      result: { task: { subject: "missing id" } },
    });
    expect(snapshot.tasks).toEqual([]);
  });
});

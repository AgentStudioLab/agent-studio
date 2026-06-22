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

  it("does not mutate a task when TaskUpdate result is missing taskId", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "保留任务", description: "不能被误改" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "保留任务" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_update_missing_id",
      toolName: "TaskUpdate",
      input: { taskId: "task_1", status: "completed" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_update_missing_id",
      toolName: "TaskUpdate",
      result: { success: true, updatedFields: ["status"] },
    });
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      status: "pending",
      description: "不能被误改",
    });
  });

  it("does not mutate a task when TaskUpdate result taskId is mismatched", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: { subject: "目标任务", description: "只能改自己" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "目标任务" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_update_mismatch",
      toolName: "TaskUpdate",
      input: { taskId: "task_1", status: "completed" },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_update_mismatch",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_2", updatedFields: ["status"] },
    });
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      status: "pending",
      description: "只能改自己",
    });
  });

  it("updates TaskUpdate string fields when the new value is empty", () => {
    let snapshot = createTaskSnapshot(1000);
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      input: {
        subject: "清理表单",
        description: "旧描述",
        activeForm: "正在清理",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_create",
      toolName: "TaskCreate",
      result: { task: { id: "task_1", subject: "清理表单" } },
    });
    snapshot = handleTaskToolCall(snapshot, {
      toolCallId: "tc_clear",
      toolName: "TaskUpdate",
      input: {
        taskId: "task_1",
        description: "",
        activeForm: "",
      },
    });
    snapshot = handleTaskToolResult(snapshot, {
      toolCallId: "tc_clear",
      toolName: "TaskUpdate",
      result: { success: true, taskId: "task_1", updatedFields: ["description", "activeForm"] },
    });
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task_1",
      description: "",
      activeForm: "",
    });
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

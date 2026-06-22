export type AgentTaskStatus = "pending" | "in_progress" | "completed";

export interface AgentTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTaskStatus;
  updatedAt: number;
}

interface PendingCreate {
  subject: string;
  description: string;
  activeForm?: string;
}

interface PendingUpdate {
  taskId: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: AgentTaskStatus | "deleted";
}

export interface TaskSnapshot {
  tasks: AgentTask[];
  pendingCreates: Record<string, PendingCreate>;
  pendingUpdates: Record<string, PendingUpdate>;
  now: number;
}

export interface TaskToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface TaskToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

const TASK_TOOL_NAMES = new Set([
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
]);

export function createTaskSnapshot(now = Date.now()): TaskSnapshot {
  return {
    tasks: [],
    pendingCreates: {},
    pendingUpdates: {},
    now,
  };
}

export function taskSnapshotValue(snapshot: TaskSnapshot): AgentTask[] {
  return snapshot.tasks;
}

export function isTaskToolName(name: string): boolean {
  return TASK_TOOL_NAMES.has(name);
}

export function handleTaskToolCall(
  snapshot: TaskSnapshot,
  call: TaskToolCall,
): TaskSnapshot {
  if (!isTaskToolName(call.toolName)) return snapshot;

  if (call.toolName === "TaskCreate") {
    const pending = parseCreateInput(call.input);
    if (!pending) return snapshot;
    return {
      ...snapshot,
      pendingCreates: {
        ...snapshot.pendingCreates,
        [call.toolCallId]: pending,
      },
    };
  }

  if (call.toolName === "TaskUpdate") {
    const pending = parseUpdateInput(call.input);
    if (!pending) return snapshot;
    return {
      ...snapshot,
      pendingUpdates: {
        ...snapshot.pendingUpdates,
        [call.toolCallId]: pending,
      },
    };
  }

  return snapshot;
}

export function handleTaskToolResult(
  snapshot: TaskSnapshot,
  result: TaskToolResult,
): TaskSnapshot {
  if (!isTaskToolName(result.toolName)) return snapshot;

  if (result.toolName === "TaskCreate") {
    return applyCreateResult(snapshot, result);
  }

  if (result.toolName === "TaskUpdate") {
    return applyUpdateResult(snapshot, result);
  }

  if (result.toolName === "TaskList") {
    return applyListResult(snapshot, result.result);
  }

  if (result.toolName === "TaskGet") {
    return applyGetResult(snapshot, result.result);
  }

  return snapshot;
}

function applyCreateResult(
  snapshot: TaskSnapshot,
  result: TaskToolResult,
): TaskSnapshot {
  const pending = snapshot.pendingCreates[result.toolCallId];
  const task = readRecord(result.result)?.task;
  const taskRecord = readRecord(task);
  const id = readString(taskRecord?.id);
  const resultSubject = readString(taskRecord?.subject);

  if (!pending || !id) return snapshot;

  const nextTask: AgentTask = {
    id,
    subject: pending.subject || resultSubject || "",
    description: pending.description,
    activeForm: pending.activeForm,
    status: "pending",
    updatedAt: snapshot.now,
  };

  const { [result.toolCallId]: _removed, ...pendingCreates } =
    snapshot.pendingCreates;

  return {
    ...snapshot,
    tasks: upsertTask(snapshot.tasks, nextTask),
    pendingCreates,
  };
}

function applyUpdateResult(
  snapshot: TaskSnapshot,
  result: TaskToolResult,
): TaskSnapshot {
  const pending = snapshot.pendingUpdates[result.toolCallId];
  const output = readRecord(result.result);
  if (!pending || output?.success !== true) return snapshot;

  const resultTaskId = readString(output.taskId);
  if (resultTaskId !== pending.taskId) return snapshot;

  const { [result.toolCallId]: _removed, ...pendingUpdates } =
    snapshot.pendingUpdates;

  if (pending.status === "deleted") {
    return {
      ...snapshot,
      tasks: snapshot.tasks.filter((task) => task.id !== pending.taskId),
      pendingUpdates,
    };
  }

  return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      if (task.id !== pending.taskId) return task;
      return {
        ...task,
        ...definedTaskPatch(pending),
        updatedAt: snapshot.now,
      };
    }),
    pendingUpdates,
  };
}

function applyListResult(snapshot: TaskSnapshot, result: unknown): TaskSnapshot {
  const tasks = readRecord(result)?.tasks;
  if (!Array.isArray(tasks)) return snapshot;

  const normalizedTasks = tasks
    .map((task) => normalizeListedTask(task, snapshot.now))
    .filter((task): task is AgentTask => Boolean(task));

  return {
    ...snapshot,
    tasks: normalizedTasks,
  };
}

function applyGetResult(snapshot: TaskSnapshot, result: unknown): TaskSnapshot {
  const task = normalizeFetchedTask(readRecord(result)?.task, snapshot.now);
  if (!task) return snapshot;

  return {
    ...snapshot,
    tasks: upsertTask(snapshot.tasks, task),
  };
}

function normalizeListedTask(value: unknown, now: number): AgentTask | null {
  const task = readRecord(value);
  const id = readString(task?.id);
  const subject = readString(task?.subject);
  const status = normalizeStatus(task?.status);
  if (!id || !subject || !status) return null;

  return {
    id,
    subject,
    description: "",
    status,
    updatedAt: now,
  };
}

function normalizeFetchedTask(value: unknown, now: number): AgentTask | null {
  const task = readRecord(value);
  const id = readString(task?.id);
  const subject = readString(task?.subject);
  const status = normalizeStatus(task?.status);
  if (!id || !subject || !status) return null;

  return {
    id,
    subject,
    description: readString(task?.description) ?? "",
    status,
    updatedAt: now,
  };
}

function parseCreateInput(input: unknown): PendingCreate | null {
  const record = readRecord(input);
  const subject = readString(record?.subject);
  if (!subject) return null;

  const activeForm = readString(record?.activeForm);
  return {
    subject,
    description: readString(record?.description) ?? "",
    ...(activeForm ? { activeForm } : {}),
  };
}

function parseUpdateInput(input: unknown): PendingUpdate | null {
  const record = readRecord(input);
  const taskId = readString(record?.taskId);
  if (!taskId) return null;

  const status = normalizeUpdateStatus(record?.status);
  const subject = readString(record?.subject);
  const description = readString(record?.description);
  const activeForm = readString(record?.activeForm);

  return {
    taskId,
    ...(status ? { status } : {}),
    ...(subject !== null ? { subject } : {}),
    ...(description !== null ? { description } : {}),
    ...(activeForm !== null ? { activeForm } : {}),
  };
}

function normalizeStatus(value: unknown): AgentTaskStatus | null {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  // SDK 历史/边缘负载里可能出现 running；UI 侧统一按进行中处理。
  if (value === "running") return "in_progress";
  return null;
}

function normalizeUpdateStatus(value: unknown): PendingUpdate["status"] | null {
  if (value === "deleted") return "deleted";
  return normalizeStatus(value);
}

function definedTaskPatch(update: PendingUpdate): Partial<AgentTask> {
  const patch: Partial<AgentTask> = {};
  if (update.subject !== undefined) patch.subject = update.subject;
  if (update.description !== undefined) patch.description = update.description;
  if (update.activeForm !== undefined) patch.activeForm = update.activeForm;
  if (update.status && update.status !== "deleted") patch.status = update.status;
  return patch;
}

function upsertTask(tasks: AgentTask[], nextTask: AgentTask): AgentTask[] {
  const index = tasks.findIndex((task) => task.id === nextTask.id);
  if (index === -1) return [...tasks, nextTask];

  const nextTasks = tasks.slice();
  nextTasks[index] = nextTask;
  return nextTasks;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

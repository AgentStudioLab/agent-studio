import type { AgentTask, ChatState, MessageView, ToolCallView } from "./types";

// ============ Progress phases (4-phase fixed pipeline) ============
//
// Manus / Cowork / ChatGPT-canvas style: the UI shows a fixed set of high-
// level phases instead of one row per tool call. Tool invocations are
// bucketed by name into a phase; the most recent phase is "active". This
// gives a stable progress feeling even for models that only expose coarse
// task snapshots or skip explicit planning tools on small tasks.

export type PhaseId = "context" | "plan" | "execute" | "finish";
export type PhaseStatus = "pending" | "active" | "completed";

export interface PhaseEntry {
  id: PhaseId;
  status: PhaseStatus;
  /** How many tool calls landed in this phase. 0 for finish. */
  count: number;
  /** Short label of the most recent tool call in this phase. null when count=0. */
  lastToolLabel: string | null;
}

const AGENT_TASK_STATUSES: ReadonlySet<AgentTask["status"]> = new Set([
  "pending",
  "in_progress",
  "completed",
]);

function normalizeAgentTaskStatus(value: unknown): AgentTask["status"] | null {
  if (typeof value !== "string") return null;
  if (AGENT_TASK_STATUSES.has(value as AgentTask["status"])) {
    return value as AgentTask["status"];
  }
  // SDK 历史/边缘负载里可能出现 running；UI 侧统一按进行中处理。
  return value === "running" ? "in_progress" : null;
}

function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function stringField(source: Record<string, unknown> | null, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function booleanField(source: Record<string, unknown> | null, key: string): boolean | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function parseCreatedTaskId(result: unknown): string | null {
  if (typeof result !== "string") return null;
  const match = /^Task #([^ ]+) created successfully:/u.exec(result);
  return match?.[1] ?? null;
}

function parseUpdatedTaskId(result: unknown): string | null {
  if (typeof result !== "string") return null;
  const match = /^Updated task #([^ ]+) /u.exec(result);
  return match?.[1] ?? null;
}

function upsertTask(tasks: Map<string, AgentTask>, task: AgentTask): void {
  tasks.set(task.id, task);
}

function normalizeTaskListItem(value: unknown, now: number): AgentTask | null {
  const task = asRecord(value);
  const id = stringField(task, "id");
  const subject = stringField(task, "subject");
  const status = normalizeAgentTaskStatus(task?.status);
  if (!id || !subject || !status) return null;

  return {
    id,
    subject,
    description: "",
    status,
    updatedAt: now,
  };
}

function normalizeTaskGetItem(value: unknown, now: number): AgentTask | null {
  const task = asRecord(value);
  const id = stringField(task, "id");
  const subject = stringField(task, "subject");
  const status = normalizeAgentTaskStatus(task?.status);
  if (!id || !subject || !status) return null;

  return {
    id,
    subject,
    description: stringField(task, "description") ?? "",
    status,
    updatedAt: now,
  };
}

function taskFromTaskCreate(tc: ToolCallView, now: number): AgentTask | null {
  const args = asRecord(tc.args);
  if (!args) return null;

  const result = asRecord(parseToolResult(tc.result));
  const resultTask = asRecord(result?.task);
  const id =
    stringField(resultTask, "id") ??
    stringField(result, "taskId") ??
    stringField(result, "id") ??
    parseCreatedTaskId(tc.result) ??
    stringField(args, "taskId") ??
    stringField(args, "id");
  const subject = stringField(resultTask, "subject") ?? stringField(args, "subject");
  if (!id || !subject) return null;

  const resultStatus = resultTask?.status;
  const argsStatus = args.status;
  const normalizedStatus =
    normalizeAgentTaskStatus(resultStatus) ??
    normalizeAgentTaskStatus(argsStatus) ??
    "pending";
  return {
    id,
    subject,
    description: stringField(resultTask, "description") ?? stringField(args, "description") ?? "",
    activeForm: stringField(resultTask, "activeForm") ?? stringField(args, "activeForm"),
    status: normalizedStatus,
    updatedAt: now,
  };
}

function applyTaskUpdate(tasks: Map<string, AgentTask>, tc: ToolCallView, now: number): void {
  const args = asRecord(tc.args);
  if (!args) return;

  const id = stringField(args, "taskId") ?? stringField(args, "id");
  if (!id) return;

  // TaskUpdate 的 result 可能只表示成功，也可能回传最新 task；args 是协议上
  // 最稳定的变更来源；但必须先确认 result 成功且 taskId 匹配，避免把失败
  // 或串线的工具结果误重放到 fallback 任务列表里。
  const result = asRecord(parseToolResult(tc.result));
  const textTaskId = parseUpdatedTaskId(tc.result);
  const resultTaskId = stringField(result, "taskId") ?? textTaskId;
  if ((!result && !textTaskId) || result?.success === false || resultTaskId !== id) return;

  const resultTask = asRecord(result?.task);
  const deleted =
    stringField(args, "status") === "deleted" ||
    booleanField(args, "deleted") === true ||
    booleanField(resultTask, "deleted") === true;
  if (deleted) {
    tasks.delete(id);
    return;
  }

  const existing = tasks.get(id) ?? {
    id,
    subject: stringField(args, "subject") ?? stringField(resultTask, "subject") ?? "",
    description: "",
    status: "pending",
    updatedAt: now,
  };

  const argsStatus = args.status;
  const resultStatus = resultTask?.status;
  const normalizedStatus =
    normalizeAgentTaskStatus(argsStatus) ??
    normalizeAgentTaskStatus(resultStatus) ??
    existing.status;
  const next: AgentTask = {
    ...existing,
    subject: stringField(args, "subject") ?? stringField(resultTask, "subject") ?? existing.subject,
    description: stringField(args, "description") ?? stringField(resultTask, "description") ?? existing.description,
    activeForm: stringField(args, "activeForm") ?? stringField(resultTask, "activeForm") ?? existing.activeForm,
    status: normalizedStatus,
    updatedAt: now,
  };
  upsertTask(tasks, next);
}

function applyTaskList(tasks: Map<string, AgentTask>, tc: ToolCallView, now: number): void {
  const result = asRecord(parseToolResult(tc.result));
  const resultTasks = result?.tasks;
  if (!Array.isArray(resultTasks)) return;

  tasks.clear();
  for (const item of resultTasks) {
    const task = normalizeTaskListItem(item, now);
    if (task) upsertTask(tasks, task);
  }
}

function applyTaskGet(tasks: Map<string, AgentTask>, tc: ToolCallView, now: number): void {
  const result = asRecord(parseToolResult(tc.result));
  const task = normalizeTaskGetItem(result?.task, now);
  if (task) upsertTask(tasks, task);
}

function taskCallsInTurns(messages: MessageView[]): ToolCallView[] {
  const out: ToolCallView[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const block of m.blocks) {
      if (
        block.kind === "tool_call" &&
        (
          block.toolCall.toolName === "TaskCreate" ||
          block.toolCall.toolName === "TaskUpdate" ||
          block.toolCall.toolName === "TaskList" ||
          block.toolCall.toolName === "TaskGet"
        )
      ) {
        out.push(block.toolCall);
      }
    }
  }
  return out;
}

/**
 * Derive the task list shown above the composer.
 *
 * Primary path: sidecar replays explicit `agent.tasks` snapshots into
 * `state.tasks`. Fallback path: older history may only contain Task tool
 * calls, so we replay create/update operations plus TaskList/TaskGet
 * readbacks in chronological order to recover a best-effort display list.
 */
export function deriveAgentTasks(state: ChatState): AgentTask[] {
  if (state.hasTaskSnapshot) {
    return deriveAgentTasksFromMessages([], state.liveMessages, state.tasks);
  }

  return deriveAgentTasksFromMessages(state.historicalMessages, state.liveMessages);
}

/**
 * Replay task tool calls directly from message views.
 *
 * This intentionally ignores `ChatState.hasTaskSnapshot` so runtime callers can
 * rebuild task state after replacing history without carrying a stale live
 * snapshot from a previous run/thread.
 */
export function deriveAgentTasksFromMessages(
  historicalMessages: MessageView[],
  liveMessages: MessageView[] = [],
  seedTasks: AgentTask[] = [],
): AgentTask[] {
  const calls = [
    ...taskCallsInTurns(historicalMessages),
    ...taskCallsInTurns(liveMessages),
  ];

  const tasks = new Map(seedTasks.map((task) => [task.id, task]));
  for (const call of calls) {
    const now = Date.now();
    if (call.toolName === "TaskCreate") {
      const task = taskFromTaskCreate(call, now);
      if (task) upsertTask(tasks, task);
      continue;
    }
    if (call.toolName === "TaskUpdate") {
      applyTaskUpdate(tasks, call, now);
      continue;
    }
    if (call.toolName === "TaskList") {
      applyTaskList(tasks, call, now);
      continue;
    }
    applyTaskGet(tasks, call, now);
  }
  return [...tasks.values()];
}

export type FileTool =
  | "Read"
  | "Write"
  | "Edit"
  | "MultiEdit"
  | "NotebookEdit";

const FILE_TOOLS: ReadonlySet<string> = new Set<FileTool>([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

/** Tools that produce or modify files — what Files Tab cares about. */
const MUTATION_TOOLS: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

/** File extensions surfaced as user-facing artifacts. Scripts/source code
 * (.py / .sh / .ts / .js / .go / .rs / ...) intentionally excluded — they
 * are usually internal tooling, not what the user asked the agent to make. */
const ARTIFACT_EXTENSIONS: ReadonlySet<string> = new Set([
  "md", "markdown", "txt", "rtf",
  "pdf", "docx", "doc",
  "pptx", "ppt", "key",
  "xlsx", "xls", "csv", "tsv", "ods",
  "json", "yaml", "yml", "toml", "xml",
  "html", "htm",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
  "zip", "tar", "gz", "tgz",
  "ipynb",
]);

function isArtifactPath(p: string): boolean {
  const lastSlash = p.lastIndexOf("/");
  const name = lastSlash >= 0 ? p.slice(lastSlash + 1) : p;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return false;
  return ARTIFACT_EXTENSIONS.has(name.slice(dotIdx + 1).toLowerCase());
}

export interface TouchedFile {
  absolutePath: string;
  relativePath: string;
  firstTool: FileTool;
  lastTool: FileTool;
  firstSeenAt: number;
  lastTouched: number;
}

function extractFilePath(toolName: string, args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const o = args as Record<string, unknown>;
  if (toolName === "NotebookEdit") {
    return typeof o.notebook_path === "string" ? o.notebook_path : null;
  }
  return typeof o.file_path === "string" ? o.file_path : null;
}

function fileCallsInOrder(
  messages: MessageView[],
  seqStart = 0,
): Array<{ tool: FileTool; path: string; seq: number }> {
  const out: Array<{ tool: FileTool; path: string; seq: number }> = [];
  let seq = seqStart;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const block of m.blocks) {
      seq++;
      if (block.kind !== "tool_call") continue;
      const toolName = block.toolCall.toolName;

      // 1. Mutation tools — direct file targets from args.
      if (FILE_TOOLS.has(toolName)) {
        const path = extractFilePath(toolName, block.toolCall.args);
        if (path) out.push({ tool: toolName as FileTool, path, seq });
      }

      // 2. Bash sideEffects — Bash indirectly produced/modified files.
      const sideEffects = block.toolCall.sideEffects;
      if (sideEffects && sideEffects.length > 0) {
        for (const eff of sideEffects) {
          // Map kind → FileTool: created → Write, modified → Edit. This lets
          // downstream code (Files Tab "new" badge, etc) treat Bash-produced
          // files uniformly with directly-written files.
          seq++;
          const mappedTool: FileTool = eff.kind === "created" ? "Write" : "Edit";
          out.push({ tool: mappedTool, path: eff.path, seq });
        }
      }
    }
  }
  return out;
}

/**
 * Cross-Run aggregate of files this thread's agent produced or modified
 * via Write / Edit / MultiEdit / NotebookEdit. Files the agent only Read
 * are collected internally (to preserve firstTool / firstSeenAt for
 * files that LATER get edited) but filtered from the return value.
 * Paths outside `workingDir` are dropped (system files like ~/.zshrc
 * shouldn't pollute the project file list).
 *
 * `seq` is a synthetic block-ordinal we assign during traversal.
 * Live calls' seqs strictly exceed historical calls' seqs (the live
 * pass starts its counter at the last historical seq), so dedupe and
 * sort consistently treat live as "after" historical even when a file
 * appears on both sides.
 *
 * Returns files sorted by lastTouched descending (most-recent action first).
 */
export function deriveTouchedFiles(
  state: ChatState,
  workingDir: string | null,
): TouchedFile[] {
  if (!workingDir) return [];
  const cwdPrefix = workingDir.endsWith("/") ? workingDir : workingDir + "/";
  const historicalCalls = fileCallsInOrder(state.historicalMessages, 0);
  // Live seqStart = last historical FILE-call seq. Inside fileCallsInOrder,
  // seq is incremented before each push, so the first live file call gets
  // lastHistoricalSeq + 1 — strictly above every historical file-call seq.
  const lastHistoricalSeq =
    historicalCalls.length > 0
      ? historicalCalls[historicalCalls.length - 1]!.seq
      : 0;
  const liveCalls = fileCallsInOrder(state.liveMessages, lastHistoricalSeq);
  const calls = [...historicalCalls, ...liveCalls];
  const map = new Map<string, TouchedFile>();
  const sawMutation = new Set<string>();
  for (const call of calls) {
    if (!call.path.startsWith(cwdPrefix)) continue;
    if (MUTATION_TOOLS.has(call.tool)) sawMutation.add(call.path);
    const relative = call.path.slice(cwdPrefix.length);
    const existing = map.get(call.path);
    if (existing) {
      map.set(call.path, {
        ...existing,
        lastTool: call.tool,
        lastTouched: call.seq,
      });
    } else {
      map.set(call.path, {
        absolutePath: call.path,
        relativePath: relative,
        firstTool: call.tool,
        lastTool: call.tool,
        firstSeenAt: call.seq,
        lastTouched: call.seq,
      });
    }
  }
  // Drop Read-only files (never saw a mutation): Files Tab shows only files
  // the agent produced or modified.
  for (const path of map.keys()) {
    if (!sawMutation.has(path)) map.delete(path);
  }
  // Drop non-artifact extensions (.py / .sh / .ts / etc — internal tooling
  // that the user didn't ask for as a deliverable).
  for (const path of [...map.keys()]) {
    if (!isArtifactPath(path)) map.delete(path);
  }
  return [...map.values()].sort((a, b) => b.lastTouched - a.lastTouched);
}

/** Truncate a string to N chars with a trailing ellipsis. */
function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function basenameFromArgs(args: unknown, key: string): string | null {
  if (typeof args !== "object" || args === null) return null;
  const v = (args as Record<string, unknown>)[key];
  if (typeof v !== "string" || v.length === 0) return null;
  const idx = v.lastIndexOf("/");
  return idx >= 0 ? v.slice(idx + 1) : v;
}

/** Build a short, human-readable label for a tool call. Used by the Process
 *  Tab fallback timeline when no explicit phase snapshot is available. */
function labelForToolCall(tc: ToolCallView): string {
  const args = tc.args;
  switch (tc.toolName) {
    case "Bash": {
      if (typeof args === "object" && args !== null) {
        const cmd = (args as { command?: unknown }).command;
        if (typeof cmd === "string") return truncate(cmd, 60);
      }
      return "Bash";
    }
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit": {
      const base = basenameFromArgs(args, "file_path");
      return base ? `${tc.toolName} ${base}` : tc.toolName;
    }
    case "NotebookEdit": {
      const base = basenameFromArgs(args, "notebook_path");
      return base ? `NotebookEdit ${base}` : "NotebookEdit";
    }
    case "Glob": {
      if (typeof args === "object" && args !== null) {
        const p = (args as { pattern?: unknown }).pattern;
        if (typeof p === "string") return `Glob ${truncate(p, 50)}`;
      }
      return "Glob";
    }
    case "Grep": {
      if (typeof args === "object" && args !== null) {
        const p = (args as { pattern?: unknown }).pattern;
        if (typeof p === "string") return `Grep ${truncate(p, 50)}`;
      }
      return "Grep";
    }
    case "WebFetch": {
      if (typeof args === "object" && args !== null) {
        const u = (args as { url?: unknown }).url;
        if (typeof u === "string") return `WebFetch ${truncate(u, 50)}`;
      }
      return "WebFetch";
    }
    case "WebSearch": {
      if (typeof args === "object" && args !== null) {
        const q = (args as { query?: unknown }).query;
        if (typeof q === "string") return `WebSearch ${truncate(q, 50)}`;
      }
      return "WebSearch";
    }
    case "TaskCreate":
      return "Task create";
    case "TaskUpdate":
      return "Task update";
    case "TaskGet":
      return "Task get";
    case "TaskList":
      return "Task list";
    default:
      return tc.toolName;
  }
}

// Tool-name → phase classification. Names not in any set are ignored.
// Bash is in "execute" because in practice DeepSeek/Claude use Bash for
// running scripts (mutations, builds, generators) more than for read-only
// inspection — we accept the slight mis-classification of `ls` / `find`.
const CONTEXT_TOOLS: ReadonlySet<string> = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "WebFetch",
  "WebSearch",
]);

const EXECUTE_TOOLS: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
]);

const TASK_TOOL_NAMES: ReadonlySet<string> = new Set([
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
]);

type CategorizablePhase = Exclude<PhaseId, "finish">;

const PHASE_ORDER: readonly PhaseId[] = ["context", "plan", "execute", "finish"];

function phaseForTool(name: string): CategorizablePhase | null {
  if (TASK_TOOL_NAMES.has(name)) return "plan";
  if (CONTEXT_TOOLS.has(name)) return "context";
  if (EXECUTE_TOOLS.has(name)) return "execute";
  return null;
}

/**
 * Returns the 4 fixed phases (context → plan → execute → finish) with
 * status and counts derived from the current ChatState. Heuristic rules:
 *
 *   - Each tool call increments exactly one phase's count (or zero if
 *     the tool name isn't categorizable, e.g. an MCP tool we haven't
 *     classified yet).
 *   - "active" phase is whichever phase the most recent tool call
 *     landed in — unless the run has finished (then "finish" is active),
 *     or the run is still running with zero tool calls so far (then
 *     "plan" is active to signal the agent is composing).
 *   - All phases before the active one render as "completed", even when
 *     count==0 — they were skipped, which we treat visually as "passed
 *     through". Phases after the active one are "pending".
 *   - With no run history at all (idle initial state), every phase is
 *     "pending" and there is no active phase.
 */
export function deriveProgressPhases(state: ChatState): PhaseEntry[] {
  const counts: Record<CategorizablePhase, number> = {
    context: 0,
    plan: 0,
    execute: 0,
  };
  const lastTool: Record<CategorizablePhase, ToolCallView | null> = {
    context: null,
    plan: null,
    execute: null,
  };

  let lastPhase: CategorizablePhase | null = null;
  let anyAssistantOutput = false;

  for (const list of [state.historicalMessages, state.liveMessages]) {
    for (const m of list) {
      if (m.role !== "assistant") continue;
      for (const block of m.blocks) {
        if (block.kind === "text" || block.kind === "reasoning") {
          anyAssistantOutput = true;
          continue;
        }
        if (block.kind !== "tool_call") continue;
        const p = phaseForTool(block.toolCall.toolName);
        if (!p) continue;
        counts[p]++;
        lastTool[p] = block.toolCall;
        lastPhase = p;
      }
    }
  }

  const hadActivity = lastPhase !== null || anyAssistantOutput;

  let activePhase: PhaseId | null;
  if (!hadActivity && !state.isRunning) {
    activePhase = null; // truly idle
  } else if (!state.isRunning) {
    activePhase = "finish"; // run ended
  } else if (lastPhase === null) {
    // Running but no tools yet — agent is thinking / composing the plan.
    activePhase = "plan";
  } else {
    activePhase = lastPhase;
  }

  const activeIdx = activePhase === null ? -1 : PHASE_ORDER.indexOf(activePhase);

  return PHASE_ORDER.map((id, idx): PhaseEntry => {
    let status: PhaseStatus;
    if (activeIdx === -1) status = "pending";
    else if (idx < activeIdx) status = "completed";
    else if (idx === activeIdx) status = "active";
    else status = "pending";

    if (id === "finish") {
      return { id, status, count: 0, lastToolLabel: null };
    }
    const cnt = counts[id];
    const lt = lastTool[id];
    return {
      id,
      status,
      count: cnt,
      lastToolLabel: lt ? labelForToolCall(lt) : null,
    };
  });
}


/**
 * 跨 Run 聚合本 thread 实际调用过的 skill（内置 `Skill` tool 的调用）。
 *
 * Context Tab 原本只读 sidecar 内存里的 SkillInvocationStore（run 期间由
 * PreToolUse hook 实时记录），sidecar 重启即清空 —— 历史会话重新打开时
 * 面板显示「未加载任何 skill」，与对话内容矛盾。而 Skill 调用本身就持久
 * 化在 run_events 的 tool_call block 里，这里直接从消息推导：历史会话
 * 回填 + live run 实时更新两者都覆盖（与 deriveTouchedFiles 同模式）。
 *
 * 返回 skill id 数组，按首次调用顺序去重。
 */
export function deriveInvokedSkills(state: ChatState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const messages of [state.historicalMessages, state.liveMessages]) {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const block of m.blocks) {
        if (block.kind !== "tool_call") continue;
        if (block.toolCall.toolName !== "Skill") continue;
        // 入参形状与 sidecar PreToolUse hook 一致：{ skill: "<id>" }
        const args = block.toolCall.args;
        if (typeof args !== "object" || args === null) continue;
        const skill = (args as Record<string, unknown>).skill;
        if (typeof skill !== "string" || !skill) continue;
        if (!seen.has(skill)) {
          seen.add(skill);
          out.push(skill);
        }
      }
    }
  }
  return out;
}

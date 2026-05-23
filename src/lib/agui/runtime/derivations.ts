import type { ChatState, MessageView, ToolCallView } from "./types";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoEntry {
  content: string;
  activeForm?: string;
  status: TodoStatus;
}

const TODO_STATUSES: ReadonlySet<TodoStatus> = new Set([
  "pending",
  "in_progress",
  "completed",
]);

function isTodoEntry(v: unknown): v is TodoEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.content !== "string" || o.content.length === 0) return false;
  if (typeof o.status !== "string") return false;
  if (!TODO_STATUSES.has(o.status as TodoStatus)) return false;
  if (o.activeForm !== undefined && typeof o.activeForm !== "string") return false;
  return true;
}

function extractTodosFromArgs(args: unknown): TodoEntry[] | null {
  if (typeof args !== "object" || args === null) return null;
  const todos = (args as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return null;
  const valid = todos.filter(isTodoEntry);
  // Return null only when an args-shaped TodoWrite produced ZERO valid
  // entries from a NON-EMPTY input list — that's a malformed call we want
  // to skip backward past. Empty input list returns [] (counts as "newest
  // call wins") and any-valid returns the filtered subset.
  return todos.length === 0 || valid.length > 0 ? valid : null;
}

function todoCallsInTurns(messages: MessageView[]): ToolCallView[] {
  const out: ToolCallView[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const block of m.blocks) {
      if (block.kind === "tool_call" && block.toolCall.toolName === "TodoWrite") {
        out.push(block.toolCall);
      }
    }
  }
  return out;
}

/**
 * Latest TodoWrite invocation's `todos` array. Walks historicalMessages
 * (DB-loaded) then liveMessages (streaming). The chronological assumption
 * is: messages are appended in order, so the LAST TodoWrite call across
 * both lists is the agent's current plan. Each TodoWrite is a full
 * replacement — agents call this whenever the plan changes.
 */
export function deriveTodos(state: ChatState): TodoEntry[] {
  const calls = [
    ...todoCallsInTurns(state.historicalMessages),
    ...todoCallsInTurns(state.liveMessages),
  ];
  for (let i = calls.length - 1; i >= 0; i--) {
    const todos = extractTodosFromArgs(calls[i]!.args);
    if (todos !== null) return todos;
  }
  return [];
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
      if (!FILE_TOOLS.has(toolName)) continue;
      const path = extractFilePath(toolName, block.toolCall.args);
      if (!path) continue;
      out.push({ tool: toolName as FileTool, path, seq });
    }
  }
  return out;
}

/**
 * Cross-Run aggregate of files this thread's agent has touched via
 * Read / Write / Edit / MultiEdit / NotebookEdit. Paths outside
 * `workingDir` are dropped (system files like ~/.zshrc shouldn't
 * pollute the project file list).
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
  for (const call of calls) {
    if (!call.path.startsWith(cwdPrefix)) continue;
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
  return [...map.values()].sort((a, b) => b.lastTouched - a.lastTouched);
}

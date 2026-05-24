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

export type ToolStepStatus = "pending" | "active" | "done" | "failed";

export interface ToolStep {
  id: string;
  toolName: string;
  /** Pre-computed short label for display (e.g., "Bash: ls -la"). */
  label: string;
  status: ToolStepStatus;
}

const TOOL_TIMELINE_CAP = 12;

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
 *  Tab fallback timeline when the agent never calls TodoWrite. */
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
    case "TodoWrite":
      return "Plan update";
    default:
      return tc.toolName;
  }
}

function statusForToolCall(
  tc: ToolCallView,
  isLastPending: boolean,
): ToolStepStatus {
  if (tc.status === "success") return "done";
  if (tc.status === "error") return "failed";
  // status === "pending"
  return isLastPending ? "active" : "pending";
}

/**
 * Linear walk of every tool_call in this thread, returned as the last
 * TOOL_TIMELINE_CAP steps. Used by Process Tab as a fallback when the
 * agent never invokes TodoWrite — gives the user *something* to see
 * while the agent is working.
 *
 * The most-recently-pending tool call is marked "active" so the user
 * sees a pulse on the current step. All earlier pending calls (rare —
 * happens only with parallel batches) stay "pending".
 */
export function deriveToolTimeline(state: ChatState): ToolStep[] {
  const collected: ToolCallView[] = [];
  for (const list of [state.historicalMessages, state.liveMessages]) {
    for (const m of list) {
      if (m.role !== "assistant") continue;
      for (const block of m.blocks) {
        if (block.kind === "tool_call") collected.push(block.toolCall);
      }
    }
  }
  // Find the last pending call's index in the FULL collected array, so we
  // mark exactly one "active" — even after slicing to the cap.
  let lastPendingIdx = -1;
  for (let i = collected.length - 1; i >= 0; i--) {
    if (collected[i]!.status === "pending") {
      lastPendingIdx = i;
      break;
    }
  }
  const sliceStart = Math.max(0, collected.length - TOOL_TIMELINE_CAP);
  const sliced = collected.slice(sliceStart);
  return sliced.map((tc, i) => ({
    id: tc.id,
    toolName: tc.toolName,
    label: labelForToolCall(tc),
    status: statusForToolCall(tc, sliceStart + i === lastPendingIdx),
  }));
}

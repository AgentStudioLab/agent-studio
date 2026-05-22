# Built-in tool schemas

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

All shapes are exported from `@anthropic-ai/claude-agent-sdk` as `ToolInputSchemas` / `ToolOutputSchemas` unions.

## TOC

- [`ToolInputSchemas` union](#toolinputschemas)
- [`ToolOutputSchemas` union](#tooloutputschemas)
- Per-tool input/output:
  - [Agent (Task alias)](#agent-task-alias)
  - [AskUserQuestion](#askuserquestion)
  - [Bash](#bash) / [Monitor](#monitor) / [TaskOutput](#taskoutput) / [TaskStop](#taskstop)
  - [Read](#read) / [Write](#write) / [Edit](#edit) / [NotebookEdit](#notebookedit)
  - [Glob](#glob) / [Grep](#grep)
  - [WebFetch](#webfetch) / [WebSearch](#websearch)
  - [TodoWrite (deprecated)](#todowrite) / [TaskCreate](#taskcreate) / [TaskGet](#taskget) / [TaskUpdate](#taskupdate) / [TaskList](#tasklist)
  - [ExitPlanMode](#exitplanmode)
  - [EnterWorktree](#enterworktree)
  - [ListMcpResources](#listmcpresources) / [ReadMcpResource](#readmcpresource)
- [`CallToolResult` (MCP)](#calltoolresult)

---

## `ToolInputSchemas`

```typescript
type ToolInputSchemas =
  | AgentInput
  | AskUserQuestionInput
  | BashInput
  | TaskOutputInput
  | EnterWorktreeInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | ListMcpResourcesInput
  | McpInput
  | MonitorInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | SubscribeMcpResourceInput
  | SubscribePollingInput
  | TaskCreateInput
  | TaskGetInput
  | TaskListInput
  | TaskStopInput
  | TaskUpdateInput
  | TodoWriteInput
  | UnsubscribeMcpResourceInput
  | UnsubscribePollingInput
  | WebFetchInput
  | WebSearchInput;
```

## `ToolOutputSchemas`

```typescript
type ToolOutputSchemas =
  | AgentOutput
  | AskUserQuestionOutput
  | BashOutput
  | EnterWorktreeOutput
  | ExitPlanModeOutput
  | FileEditOutput
  | FileReadOutput
  | FileWriteOutput
  | GlobOutput
  | GrepOutput
  | ListMcpResourcesOutput
  | MonitorOutput
  | NotebookEditOutput
  | ReadMcpResourceOutput
  | TaskCreateOutput
  | TaskGetOutput
  | TaskListOutput
  | TaskStopOutput
  | TaskUpdateOutput
  | TodoWriteOutput
  | WebFetchOutput
  | WebSearchOutput;
```

---

## Agent (Task alias)

**Tool name:** `Agent` (formerly `Task`, still accepted as an alias).

```typescript
type AgentInput = {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: "sonnet" | "opus" | "haiku";
  resume?: string;
  run_in_background?: boolean;
  max_turns?: number;
  name?: string;
  team_name?: string;
  mode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  isolation?: "worktree";
};
```

```typescript
type AgentOutput =
  | {
      status: "completed";
      agentId: string;
      content: Array<{ type: "text"; text: string }>;
      totalToolUseCount: number;
      totalDurationMs: number;
      totalTokens: number;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number | null;
        cache_read_input_tokens: number | null;
        server_tool_use: { web_search_requests: number; web_fetch_requests: number } | null;
        service_tier: ("standard" | "priority" | "batch") | null;
        cache_creation: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number } | null;
      };
      prompt: string;
    }
  | {
      status: "async_launched";
      agentId: string;
      description: string;
      prompt: string;
      outputFile: string;
      canReadOutputFile?: boolean;
    }
  | {
      status: "sub_agent_entered";
      description: string;
      message: string;
    };
```

Discriminate on `status`: `"completed"` = finished task, `"async_launched"` = background, `"sub_agent_entered"` = interactive subagent.

---

## AskUserQuestion

**Tool name:** `AskUserQuestion`.

```typescript
type AskUserQuestionInput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string; preview?: string }>;
    multiSelect: boolean;
  }>;
};

type AskUserQuestionOutput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string; preview?: string }>;
    multiSelect: boolean;
  }>;
  answers: Record<string, string>;
};
```

`preview` is only emitted when `toolConfig.askUserQuestion.previewFormat` is set on `Options`.

---

## Bash

**Tool name:** `Bash`.

```typescript
type BashInput = {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
};

type BashOutput = {
  stdout: string;
  stderr: string;
  rawOutputPath?: string;
  interrupted: boolean;
  isImage?: boolean;
  backgroundTaskId?: string;
  backgroundedByUser?: boolean;
  dangerouslyDisableSandbox?: boolean;
  returnCodeInterpretation?: string;
  structuredContent?: unknown[];
  persistedOutputPath?: string;
  persistedOutputSize?: number;
};
```

`run_in_background: true` returns immediately with `backgroundTaskId`. `dangerouslyDisableSandbox: true` requires `sandbox.allowUnsandboxedCommands: true` and is gated by `canUseTool` — see [sandbox.md](sandbox.md).

---

## Monitor

**Tool name:** `Monitor`.

```typescript
type MonitorInput = {
  command: string;
  description: string;
  timeout_ms?: number;
  persistent?: boolean;
};

type MonitorOutput = {
  taskId: string;
  timeoutMs: number;
  persistent?: boolean;
};
```

Runs a background script and pipes each stdout line as an event to Claude. Set `persistent: true` for session-length watches (log tail, etc.). Cancel early with `TaskStop`.

---

## TaskOutput

**Tool name:** `TaskOutput`.

```typescript
type TaskOutputInput = {
  task_id: string;
  block: boolean;
  timeout: number;
};
```

Retrieves output from a running or finished background task.

---

## TaskStop

**Tool name:** `TaskStop`.

```typescript
type TaskStopInput = {
  task_id?: string;
  shell_id?: string;     // deprecated, use task_id
};

type TaskStopOutput = {
  message: string;
  task_id: string;
  task_type: string;
  command?: string;
};
```

---

## Edit

**Tool name:** `Edit`.

```typescript
type FileEditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

type FileEditOutput = {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string;
  structuredPatch: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
  userModified: boolean;
  replaceAll: boolean;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
};
```

---

## Read

**Tool name:** `Read`.

```typescript
type FileReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string;            // for PDF page ranges, e.g. "1-5"
};

type FileReadOutput =
  | { type: "text"; file: { filePath; content; numLines; startLine; totalLines } }
  | { type: "image"; file: { base64; type; originalSize; dimensions? } }
  | { type: "notebook"; file: { filePath; cells: unknown[] } }
  | { type: "pdf"; file: { filePath; base64; originalSize } }
  | { type: "parts"; file: { filePath; originalSize; count; outputDir } };
```

Discriminate on `type`.

---

## Write

**Tool name:** `Write`.

```typescript
type FileWriteInput = {
  file_path: string;
  content: string;
};

type FileWriteOutput = {
  type: "create" | "update";
  filePath: string;
  content: string;
  structuredPatch: Array<{ oldStart; oldLines; newStart; newLines; lines: string[] }>;
  originalFile: string | null;
  gitDiff?: { filename; status: "modified" | "added"; additions; deletions; changes; patch };
};
```

---

## NotebookEdit

**Tool name:** `NotebookEdit`.

```typescript
type NotebookEditInput = {
  notebook_path: string;
  cell_id?: string;
  new_source: string;
  cell_type?: "code" | "markdown";
  edit_mode?: "replace" | "insert" | "delete";
};

type NotebookEditOutput = {
  new_source: string;
  cell_id?: string;
  cell_type: "code" | "markdown";
  language: string;
  edit_mode: string;
  error?: string;
  notebook_path: string;
  original_file: string;
  updated_file: string;
};
```

---

## Glob

**Tool name:** `Glob`.

```typescript
type GlobInput = {
  pattern: string;
  path?: string;
};

type GlobOutput = {
  durationMs: number;
  numFiles: number;
  filenames: string[];
  truncated: boolean;
};
```

Matches files by glob pattern. Returns paths sorted by mtime.

---

## Grep

**Tool name:** `Grep`.

```typescript
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  "-i"?: boolean;
  "-n"?: boolean;
  "-B"?: number;
  "-A"?: number;
  "-C"?: number;
  context?: number;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
};

type GrepOutput = {
  mode?: "content" | "files_with_matches" | "count";
  numFiles: number;
  filenames: string[];
  content?: string;
  numLines?: number;
  numMatches?: number;
  appliedLimit?: number;
  appliedOffset?: number;
};
```

ripgrep under the hood.

---

## WebFetch

**Tool name:** `WebFetch`.

```typescript
type WebFetchInput = {
  url: string;
  prompt: string;          // what the model should extract from the page
};

type WebFetchOutput = {
  bytes: number;
  code: number;
  codeText: string;
  result: string;
  durationMs: number;
  url: string;
};
```

---

## WebSearch

**Tool name:** `WebSearch`.

```typescript
type WebSearchInput = {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
};

type WebSearchOutput = {
  query: string;
  results: Array<
    | { tool_use_id: string; content: Array<{ title: string; url: string }> }
    | string
  >;
  durationSeconds: number;
};
```

---

## TodoWrite

**Tool name:** `TodoWrite`.

> **Note:** Since TypeScript Agent SDK 0.3.142, `TodoWrite` is **default-disabled**. Use `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` instead. Set `CLAUDE_CODE_ENABLE_TASKS=0` to restore `TodoWrite`.

```typescript
type TodoWriteInput = {
  todos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
};

type TodoWriteOutput = {
  oldTodos: Array<{ content; status; activeForm }>;
  newTodos: Array<{ content; status; activeForm }>;
};
```

---

## TaskCreate

**Tool name:** `TaskCreate`.

```typescript
type TaskCreateInput = {
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
};

type TaskCreateOutput = {
  task: { id: string; subject: string };
};
```

---

## TaskGet

**Tool name:** `TaskGet`.

```typescript
type TaskGetInput = { taskId: string };

type TaskGetOutput = {
  task: {
    id: string;
    subject: string;
    description: string;
    status: "pending" | "in_progress" | "completed";
    blocks: string[];
    blockedBy: string[];
  } | null;
};
```

---

## TaskUpdate

**Tool name:** `TaskUpdate`.

```typescript
type TaskUpdateInput = {
  taskId: string;
  status?: "pending" | "in_progress" | "completed" | "deleted";
  subject?: string;
  description?: string;
  activeForm?: string;
  addBlocks?: string[];
  addBlockedBy?: string[];
  owner?: string;
  metadata?: Record<string, unknown>;
};

type TaskUpdateOutput = {
  success: boolean;
  taskId: string;
  updatedFields: string[];
  error?: string;
  statusChange?: { from: string; to: string };
};
```

Set `status: "deleted"` to remove a task.

---

## TaskList

**Tool name:** `TaskList`.

```typescript
type TaskListInput = {};

type TaskListOutput = {
  tasks: Array<{
    id: string;
    subject: string;
    status: "pending" | "in_progress" | "completed";
    owner?: string;
    blockedBy: string[];
  }>;
};
```

---

## ExitPlanMode

**Tool name:** `ExitPlanMode`.

```typescript
type ExitPlanModeInput = {
  allowedPrompts?: Array<{ tool: "Bash"; prompt: string }>;
};

type ExitPlanModeOutput = {
  plan: string | null;
  isAgent: boolean;
  filePath?: string;
  hasTaskTool?: boolean;
  awaitingLeaderApproval?: boolean;
  requestId?: string;
};
```

Exit Plan Mode. Optionally specify Bash-prompt-based permissions needed for the plan.

---

## EnterWorktree

**Tool name:** `EnterWorktree`.

```typescript
type EnterWorktreeInput = {
  name?: string;
  path?: string;
};

type EnterWorktreeOutput = {
  worktreePath: string;
  worktreeBranch?: string;
  message: string;
};
```

`name` and `path` are mutually exclusive. With `path`, switch into an existing worktree; with `name`, create a new temporary one.

---

## ListMcpResources

**Tool name:** `ListMcpResources`.

```typescript
type ListMcpResourcesInput = { server?: string };

type ListMcpResourcesOutput = Array<{
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  server: string;
}>;
```

---

## ReadMcpResource

**Tool name:** `ReadMcpResource`.

```typescript
type ReadMcpResourceInput = {
  server: string;
  uri: string;
};

type ReadMcpResourceOutput = {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
};
```

---

## `CallToolResult`

MCP tool result type (from `@modelcontextprotocol/sdk/types.js`). What custom tools created with `tool()` return.

```typescript
type CallToolResult = {
  content: Array<{
    type: "text" | "image" | "resource";
    // other fields vary by type
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
```

`structuredContent` is a JSON object that can travel alongside `content` (including image blocks). See [Return structured data](https://docs.claude.com/zh-CN/agent-sdk/custom-tools#return-structured-data).

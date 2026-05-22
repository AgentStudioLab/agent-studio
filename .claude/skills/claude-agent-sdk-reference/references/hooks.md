# Hooks

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> + <https://docs.claude.com/zh-CN/agent-sdk/hooks>.

Hooks run **synchronously inside the CLI process**. They're faster than `canUseTool` (no round-trip to your application) but cannot do user-facing UI prompts. For HITL prompts use [`canUseTool`](permissions.md); for fast policy use hooks.

## TOC

- [`HookEvent`](#hookevent)
- [`HookCallback` / `HookCallbackMatcher`](#hookcallback)
- [`HookInput` union](#hookinput) — every event's input shape
- [`HookJSONOutput`](#hookjsonoutput) — sync vs async, all `hookSpecificOutput` shapes

## `HookEvent`

```typescript
type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "Notification"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PermissionRequest"
  | "Setup"
  | "TeammateIdle"
  | "TaskCompleted"
  | "ConfigChange"
  | "WorktreeCreate"
  | "WorktreeRemove";
```

## `HookCallback`

```typescript
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<HookJSONOutput>;
```

## `HookCallbackMatcher`

```typescript
interface HookCallbackMatcher {
  matcher?: string;        // e.g. "Bash" or "Bash(rm *)"
  hooks: HookCallback[];
  timeout?: number;        // seconds — applies to all hooks under this matcher
}
```

Wired via:

```typescript
options: {
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [async (input) => { /* ... */ return { /* ... */ }; }],
        timeout: 5,
      },
    ],
  },
}
```

## `HookInput`

```typescript
type HookInput =
  | PreToolUseHookInput
  | PostToolUseHookInput
  | PostToolUseFailureHookInput
  | PostToolBatchHookInput
  | NotificationHookInput
  | UserPromptSubmitHookInput
  | SessionStartHookInput
  | SessionEndHookInput
  | StopHookInput
  | SubagentStartHookInput
  | SubagentStopHookInput
  | PreCompactHookInput
  | PermissionRequestHookInput
  | SetupHookInput
  | TeammateIdleHookInput
  | TaskCompletedHookInput
  | ConfigChangeHookInput
  | WorktreeCreateHookInput
  | WorktreeRemoveHookInput;
```

### `BaseHookInput`

Shared base:

```typescript
type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  effort?: { level: string };
  agent_id?: string;
  agent_type?: string;
};
```

### Per-event inputs

```typescript
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
};

type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;            // structured output
  tool_use_id: string;
  duration_ms?: number;
};

type PostToolUseFailureHookInput = BaseHookInput & {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
  duration_ms?: number;
};

type PostToolBatchHookInput = BaseHookInput & {
  hook_event_name: "PostToolBatch";
  tool_calls: PostToolBatchToolCall[];
};
type PostToolBatchToolCall = {
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  tool_response?: unknown;           // serialized tool_result that the model sees
};

type NotificationHookInput = BaseHookInput & {
  hook_event_name: "Notification";
  message: string;
  title?: string;
  notification_type: string;
};

type UserPromptSubmitHookInput = BaseHookInput & {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};

type SessionStartHookInput = BaseHookInput & {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
  agent_type?: string;
  model?: string;
};

type SessionEndHookInput = BaseHookInput & {
  hook_event_name: "SessionEnd";
  reason: ExitReason;                 // from EXIT_REASONS array
};

type StopHookInput = BaseHookInput & {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message?: string;
  background_tasks?: BackgroundTaskSummary[];
  session_crons?: SessionCronSummary[];
};

type SubagentStartHookInput = BaseHookInput & {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
};

type SubagentStopHookInput = BaseHookInput & {
  hook_event_name: "SubagentStop";
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path: string;
  agent_type: string;
  last_assistant_message?: string;
  background_tasks?: BackgroundTaskSummary[];
  session_crons?: SessionCronSummary[];
};

type BackgroundTaskSummary = {
  id: string;
  type: string;
  status: string;
  description: string;
  command?: string;
  agent_type?: string;
  server?: string;
  tool?: string;
  name?: string;
};

type SessionCronSummary = {
  id: string;
  schedule: string;
  recurring: boolean;
  prompt: string;
};

type PreCompactHookInput = BaseHookInput & {
  hook_event_name: "PreCompact";
  trigger: "manual" | "auto";
  custom_instructions: string | null;
};

type PermissionRequestHookInput = BaseHookInput & {
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: unknown;
  permission_suggestions?: PermissionUpdate[];
};

type SetupHookInput = BaseHookInput & {
  hook_event_name: "Setup";
  trigger: "init" | "maintenance";
};

type TeammateIdleHookInput = BaseHookInput & {
  hook_event_name: "TeammateIdle";
  teammate_name: string;
  team_name: string;
};

type TaskCompletedHookInput = BaseHookInput & {
  hook_event_name: "TaskCompleted";
  task_id: string;
  task_subject: string;
  task_description?: string;
  teammate_name?: string;
  team_name?: string;
};

type ConfigChangeHookInput = BaseHookInput & {
  hook_event_name: "ConfigChange";
  source: "user_settings" | "project_settings" | "local_settings" | "policy_settings" | "skills";
  file_path?: string;
};

type WorktreeCreateHookInput = BaseHookInput & {
  hook_event_name: "WorktreeCreate";
  name: string;
};

type WorktreeRemoveHookInput = BaseHookInput & {
  hook_event_name: "WorktreeRemove";
  worktree_path: string;
};
```

## `HookJSONOutput`

A hook returns one of two shapes.

```typescript
type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput;
```

### Async

Defer to an out-of-band decision (the SDK pauses, waits for an async resolution):

```typescript
type AsyncHookJSONOutput = {
  async: true;
  asyncTimeout?: number;
};
```

### Sync

```typescript
type SyncHookJSONOutput = {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  systemMessage?: string;
  reason?: string;
  hookSpecificOutput?: HookSpecificOutput;
};
```

### `hookSpecificOutput`

Discriminated by `hookEventName`. The interesting shapes:

```typescript
// PreToolUse — gate or modify the tool call
{
  hookEventName: "PreToolUse";
  permissionDecision?: "allow" | "deny" | "ask" | "defer";
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
}

// PostToolUse — inject context for the next turn, or override what the model sees as the tool result
{
  hookEventName: "PostToolUse";
  additionalContext?: string;
  updatedToolOutput?: unknown;
  /** @deprecated use updatedToolOutput, which works for all tools */
  updatedMCPToolOutput?: unknown;
}

// UserPromptSubmit / SessionStart / Setup / SubagentStart / PostToolUseFailure /
// PostToolBatch / Notification — all support additionalContext
{
  hookEventName: "UserPromptSubmit" | "SessionStart" | "Setup" | "SubagentStart"
               | "PostToolUseFailure" | "PostToolBatch" | "Notification";
  additionalContext?: string;
}

// PermissionRequest — embed a full permission decision
{
  hookEventName: "PermissionRequest";
  decision:
    | {
        behavior: "allow";
        updatedInput?: Record<string, unknown>;
        updatedPermissions?: PermissionUpdate[];
      }
    | {
        behavior: "deny";
        message?: string;
        interrupt?: boolean;
      };
}
```

### `PreToolUse.permissionDecision: "defer"`

Special — defers the decision to your application out-of-band. The query terminates with `stop_reason: "tool_deferred"` and `deferred_tool_use` carries the pending tool's `id` / `name` / `input`. Resume with the same `session_id` to continue. See [Defer a tool call](https://docs.claude.com/zh-CN/hooks#defer-a-tool-call-for-later) for the round-trip.

## When to use hooks vs `canUseTool`

| Need | Use |
|---|---|
| Apply fixed policy fast, no UI | `PreToolUse` hook with `permissionDecision: "deny"` or `"allow"` |
| Mutate tool input before run (sanitize path, redact secret) | `PreToolUse` hook with `updatedInput` |
| Inject extra context after a tool runs | `PostToolUse` hook with `additionalContext` |
| Show user a confirmation card | `canUseTool` — see [permissions.md](permissions.md) |
| Block specific dangerous commands | `disallowedTools: ["Bash(rm -rf *)"]` (no hook needed) |
| Log all tool calls | `PostToolUse` hook |
| End the run on bad input | `Stop` or `PreToolUse` with `continue: false` |

`includeHookEvents: true` surfaces hook lifecycle in the SDK message stream (`SDKHookStartedMessage` / `SDKHookProgressMessage` / `SDKHookResponseMessage`) — useful for debugging.

## `BackgroundTaskSummary` and `SessionCronSummary`

Already shown above in the `Stop`/`SubagentStop` inputs. Both surface on `Stop` so your hook can decide whether to wait for backgrounded work before terminating.

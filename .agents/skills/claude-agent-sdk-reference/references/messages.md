# Messages — the `SDKMessage` union

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

Every shape the `query()` async generator can yield.

## TOC

- [`SDKMessage`](#sdkmessage) — the discriminated union
- [Assistant / user / replay](#assistantuserreplay)
- [`SDKResultMessage`](#sdkresultmessage)
- [`SDKSystemMessage`](#sdksystemmessage) — `init`
- [`SDKPartialAssistantMessage`](#sdkpartialassistantmessage) — `stream_event` (per-token)
- [`SDKCompactBoundaryMessage`](#sdkcompactboundarymessage)
- [`SDKPluginInstallMessage`](#sdkplugininstallmessage)
- [`SDKPermissionDeniedMessage` and `SDKPermissionDenial`](#permission-denial)
- [Hook lifecycle events](#hook-lifecycle) — `hook_started` / `hook_progress` / `hook_response`
- [Task events](#task-events) — `task_started` / `task_progress` / `task_updated` / `task_notification`
- [Other](#other) — auth status, tool progress, rate limit, etc.
- [`SDKMessageOrigin`](#sdkmessageorigin)
- [`ModelUsage` / `Usage` / `NonNullableUsage`](#usage)

---

## `SDKMessage`

```typescript
type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKPluginInstallMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskUpdatedMessage
  | SDKSessionStateChangedMessage
  | SDKNotificationMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage
  | SDKMemoryRecallMessage
  | SDKRateLimitEvent
  | SDKElicitationCompleteMessage
  | SDKPermissionDeniedMessage
  | SDKPromptSuggestionMessage
  | SDKAPIRetryMessage
  | SDKMirrorErrorMessage;
```

Discriminate by `type` first, then `subtype` for `"system"`-typed messages.

---

## Assistant / user / replay

### `SDKAssistantMessage`

```typescript
type SDKAssistantMessage = {
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: BetaMessage;            // from @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;
};
```

`message` is a [`BetaMessage`](https://platform.claude.com/docs/zh-CN/api/messages/create) — `id`, `content`, `model`, `stop_reason`, `usage`, etc.

`SDKAssistantMessageError` is one of:
`'authentication_failed' | 'oauth_org_not_allowed' | 'billing_error' | 'rate_limit' | 'invalid_request' | 'model_not_found' | 'server_error' | 'max_output_tokens' | 'unknown'`.

### `SDKUserMessage`

```typescript
type SDKUserMessage = {
  type: "user";
  uuid?: UUID;
  session_id?: string;
  message: MessageParam;           // from @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  shouldQuery?: boolean;
  tool_use_result?: unknown;
  origin?: SDKMessageOrigin;
};
```

**`shouldQuery: false`** appends the message to the transcript **without triggering an assistant turn**. Useful for injecting out-of-band context (e.g. output of a command you ran) without spending a model call. The injected message is merged into the next triggering user message.

### `SDKUserMessageReplay`

```typescript
type SDKUserMessageReplay = {
  type: "user";
  uuid: UUID;
  session_id: string;
  message: MessageParam;
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown;
  origin?: SDKMessageOrigin;
  isReplay: true;
};
```

Emitted when replaying historical user messages (e.g. during resume).

---

## `SDKResultMessage`

Final result.

```typescript
type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      api_error_status?: number | null;
      num_turns: number;
      result: string;
      stop_reason: string | null;
      ttft_ms?: number;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      structured_output?: unknown;
      deferred_tool_use?: { id: string; name: string; input: Record<string, unknown> };
      terminal_reason?: TerminalReason;
      fast_mode_state?: FastModeState;
      origin?: SDKMessageOrigin;
    }
  | {
      type: "result";
      subtype:
        | "error_max_turns"
        | "error_during_execution"
        | "error_max_budget_usd"
        | "error_max_structured_output_retries";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      stop_reason: string | null;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      errors: string[];
      terminal_reason?: TerminalReason;
      fast_mode_state?: FastModeState;
      origin?: SDKMessageOrigin;
    };
```

Diagnostic fields beyond `subtype`:
- **`api_error_status`** — HTTP status of the terminating API error. Absent or `null` on clean ends.
- **`ttft_ms`** — time to first token (ms). Success branch only.
- **`terminal_reason`** — one of `"completed"`, `"max_turns"`, `"tool_deferred"`, `"aborted_streaming"`, `"aborted_tools"`, `"hook_stopped"`, `"stop_hook_prevented"`, `"blocking_limit"`, `"rapid_refill_breaker"`, `"prompt_too_long"`, `"image_error"`, `"model_error"`.
- **`fast_mode_state`** — `"on" | "off" | "cooldown"`.

`origin` forwards the [`SDKMessageOrigin`](#sdkmessageorigin) of the user message that triggered this result. When a background task completes and SDK injects a synthetic follow-up turn, the resulting `SDKResultMessage` carries `origin: { kind: "task-notification" }`. Use this to distinguish results that answer the user prompt vs. results emitted for background-task follow-ups. For results emitted before any user turn (e.g. startup errors), the field is absent.

When a `PreToolUse` hook returns `permissionDecision: "defer"`, the result has `stop_reason: "tool_deferred"` and `deferred_tool_use` carries the pending tool's `id` / `name` / `input`. Read this to show the request in your own UI, then resume with the same `session_id` to continue.

---

## `SDKSystemMessage`

Session init.

```typescript
type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: UUID;
  session_id: string;
  agents?: string[];
  apiKeySource: ApiKeySource;
  betas?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
  skills: string[];
  plugins: { name: string; path: string }[];
};
```

This is where you capture `session_id` for later resume.

---

## `SDKPartialAssistantMessage`

Per-token streaming (only when `includePartialMessages: true`).

```typescript
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent;  // from @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

`event` carries `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop` — the same shapes the Anthropic Messages API streams.

---

## `SDKCompactBoundaryMessage`

```typescript
type SDKCompactBoundaryMessage = {
  type: "system";
  subtype: "compact_boundary";
  uuid: UUID;
  session_id: string;
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
};
```

Emitted when the conversation crosses a compaction boundary.

---

## `SDKPluginInstallMessage`

Marketplace plugin install progress. Emitted when `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` is set.

```typescript
type SDKPluginInstallMessage = {
  type: "system";
  subtype: "plugin_install";
  status: "started" | "installed" | "failed" | "completed";
  name?: string;
  error?: string;
  uuid: UUID;
  session_id: string;
};
```

`started` / `completed` bracket the overall install. `installed` / `failed` report a single marketplace + carry `name`.

---

## Permission denial

### `SDKPermissionDeniedMessage`

Emitted when the permission system **auto-denies** a tool without showing an interactive prompt. The interactive `canUseTool` path delivers separately. Hook-emitted denials don't appear here. Requires Claude Code ≥ v2.1.136.

```typescript
type SDKPermissionDeniedMessage = {
  type: "system";
  subtype: "permission_denied";
  tool_name: string;
  tool_use_id: string;
  agent_id?: string;
  decision_reason_type?: string;       // "rule" | "mode" | "classifier" | "asyncAgent"
  decision_reason?: string;
  message: string;                      // returned in tool_result
  uuid: UUID;
  session_id: string;
};
```

### `SDKPermissionDenial`

Appears in `SDKResultMessage.permission_denials[]`.

```typescript
type SDKPermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};
```

---

## Hook lifecycle

When `includeHookEvents: true`.

### `SDKHookStartedMessage`

```typescript
type SDKHookStartedMessage = {
  type: "system";
  subtype: "hook_started";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKHookProgressMessage`

```typescript
type SDKHookProgressMessage = {
  type: "system";
  subtype: "hook_progress";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  stdout: string;
  stderr: string;
  output: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKHookResponseMessage`

```typescript
type SDKHookResponseMessage = {
  type: "system";
  subtype: "hook_response";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  output: string;
  stdout: string;
  stderr: string;
  exit_code?: number;
  outcome: "success" | "error" | "cancelled";
  uuid: UUID;
  session_id: string;
};
```

---

## Task events

Background tasks include `run_in_background` Bash commands, `Monitor` watches, and background subagents.

### `SDKTaskStartedMessage`

```typescript
type SDKTaskStartedMessage = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  tool_use_id?: string;
  description: string;
  task_type?: string;                 // "local_bash" | "local_agent" | "remote_agent"
  uuid: UUID;
  session_id: string;
};
```

### `SDKTaskProgressMessage`

```typescript
type SDKTaskProgressMessage = {
  type: "system";
  subtype: "task_progress";
  task_id: string;
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  usage: { total_tokens: number; tool_uses: number; duration_ms: number };
  last_tool_name?: string;
  summary?: string;                   // populated when agentProgressSummaries: true
  uuid: UUID;
  session_id: string;
};
```

### `SDKTaskUpdatedMessage`

```typescript
type SDKTaskUpdatedMessage = {
  type: "system";
  subtype: "task_updated";
  task_id: string;
  patch: {
    status?: "pending" | "running" | "completed" | "failed" | "killed";
    description?: string;
    end_time?: number;                // Unix ms epoch, compare to Date.now()
    total_paused_ms?: number;
    error?: string;
    is_backgrounded?: boolean;
  };
  uuid: UUID;
  session_id: string;
};
```

### `SDKTaskNotificationMessage`

Background task completed, failed, or stopped.

```typescript
type SDKTaskNotificationMessage = {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  tool_use_id?: string;
  status: "completed" | "failed" | "stopped";
  output_file: string;
  summary: string;
  usage?: { total_tokens: number; tool_uses: number; duration_ms: number };
  uuid: UUID;
  session_id: string;
};
```

---

## Other

### `SDKToolProgressMessage`

```typescript
type SDKToolProgressMessage = {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  task_id?: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKToolUseSummaryMessage`

```typescript
type SDKToolUseSummaryMessage = {
  type: "tool_use_summary";
  summary: string;
  preceding_tool_use_ids: string[];
  uuid: UUID;
  session_id: string;
};
```

### `SDKStatusMessage`

```typescript
type SDKStatusMessage = {
  type: "system";
  subtype: "status";
  status: "compacting" | null;
  permissionMode?: PermissionMode;
  uuid: UUID;
  session_id: string;
};
```

### `SDKLocalCommandOutputMessage`

Output of a local slash command (e.g. `/voice`, `/usage`). Rendered as assistant-style text in the transcript.

```typescript
type SDKLocalCommandOutputMessage = {
  type: "system";
  subtype: "local_command_output";
  content: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKAuthStatusMessage`

```typescript
type SDKAuthStatusMessage = {
  type: "auth_status";
  isAuthenticating: boolean;
  output: string[];
  error?: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKFilesPersistedEvent`

```typescript
type SDKFilesPersistedEvent = {
  type: "system";
  subtype: "files_persisted";
  files: { filename: string; file_id: string }[];
  failed: { filename: string; error: string }[];
  processed_at: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKRateLimitEvent`

```typescript
type SDKRateLimitEvent = {
  type: "rate_limit_event";
  rate_limit_info: {
    status: "allowed" | "allowed_warning" | "rejected";
    resetsAt?: number;
    utilization?: number;
  };
  uuid: UUID;
  session_id: string;
};
```

### `SDKPromptSuggestionMessage`

Emitted when `promptSuggestions: true`.

```typescript
type SDKPromptSuggestionMessage = {
  type: "prompt_suggestion";
  suggestion: string;
  uuid: UUID;
  session_id: string;
};
```

### `SDKAPIRetryMessage`

```typescript
type SDKAPIRetryMessage = {
  type: "system";
  subtype: "api_retry";
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error_status: number | null;       // null for connection errors (timeouts with no HTTP response)
  error: SDKAssistantMessageError;
  uuid: UUID;
  session_id: string;
};
```

---

## `SDKMessageOrigin`

```typescript
type SDKMessageOrigin =
  | { kind: "human" }
  | { kind: "channel"; server: string }
  | { kind: "peer"; from: string; name?: string }
  | { kind: "task-notification" }
  | { kind: "coordinator" };
```

| `kind` | Meaning |
|---|---|
| `human` | Direct end-user input. Absent `origin` on user messages also implies human |
| `channel` | Arrived via a [channel](https://docs.claude.com/zh-CN/channels). `server` is the source MCP server |
| `peer` | From another agent session via `SendMessage`. `from` = sender address, `name` = display name |
| `task-notification` | Synthetic follow-up turn after a background task. See [`SDKTaskNotificationMessage`](#sdktasknotificationmessage) |
| `coordinator` | From a team coordinator in an [agent team](https://docs.claude.com/zh-CN/agent-teams) |

This appears on `SDKUserMessage` and forwards to the corresponding `SDKResultMessage`.

---

## Usage

### `Usage`

From `@anthropic-ai/sdk` (`BetaUsage`):

```typescript
type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  } | null;
  server_tool_use: BetaServerToolUsage | null;
  service_tier: "standard" | "priority" | "batch" | null;
  speed: "standard" | "fast" | null;
  inference_geo: string | null;
  iterations: BetaIterationsUsage | null;
};
```

### `NonNullableUsage`

```typescript
type NonNullableUsage = { [K in keyof Usage]: NonNullable<Usage[K]> };
```

### `ModelUsage`

Per-model stats returned on the result message. `costUSD` is a client-side estimate.

```typescript
type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
};
```

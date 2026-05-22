# Options — Every field on `query()` and `startup()`

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

## TOC

- [Options table](#options-table) — every field with default + description
- [Environment variables](#environment-variables) — timeouts and stall detection
- [`SettingSource`](#settingsource) and source precedence
- [`PermissionMode`](#permissionmode)
- [`ToolConfig`](#toolconfig)
- [`ThinkingConfig`](#thinkingconfig)
- [`SdkPluginConfig`](#sdkpluginconfig)
- [`SpawnedProcess` / `SpawnOptions`](#custom-spawn) — running the CLI in a VM/container

Cross-refs:
- The `Query` interface methods (`interrupt`, `setModel`, `applyFlagSettings`, etc.) → [query-object.md](query-object.md).
- `Options.sandbox` (`SandboxSettings`) → [sandbox.md](sandbox.md).
- `Options.hooks` → [hooks.md](hooks.md).
- `Options.canUseTool` → [permissions.md](permissions.md).
- `Options.mcpServers`, `Options.agents`, `Options.plugins` → [mcp.md](mcp.md).
- `Options.sessionStore` / `Options.resume` → [sessions.md](sessions.md).

---

## Options table

| Property | Type | Default | Description |
|---|---|---|---|
| `abortController` | `AbortController` | `new AbortController()` | Cancellation controller |
| `additionalDirectories` | `string[]` | `[]` | Extra directories Claude can access (beyond `cwd`) |
| `agent` | `string` | — | Main-thread agent name. Must be defined in `agents` or settings |
| `agents` | `Record<string, AgentDefinition>` | — | Programmatically define subagents — see [mcp.md](mcp.md) |
| `agentProgressSummaries` | `boolean` | `false` | Emit one-line progress summaries on `task_progress` events (foreground + background subagents) |
| `allowDangerouslySkipPermissions` | `boolean` | `false` | Required when using `permissionMode: 'bypassPermissions'` |
| `allowedTools` | `string[]` | `[]` | Auto-approved tools. **Does not restrict** Claude — unlisted tools go through `permissionMode`/`canUseTool`. Use `disallowedTools` to block |
| `betas` | `SdkBeta[]` | `[]` | Enable beta features (see [SdkBeta](#sdkbeta)) |
| `canUseTool` | `CanUseTool` | — | Custom permission callback — see [permissions.md](permissions.md) |
| `continue` | `boolean` | `false` | Continue the most recent conversation |
| `cwd` | `string` | `process.cwd()` | Current working directory. **Not a sandbox** — see [sandbox.md](sandbox.md) for real isolation |
| `debug` | `boolean` | `false` | Enable Claude Code debug mode |
| `debugFile` | `string` | — | Write debug logs to a path. Implicitly enables `debug` |
| `disallowedTools` | `string[]` | `[]` | Tools to deny. Bare names like `"Bash"` remove from context; scoped rules like `"Bash(rm *)"` keep tool but block matching calls (works in every mode, **including `bypassPermissions`**) |
| `effort` | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'` | `'high'` | Effort level. Works with adaptive thinking |
| `enableFileCheckpointing` | `boolean` | `false` | Track file changes for rollback. See `rewindFiles()` in [query-object.md](query-object.md) |
| `env` | `Record<string, string \| undefined>` | `process.env` | Env vars passed to CLI. See [Environment variables](#environment-variables) |
| `executable` | `'bun' \| 'deno' \| 'node'` | auto-detect | JS runtime |
| `executableArgs` | `string[]` | `[]` | Args passed to the runtime executable |
| `extraArgs` | `Record<string, string \| null>` | `{}` | Extra CLI args |
| `fallbackModel` | `string` | — | Model used when primary fails |
| `forkSession` | `boolean` | `false` | When resuming via `resume`, fork to a new session id instead of continuing the original |
| `forwardSubagentText` | `boolean` | `false` | Forward subagent text+thinking blocks as assistant/user messages with `parent_tool_use_id` so consumers can render nested transcripts. Default: subagents only emit `tool_use`/`tool_result` |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | See [hooks.md](hooks.md) |
| `includeHookEvents` | `boolean` | `false` | Surface hook lifecycle as `SDKHookStartedMessage` / `SDKHookProgressMessage` / `SDKHookResponseMessage` in the stream |
| `includePartialMessages` | `boolean` | `false` | **Required for per-token streaming.** Without it you only get the final `SDKAssistantMessage` per turn |
| `loadTimeoutMs` | `number` | `60000` | *Alpha.* Timeout per `sessionStore.load()`/`listSubkeys()` during resume materialization. Ignored without `sessionStore` |
| `managedSettings` | `Settings` | — | Policy-layer settings from the spawning parent. Dropped if an IT-managed layer exists on the machine, unless `parentSettingsBehavior: 'merge'`. Filtered to restrictive keys |
| `maxBudgetUsd` | `number` | — | Halt the query when client-estimated cost reaches this USD value. Compared against `total_cost_usd` |
| `maxThinkingTokens` | `number` | — | **Deprecated.** Use `thinking` |
| `maxTurns` | `number` | — | Max agent turns (tool-use round-trips) |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP server configs — see [mcp.md](mcp.md) |
| `model` | `string` | CLI default | Claude model |
| `onElicitation` | `(req, opts) => Promise<ElicitationResult>` | — | Handle MCP elicitation requests. Unhandled requests auto-reject |
| `outputFormat` | `{ type: 'json_schema', schema: JSONSchema }` | — | Structured output for the agent result |
| `outputStyle` | `string` | — | **Not an `Options` field.** Set in inline `settings` object or settings file |
| `pathToClaudeCodeExecutable` | `string` | auto-resolved | Path to the `claude` binary. Needed when optional deps skipped or unsupported platform — see [functions.md](functions.md) `extractFromBunfs()` for `bun --compile` |
| `permissionMode` | `PermissionMode` | `'default'` | See [PermissionMode](#permissionmode) |
| `permissionPromptToolName` | `string` | — | MCP tool name for permission prompts |
| `persistSession` | `boolean` | `true` | When `false`, session is not persisted and cannot be resumed |
| `planModeInstructions` | `string` | — | Custom plan-mode workflow instructions. Replaces the default plan-mode body (CLI still wraps with read-only prefix + ExitPlanMode protocol footer) |
| `plugins` | `SdkPluginConfig[]` | `[]` | Load local plugins — see [SdkPluginConfig](#sdkpluginconfig) |
| `promptSuggestions` | `boolean` | `false` | Emit `prompt_suggestion` messages after each turn |
| `resume` | `string` | — | Session id to resume |
| `resumeSessionAt` | `string` | — | Resume at a specific message UUID |
| `sandbox` | `SandboxSettings` | — | OS-level sandbox config — see [sandbox.md](sandbox.md) |
| `sessionId` | `string` | auto-generated | Use a specific UUID for the session |
| `sessionStore` | `SessionStore` | — | Mirror sessions to external storage so any host can resume — see [sessions.md](sessions.md) |
| `sessionStoreFlush` | `'batched' \| 'eager'` | `'batched'` | *Alpha.* `sessionStore` flush mode |
| `settings` | `string \| Settings` | — | Inline settings object or path. Fills the flag-settings layer (top of precedence, only managed policy beats it). Use [`applyFlagSettings()`](query-object.md#applyflagsettings) at runtime |
| `settingSources` | `SettingSource[]` | all sources | Filesystem sources to load. `[]` disables user/project/local. Managed policy always loads |
| `skills` | `string[] \| 'all'` | — | Skills available to the session. `'all'` enables every discovered skill. Setting this auto-enables the `Skill` tool — no need to list `'Skill'` in `allowedTools` |
| `spawnClaudeCodeProcess` | `(opts: SpawnOptions) => SpawnedProcess` | — | Custom function to spawn the CLI. Use for VM/container/remote execution |
| `stderr` | `(data: string) => void` | — | Stderr callback |
| `strictMcpConfig` | `boolean` | `false` | Only use servers from `mcpServers`. Ignore project `.mcp.json`, user settings, plugin-provided MCP |
| `systemPrompt` | `string \| { type: 'preset', preset: 'claude_code', append?, excludeDynamicSections? }` | minimal | System prompt config. Use preset form to inherit Claude Code's; `append` extends, `excludeDynamicSections: true` moves per-session context to the first user message for better prompt-cache reuse |
| `taskBudget` | `{ total: number }` | — | *Alpha.* API-side task budget in tokens. Model is told its remaining budget so it can pace |
| `thinking` | `ThinkingConfig` | adaptive (supported models) | See [ThinkingConfig](#thinkingconfig) |
| `title` | `string` | — | Display title for the session. When resuming, persisted title wins; use `renameSession()` to rename |
| `toolAliases` | `Record<string, string>` | — | Map built-in tool names to MCP tool names so Claude calls your MCP impl instead. E.g. `{ Bash: 'mcp__workspace__bash' }` |
| `toolConfig` | `ToolConfig` | — | Built-in tool behavior — see [ToolConfig](#toolconfig) |
| `tools` | `string[] \| { type: 'preset', preset: 'claude_code' }` | — | Tool set. Pass array of names or use the preset for Claude Code's defaults |

### `SdkBeta`

```typescript
type SdkBeta = "context-1m-2025-08-07";
```

> **⚠ Warning:** `context-1m-2025-08-07` beta was retired 2026-04-30. With Sonnet 4.5 / Sonnet 4 passing this value is a no-op; requests >200k tokens now error. Migrate to Sonnet 4.6 / Opus 4.6 / Opus 4.7 which include 1M context at standard pricing with no beta header.

---

## Environment variables

The CLI subprocess reads several env vars that control API timeouts and stall detection. Pass them via the `env` option:

```typescript
query({
  prompt: "Analyze this code",
  options: {
    env: {
      ...process.env,
      API_TIMEOUT_MS: "120000",
      CLAUDE_CODE_MAX_RETRIES: "2",
      CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: "120000",
    },
  },
});
```

- **`API_TIMEOUT_MS`** — per-request timeout on the Anthropic client (ms). Default `600000`. Applies to main loop + all subagents.
- **`CLAUDE_CODE_MAX_RETRIES`** — max API retries. Default `10`. Each retry has its own `API_TIMEOUT_MS` window, so worst case ≈ `API_TIMEOUT_MS × (CLAUDE_CODE_MAX_RETRIES + 1)` + backoff.
- **`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`** — stall watchdog for subagents started with `run_in_background`. Default `600000`. Reset on each stream event; on stall aborts the subagent, marks task failed, and surfaces error with any partial results to the parent. Does **not** apply to synchronous subagents.
- **`CLAUDE_ENABLE_STREAM_WATCHDOG=1`** + **`CLAUDE_STREAM_IDLE_TIMEOUT_MS`** — aborts a request when headers arrived but the body stops streaming. Default off. `CLAUDE_STREAM_IDLE_TIMEOUT_MS` defaults to `300000` and is floored to that minimum. Aborted requests go through normal retry path.
- **`CLAUDE_AGENT_SDK_CLIENT_APP`** — identifies your app in the User-Agent header.

---

## `SettingSource`

```typescript
type SettingSource = "user" | "project" | "local";
```

| Value | Location |
|---|---|
| `'user'` | `~/.claude/settings.json` |
| `'project'` | `.claude/settings.json` (version-controlled) |
| `'local'` | `.claude/settings.local.json` (gitignored) |

Default when `settingSources` is omitted: load all three. Managed policy settings load regardless.

**Common patterns:**

```typescript
// Disable filesystem settings entirely (pure SDK app)
options: { settingSources: [] }

// Load only project settings (CI consistency)
options: { settingSources: ["project"], permissionMode: "bypassPermissions" }

// Pick up CLAUDE.md project instructions
options: {
  systemPrompt: { type: "preset", preset: "claude_code" },
  settingSources: ["project"],
}
```

**Precedence (high → low) when multiple sources load:**

1. Local settings (`.claude/settings.local.json`)
2. Project settings (`.claude/settings.json`)
3. User settings (`~/.claude/settings.json`)

Programmatic options (`agents`, `allowedTools`, `settings`) override user/project/local. Managed policy settings override programmatic options.

---

## `PermissionMode`

```typescript
type PermissionMode =
  | "default"            // Standard permission behavior
  | "acceptEdits"        // Auto-accept file edits
  | "bypassPermissions"  // Bypass all permission checks
  | "plan"               // Plan Mode — read-only tools
  | "dontAsk"            // Don't prompt; deny if not pre-approved
  | "auto";              // Use a model classifier to approve/deny each tool call
```

---

## `ToolConfig`

Built-in tool behavior knobs.

```typescript
type ToolConfig = {
  askUserQuestion?: {
    previewFormat?: "markdown" | "html";
  };
};
```

`askUserQuestion.previewFormat` opts into the `preview` field on `AskUserQuestion` options and sets its content format. When unset, Claude emits no preview.

---

## `ThinkingConfig`

Controls extended thinking. Supersedes deprecated `maxThinkingTokens`.

```typescript
type ThinkingDisplay = "summarized" | "omitted";

type ThinkingConfig =
  | { type: "adaptive"; display?: ThinkingDisplay }              // Model decides when/how much (Opus 4.6+)
  | { type: "enabled"; budgetTokens?: number; display?: ThinkingDisplay }
  | { type: "disabled" };
```

On Claude Opus 4.7+, API default is `display: "omitted"`. Set `"summarized"` to receive thinking content in `thinking` blocks.

---

## `SdkPluginConfig`

```typescript
type SdkPluginConfig = {
  type: "local";
  path: string;
};
```

Only `'local'` is supported today. Example:

```typescript
plugins: [
  { type: "local", path: "./my-plugin" },
  { type: "local", path: "/absolute/path/to/plugin" },
];
```

When `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` env var is set, marketplace plugin installs emit `SDKPluginInstallMessage` events in the stream (`started` → `installed`/`failed` per marketplace → `completed`).

---

## Custom spawn

For running Claude Code in a VM, container, or remote environment.

### `SpawnedProcess`

```typescript
interface SpawnedProcess {
  stdin: Writable;
  stdout: Readable;
  readonly killed: boolean;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(event: "exit", listener: (code, signal) => void): void;
  on(event: "error", listener: (error) => void): void;
  // once/off symmetric variants too
}
```

Node's `ChildProcess` already satisfies this interface.

### `SpawnOptions`

```typescript
interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
}
```

Pass `spawnClaudeCodeProcess: (opts) => SpawnedProcess` on `Options`.

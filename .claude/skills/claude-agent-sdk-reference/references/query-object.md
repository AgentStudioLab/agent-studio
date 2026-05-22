# The `Query` interface

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

Returned by `query()` and `WarmQuery.query()`. Extends `AsyncGenerator<SDKMessage, void>` — you iterate it for messages — and adds control methods.

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(
    userMessageId: string,
    options?: { dryRun?: boolean },
  ): Promise<RewindFilesResult>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;  // deprecated
  applyFlagSettings(settings: { [K in keyof Settings]?: Settings[K] | null }): Promise<void>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  stopTask(taskId: string): Promise<void>;
  close(): void;
}
```

## Method summary

| Method | Description |
|---|---|
| `interrupt()` | Interrupt the query. **Streaming-input mode only** |
| `rewindFiles(userMessageId, options?)` | Restore files to their state at a specific user message. Pass `{ dryRun: true }` to preview. Requires `enableFileCheckpointing: true` |
| `setPermissionMode(mode)` | Change permission mode mid-session. **Streaming-input mode only** |
| `setModel(model)` | Change model mid-session. **Streaming-input mode only** |
| `setMaxThinkingTokens(n)` | **Deprecated** — use `thinking` option instead |
| `applyFlagSettings(settings)` | Merge settings into the flag layer at runtime. **Streaming-input mode only**. See below |
| `initializationResult()` | Full init result: supported commands, models, agents, account info, output styles |
| `supportedCommands()` | Available slash commands |
| `supportedModels()` | Available models with display info |
| `supportedAgents()` | Available subagents (`AgentInfo[]`) |
| `mcpServerStatus()` | Connected MCP server status |
| `accountInfo()` | Authenticated user info |
| `reconnectMcpServer(name)` | Reconnect one MCP server by name |
| `toggleMcpServer(name, enabled)` | Enable/disable an MCP server by name |
| `setMcpServers(servers)` | Dynamically replace the MCP server set. Returns `{ added, removed, errors }` |
| `streamInput(stream)` | Stream input messages for multi-turn dialog |
| `stopTask(taskId)` | Stop a running background task by id |
| `close()` | Close the query and terminate the underlying process. Force-cleans all resources |

## `applyFlagSettings()`

Change any [setting](https://docs.claude.com/zh-CN/settings) on a running session without restarting the query. Use when no dedicated setter exists — e.g. tighten `permissions` after an agent has read untrusted input.

`setModel()` and `setPermissionMode()` are sugar for the two common keys; `applyFlagSettings()` is the generic form that accepts any subset of `Settings`. Passing `model` here is equivalent to `setModel()`.

Values are written to the **flag-settings layer** — the same layer `query()`'s inline `settings` option fills at startup. It sits near the top of the precedence stack: overrides user/project/local, only managed policy beats it.

Consecutive calls **shallow-merge** top-level keys. A second `{ permissions: {...} }` replaces the entire `permissions` object from the first call, not deep-merges it.

To **clear** a key from the flag layer (fall back to lower-priority sources), pass `null`. `undefined` is a no-op (JSON serialization strips it).

**Streaming-input mode only**, same constraint as `setModel()` / `setPermissionMode()`.

```typescript
const q = query({ prompt: messageStream });

// Override model for the rest of the session
await q.applyFlagSettings({ model: "claude-opus-4-6" });

// Later: clear the override
await q.applyFlagSettings({ model: null });
```

> **Note:** `applyFlagSettings()` is **TypeScript only**. The Python SDK does not expose an equivalent.

## `SDKControlInitializeResponse`

Returned by `initializationResult()`.

```typescript
type SDKControlInitializeResponse = {
  commands: SlashCommand[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  fast_mode_state?: "off" | "cooldown" | "on";
};
```

## Subtypes referenced

### `SlashCommand`

```typescript
type SlashCommand = {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
};
```

### `ModelInfo`

```typescript
type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ("low" | "medium" | "high" | "xhigh" | "max")[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
};
```

### `AgentInfo`

```typescript
type AgentInfo = {
  name: string;            // e.g. "Explore", "general-purpose"
  description: string;
  model?: string;          // model alias; if omitted, inherits parent
};
```

### `McpServerStatus`

```typescript
type McpServerStatus = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  serverInfo?: { name: string; version: string };
  error?: string;
  config?: McpServerStatusConfig;   // union of all transport types — see mcp.md
  scope?: string;
  tools?: {
    name: string;
    description?: string;
    annotations?: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
  }[];
};
```

### `AccountInfo`

```typescript
type AccountInfo = {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
};
```

`ApiKeySource`:

```typescript
type ApiKeySource = "user" | "project" | "org" | "temporary" | "oauth";
```

### `McpSetServersResult`

```typescript
type McpSetServersResult = {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
};
```

### `RewindFilesResult`

```typescript
type RewindFilesResult = {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
};
```

## `AbortError`

Custom error class for aborted operations.

```typescript
class AbortError extends Error {}
```

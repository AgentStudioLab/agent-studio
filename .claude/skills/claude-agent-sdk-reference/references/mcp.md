# MCP servers, plugins, and subagent definitions

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript>.

## TOC

- [`McpServerConfig`](#mcpserverconfig) — union of transports
  - [`McpStdioServerConfig`](#mcpstdioserverconfig)
  - [`McpSSEServerConfig`](#mcpsseserverconfig)
  - [`McpHttpServerConfig`](#mcphttpserverconfig)
  - [`McpSdkServerConfigWithInstance`](#mcpsdkserverconfigwithinstance)
  - [`McpClaudeAIProxyServerConfig`](#mcpclaudeaiproxyserverconfig)
- [`McpServerStatusConfig`](#mcpserverstatusconfig)
- [`AgentDefinition`](#agentdefinition)
- [`AgentMcpServerSpec`](#agentmcpserverspec)
- [`SdkPluginConfig`](#sdkpluginconfig)

For building **in-process** MCP servers and tools, see [`tool()` / `createSdkMcpServer()` in functions.md](functions.md).

---

## `McpServerConfig`

```typescript
type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfigWithInstance;
```

Pass as `options.mcpServers: Record<string, McpServerConfig>`.

### `McpStdioServerConfig`

```typescript
type McpStdioServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};
```

### `McpSSEServerConfig`

```typescript
type McpSSEServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};
```

### `McpHttpServerConfig`

```typescript
type McpHttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};
```

### `McpSdkServerConfigWithInstance`

In-process server (created with `createSdkMcpServer()`):

```typescript
type McpSdkServerConfigWithInstance = {
  type: "sdk";
  name: string;
  instance: McpServer;
};
```

### `McpClaudeAIProxyServerConfig`

```typescript
type McpClaudeAIProxyServerConfig = {
  type: "claudeai-proxy";
  url: string;
  id: string;
};
```

---

## `McpServerStatusConfig`

Reported by `Query.mcpServerStatus()`. Union of every transport type a server might be configured with:

```typescript
type McpServerStatusConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfig
  | McpClaudeAIProxyServerConfig;
```

---

## `AgentDefinition`

Programmatically define a subagent. Pass via `options.agents: Record<string, AgentDefinition>`.

```typescript
type AgentDefinition = {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: string;
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  initialPrompt?: string;
  maxTurns?: number;
  background?: boolean;
  memory?: "user" | "project" | "local";
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | number;
  permissionMode?: PermissionMode;
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

| Field | Required | Description |
|---|---|---|
| `description` | yes | When to use this agent (natural language) |
| `tools` | no | Allowed tool names. If omitted, inherits parent's tools. To preload Skills, use `skills`, not `'Skill'` here |
| `disallowedTools` | no | Tools explicitly denied to this agent |
| `prompt` | yes | System prompt |
| `model` | no | Model override. Aliases: `'sonnet'`, `'opus'`, `'haiku'`, `'inherit'`, or full id. `'inherit'`/omit → parent model |
| `mcpServers` | no | MCP server specs for this agent — see [`AgentMcpServerSpec`](#agentmcpserverspec) |
| `skills` | no | Skill names preloaded into the agent's context |
| `initialPrompt` | no | When this agent runs as main-thread agent, auto-submitted as the first user turn |
| `maxTurns` | no | Max agent turns (API round-trips) |
| `background` | no | Run as non-blocking background task |
| `memory` | no | Memory source: `'user'` / `'project'` / `'local'` |
| `effort` | no | Reasoning effort level. Named or integer |
| `permissionMode` | no | Permission mode inside this agent |
| `criticalSystemReminder_EXPERIMENTAL` | no | Experimental — additive system reminder |

---

## `AgentMcpServerSpec`

```typescript
type AgentMcpServerSpec =
  | string                                          // reference an existing entry in the parent's mcpServers
  | Record<string, McpServerConfigForProcessTransport>;
```

`McpServerConfigForProcessTransport` is `McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig`.

---

## `SdkPluginConfig`

```typescript
type SdkPluginConfig = {
  type: "local";
  path: string;
};
```

| Field | Type | Description |
|---|---|---|
| `type` | `'local'` | Only local plugins are supported today |
| `path` | `string` | Absolute or relative path to the plugin directory |

```typescript
options: {
  plugins: [
    { type: "local", path: "./my-plugin" },
    { type: "local", path: "/absolute/path/to/plugin" },
  ],
}
```

See <https://docs.claude.com/zh-CN/agent-sdk/plugins> for plugin authoring.

Marketplace plugin installs (when `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` env var is set) surface as `SDKPluginInstallMessage` events — see [messages.md](messages.md).

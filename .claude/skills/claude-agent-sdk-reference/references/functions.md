# Functions — Top-level API

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

## TOC

- [`query()`](#query) — main entry, returns `Query` async generator
- [`startup()`](#startup) — warm the CLI subprocess ahead of time, returns `WarmQuery`
- [`tool()`](#tool) — define a type-safe MCP tool
- [`createSdkMcpServer()`](#createsdkmcpserver) — in-process MCP server
- [`resolveSettings()`](#resolvesettings) — preview merged settings without spawning CLI
- [`extractFromBunfs()`](#extractfrombunfs) — required when packaging with `bun build --compile`

For session helpers (`listSessions`, `getSessionMessages`, `getSessionInfo`, `renameSession`, `tagSession`) see [sessions.md](sessions.md).

---

## `query()`

Main function for interacting with Claude Code. Returns an async generator that streams messages as they arrive.

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

| Param | Type | Description |
|---|---|---|
| `prompt` | `string \| AsyncIterable<SDKUserMessage>` | Input prompt (string or async iterable for streaming-input mode) |
| `options` | `Options` | See [options.md](options.md) |

Returns a `Query` object that extends `AsyncGenerator<SDKMessage, void>` plus extra methods — see [query-object.md](query-object.md).

---

## `startup()`

Pre-warm the CLI subprocess and complete the initialization handshake before any prompt is available. The returned `WarmQuery` handle accepts the prompt later, so the first `query()` call doesn't pay subprocess-spawn + init cost.

```typescript
function startup(params?: {
  options?: Options;
  initializeTimeoutMs?: number;
}): Promise<WarmQuery>;
```

| Param | Type | Default | Description |
|---|---|---|---|
| `options` | `Options` | — | Same as `query()`'s `options` |
| `initializeTimeoutMs` | `number` | `60000` | Max ms to wait for init handshake; rejects on timeout |

Example (move spawn off the critical path):

```typescript
import { startup } from "@anthropic-ai/claude-agent-sdk";

// At app boot — pays subprocess cost up-front
const warm = await startup({ options: { maxTurns: 3 } });

// Later, when the prompt is ready, this is immediate
for await (const message of warm.query("What files are here?")) {
  console.log(message);
}
```

### `WarmQuery`

```typescript
interface WarmQuery extends AsyncDisposable {
  query(prompt: string | AsyncIterable<SDKUserMessage>): Query;
  close(): void;
}
```

`WarmQuery.query()` can only be called **once** per warm query. `close()` discards the subprocess if you don't need it. Implements `AsyncDisposable` — usable with `await using`.

---

## `tool()`

Define a type-safe MCP tool to expose to the model.

```typescript
function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations }
): SdkMcpToolDefinition<Schema>;
```

`inputSchema` is a Zod raw shape (Zod 3 or Zod 4).

### `ToolAnnotations` (hints, not security)

Re-exported from `@modelcontextprotocol/sdk/types.js`. Clients **must not** depend on these for security.

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | — | Human-readable title |
| `readOnlyHint` | `boolean` | `false` | Tool doesn't modify environment |
| `destructiveHint` | `boolean` | `true` | Tool may do destructive updates (meaningful only when `readOnlyHint: false`) |
| `idempotentHint` | `boolean` | `false` | Repeat calls with same args have no extra effect |
| `openWorldHint` | `boolean` | `true` | Tool interacts with external entities (e.g. web). `false` = closed domain (e.g. in-memory) |

Example:

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const searchTool = tool(
  "search",
  "Search the web",
  { query: z.string() },
  async ({ query }) => ({
    content: [{ type: "text", text: `Results for: ${query}` }],
  }),
  { annotations: { readOnlyHint: true, openWorldHint: true } },
);
```

---

## `createSdkMcpServer()`

Create an MCP server that runs **in the same process** as your application (no stdio/subprocess).

```typescript
function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
}): McpSdkServerConfigWithInstance;
```

The returned config plugs into `options.mcpServers`:

```typescript
const server = createSdkMcpServer({
  name: "workspace",
  tools: [searchTool],
});

query({
  prompt: "search for X",
  options: { mcpServers: { workspace: server } },
});
```

---

## `resolveSettings()`

Resolve effective Claude Code settings for a directory using the same merge engine as the CLI — without spawning the CLI. Useful for previewing what `query()` will see.

> **Note:** This function is in **alpha**. It reads MDM sources (macOS plist, Windows HKLM/HKCU) but does not run the admin-configured `policyHelper` subprocess. The CLI's trust filter on `permissions.defaultMode` is also not applied.

```typescript
function resolveSettings(
  options?: ResolveSettingsOptions
): Promise<ResolvedSettings>;
```

| Param | Type | Default | Description |
|---|---|---|---|
| `options.cwd` | `string` | `process.cwd()` | Directory for resolving project + local settings |
| `options.settingSources` | `SettingSource[]` | all | Filesystem sources to load. `[]` skips user/project/local. Managed policy is always loaded |
| `options.managedSettings` | `Settings` | — | Restrictive policy-layer settings provided by the embedding host. Dropped if an admin-deployed managed layer exists, unless `parentSettingsBehavior: "merge"`. Filtered to restrictive keys only |
| `options.serverManagedSettings` | `Settings` | — | Server-managed settings payload from `/api/claude_code/settings`. Non-restrictive keys pass through unfiltered |

### Returns: `ResolvedSettings`

| Field | Type | Description |
|---|---|---|
| `effective` | `Settings` | Merged settings, all sources applied in precedence order |
| `provenance` | `Partial<Record<keyof Settings, ProvenanceEntry>>` | For each top-level key, which source provided the value |
| `sources` | `Array<{ source, settings, path?, policyOrigin? }>` | Raw settings from each source, in priority order |

Example:

```typescript
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";

const { effective, provenance } = await resolveSettings({
  cwd: "/path/to/project",
  settingSources: ["user", "project", "local"],
});

console.log(`Cleanup period: ${effective.cleanupPeriodDays} days`);
console.log(`Set by: ${provenance.cleanupPeriodDays?.source}`);
```

---

## `extractFromBunfs()`

Required when packaging your app as a single-file executable with `bun build --compile`. The SDK's bundled CLI binary lives inside `$bunfs` (a virtual FS) at runtime, where `require.resolve` doesn't work. `extractFromBunfs()` copies the embedded binary to a real path you can pass to `pathToClaudeCodeExecutable`.

> Requires `@anthropic-ai/claude-agent-sdk` ≥ v0.3.144.

```typescript
import binPath from "@anthropic-ai/claude-agent-sdk-darwin-arm64/claude" with { type: "file" };
import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract";
import { query } from "@anthropic-ai/claude-agent-sdk";

const cliPath = extractFromBunfs(binPath);

for await (const message of query({
  prompt: "Hello",
  options: { pathToClaudeCodeExecutable: cliPath },
})) {
  console.log(message);
}
```

Platform binary subpaths:
- macOS / Linux: `@anthropic-ai/claude-agent-sdk-<platform>/claude`
- Windows: `@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`

Outside a compiled executable `extractFromBunfs()` returns the input path unchanged, so the same code works in dev.

For cross-compile: `npm install @anthropic-ai/claude-agent-sdk-linux-x64 --force` (or similar) to bring in a non-matching platform package.

---

## Section settings (for `query()` and `startup()`)

These are not strictly "functions" but matter when wiring up settings sources — full description lives in [options.md](options.md):

- `settingSources: SettingSource[]` — `"user" | "project" | "local"`. Pass `[]` to skip filesystem settings entirely. Managed policy settings load regardless.
- `settings: string | Settings` — inline settings object or path to a JSON settings file. Populates the flag-settings layer (high precedence, only managed policy beats it).

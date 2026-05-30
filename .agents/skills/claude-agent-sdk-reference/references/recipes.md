# Recipes — common patterns

Concrete code for things people actually do with the SDK. All recipes are TypeScript and assume `import { ... } from "@anthropic-ai/claude-agent-sdk"`.

## TOC

1. [Workspace-scoped sandbox (OS-level)](#1-workspace-scoped-sandbox-os-level)
2. [HITL approval via `canUseTool`](#2-hitl-approval-via-canusetool)
3. [Layered: sandbox + HITL + UX fast-deny](#3-layered-sandbox--hitl--ux-fast-deny)
4. [Resume across turns (capture session_id)](#4-resume-across-turns)
5. [Pre-warm the CLI with `startup()`](#5-pre-warm-the-cli-with-startup)
6. [Per-token streaming UI](#6-per-token-streaming-ui)
7. [Custom MCP tool (in-process)](#7-custom-mcp-tool-in-process)
8. [Subagent with restricted tools](#8-subagent-with-restricted-tools)
9. [Handle slow / stalled API responses](#9-handle-slow--stalled-api-responses)
10. [Package as a single `bun build --compile` binary](#10-package-as-a-single-bun-buildcompile-binary)
11. [Plan mode → apply](#11-plan-mode--apply)
12. [Hook for fast policy (no UI roundtrip)](#12-hook-for-fast-policy)
13. [Mid-session model/permission change](#13-mid-session-modelpermission-change)
14. [Read past sessions and resume one](#14-read-past-sessions-and-resume-one)

---

## 1. Workspace-scoped sandbox (OS-level)

Restrict reads/writes to a single directory using the OS sandbox. Kernel-enforced via `bubblewrap` (Linux) or `sandbox-exec` (macOS). See [sandbox.md](sandbox.md).

```typescript
for await (const message of query({
  prompt: "Refactor the auth module",
  options: {
    cwd: "/Users/jay/proj",
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      filesystem: {
        allowRead:  ["/Users/jay/proj"],
        allowWrite: ["/Users/jay/proj"],
      },
      network: {
        allowedDomains: ["api.anthropic.com", "registry.npmjs.org"],
      },
    },
    allowedTools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash"],
  },
})) {
  // process message
}
```

`autoAllowBashIfSandboxed: true` means Bash doesn't surface a HITL prompt — the OS layer is the barrier.

---

## 2. HITL approval via `canUseTool`

Round-trip every tool call to a user-facing approval card.

```typescript
const canUseTool: CanUseTool = async (toolName, input, opts) => {
  const decision = await showApprovalCard({
    toolName,
    input,
    title: opts.decisionReason ?? "Approve this tool call?",
    toolUseID: opts.toolUseID,
  });

  if (decision === "allow") return { behavior: "allow" };
  return {
    behavior: "deny",
    message: "User declined — try a different approach.",
  };
};

for await (const m of query({ prompt, options: { canUseTool } })) { /* ... */ }
```

Return `{ behavior: "deny", interrupt: true }` to halt the run instead of letting the model react.

---

## 3. Layered: sandbox + HITL + UX fast-deny

This is the pattern Agent Studio's sidecar uses (recommended for desktop agents):

```typescript
import { checkWorkspaceSandbox } from "./sandbox";  // your own string-level guard

const canUseTool: CanUseTool = async (toolName, input, opts) => {
  // 1. Fast-deny by string check — gives the model an immediate, specific
  //    reason instead of waiting for the OS to refuse and getting EPERM.
  const sandboxDeny = checkWorkspaceSandbox(toolName, input, ctx.cwd);
  if (sandboxDeny) return { behavior: "deny", message: sandboxDeny };

  // 2. HITL — only what passes the fast-deny reaches the user.
  return await bus.requestApproval({ runId, toolUseID: opts.toolUseID, toolName, input });
};

const stream = query({
  prompt,
  options: {
    cwd: ctx.cwd,
    canUseTool,
    sandbox: {                       // 3. Kernel-level final boundary
      enabled: true,
      filesystem: { allowRead: [ctx.cwd], allowWrite: [ctx.cwd] },
      network: { allowedDomains: ["api.anthropic.com"] },
    },
  },
});
```

Three layers, ordered by cost: cheap heuristic → user decision → OS enforcement. The user only sees decisions the policy lets through, and even an erroneous "allow" can't escape `ctx.cwd`.

---

## 4. Resume across turns

Capture the session id from each turn's `init` event, pass it back on the next.

```typescript
const sessionByThread = new Map<string, string>();

async function chat(threadId: string, userText: string) {
  const ac = new AbortController();
  const resumeId = sessionByThread.get(threadId);

  const stream = query({
    prompt: userText,
    options: {
      abortController: ac,
      ...(resumeId ? { resume: resumeId } : {}),
    },
  });

  for await (const msg of stream) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionByThread.set(threadId, msg.session_id);
    }
    // ... handle other messages
  }
}
```

To fork from a specific message instead of continuing:

```typescript
options: {
  resume: resumeId,
  resumeSessionAt: messageUuid,
  forkSession: true,                   // get a new session_id; original preserved
}
```

---

## 5. Pre-warm the CLI with `startup()`

Move subprocess spawn off the critical path. The user sees results faster on their first prompt.

```typescript
import { startup } from "@anthropic-ai/claude-agent-sdk";

// At app boot
const warm = await startup({ options: { maxTurns: 3 } });

// Later — immediate
for await (const m of warm.query("Plan a refactor of foo.ts")) { /* ... */ }
```

Each `WarmQuery` can be consumed **once**. Need parallelism? Spawn N warm queries.

```typescript
const pool = await Promise.all([startup(), startup(), startup()]);
```

---

## 6. Per-token streaming UI

Required: `includePartialMessages: true`. Without it you only get one `SDKAssistantMessage` per turn (the full reply).

```typescript
for await (const msg of query({
  prompt,
  options: { includePartialMessages: true },
})) {
  if (msg.type === "stream_event") {
    const event = msg.event;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      pushTokenToUI(event.delta.text);
    }
  }
}
```

`event` shapes are the standard Anthropic Messages-API stream events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.

---

## 7. Custom MCP tool (in-process)

```typescript
import { tool, createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const checkBuild = tool(
  "checkBuild",
  "Run the project's typecheck and return errors as text",
  { project: z.string() },
  async ({ project }) => {
    const result = await runTypecheck(project);
    return {
      content: [{ type: "text", text: result.errors || "✓ no errors" }],
      structuredContent: { errorCount: result.errorCount },
      isError: result.errorCount > 0,
    };
  },
  { annotations: { readOnlyHint: true, openWorldHint: false } },
);

const server = createSdkMcpServer({
  name: "build-tools",
  tools: [checkBuild],
});

for await (const m of query({
  prompt: "Make sure tsc passes",
  options: { mcpServers: { "build-tools": server } },
})) { /* ... */ }
```

The model can now call `mcp__build-tools__checkBuild`. Add `toolAliases: { Bash: "mcp__build-tools__bash" }` to make it route a built-in name to your impl.

---

## 8. Subagent with restricted tools

```typescript
options: {
  agents: {
    "docs-writer": {
      description: "Write technical documentation. Use for README / API reference / migration guide tasks.",
      prompt: "You are a technical writer focused on clarity and concision...",
      tools: ["Read", "Write", "Glob", "Grep"],  // no Bash, no Edit
      model: "sonnet",
      effort: "medium",
      maxTurns: 20,
    },
  },
}
```

The main agent invokes via the `Agent` tool with `subagent_type: "docs-writer"`.

---

## 9. Handle slow / stalled API responses

Pass timeout env vars to the CLI subprocess:

```typescript
options: {
  env: {
    ...process.env,
    API_TIMEOUT_MS: "120000",                       // 2 min per request
    CLAUDE_CODE_MAX_RETRIES: "2",                   // fail fast
    CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: "120000",  // background subagent watchdog
    CLAUDE_ENABLE_STREAM_WATCHDOG: "1",
    CLAUDE_STREAM_IDLE_TIMEOUT_MS: "300000",        // floor; >= 5 min
  },
}
```

See [options.md → Environment variables](options.md#environment-variables) for the full list.

---

## 10. Package as a single `bun build --compile` binary

The SDK ships a native CLI binary as an optional dep. Inside a `--compile`d single-file executable, `require.resolve` doesn't work — you must extract the binary to a real path with `extractFromBunfs()`. Requires SDK ≥ v0.3.144.

```typescript
import binPath from "@anthropic-ai/claude-agent-sdk-darwin-arm64/claude" with { type: "file" };
import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract";
import { query } from "@anthropic-ai/claude-agent-sdk";

const cliPath = extractFromBunfs(binPath);

for await (const m of query({
  prompt: "Hello",
  options: { pathToClaudeCodeExecutable: cliPath },
})) { /* ... */ }
```

Match the import to your `--target`:
- macOS arm64: `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`
- macOS x64: `@anthropic-ai/claude-agent-sdk-darwin-x64/claude`
- Linux x64: `@anthropic-ai/claude-agent-sdk-linux-x64/claude`
- Windows x64: `@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`

Cross-compile? `npm install @anthropic-ai/claude-agent-sdk-<target> --force` to bring in the mismatching platform package.

Outside a compiled executable `extractFromBunfs()` is a no-op, so the same code works in dev.

---

## 11. Plan mode → apply

```typescript
// Phase 1: planning (read-only tools, no edits)
const planStream = query({
  prompt: "How would you fix the auth bug?",
  options: {
    permissionMode: "plan",
    planModeInstructions: "Focus on the minimal change. Identify the bug, propose a fix, list test cases. Then call ExitPlanMode.",
  },
});

// Drain plan stream, capture the plan text from the SDKResultMessage
// (or from the ExitPlanMode tool output).

// Phase 2: apply
const applyStream = query({
  prompt: `Apply this plan exactly:\n\n${planText}`,
  options: {
    resume: sessionId,                  // same session
    permissionMode: "acceptEdits",       // auto-accept edits this time
  },
});
```

`permissionMode: "plan"` keeps the agent in read-only tools until it calls `ExitPlanMode`. The model can request `allowedPrompts: [{ tool: "Bash", prompt: "..." }]` to flag commands needed when applying.

---

## 12. Hook for fast policy

```typescript
options: {
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          async (input) => {
            const cmd = (input as { tool_input: { command: string } }).tool_input.command;
            if (/\brm\s+-rf\s+\//.test(cmd)) {
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "deny",
                  permissionDecisionReason: "Refused: rm -rf / pattern",
                },
              };
            }
            return {};
          },
        ],
        timeout: 5,
      },
    ],
  },
}
```

Hooks run synchronously inside the CLI — no application round-trip. Use them for fixed policy; use `canUseTool` for user-facing UI.

---

## 13. Mid-session model/permission change

Requires streaming-input mode (pass an `AsyncIterable<SDKUserMessage>` as `prompt`).

```typescript
const q = query({ prompt: messageStream });

// Boost to Opus for a hard problem
await q.setModel("claude-opus-4-7");

// Tighten permissions after the agent reads untrusted input
await q.applyFlagSettings({
  permissions: {
    allow: ["Read(*)", "Grep(*)", "Glob(*)"],
    deny:  ["Write(*)", "Edit(*)", "Bash(*)"],
  },
});

// Later: clear the model override, fall back to user/project settings
await q.applyFlagSettings({ model: null });
```

See [query-object.md → applyFlagSettings](query-object.md#applyflagsettings) for layering details.

---

## 14. Read past sessions and resume one

```typescript
import { listSessions, getSessionMessages, query } from "@anthropic-ai/claude-agent-sdk";

const recent = await listSessions({ dir: "/path/to/project", limit: 5 });
for (const s of recent) console.log(`${s.summary} — ${new Date(s.lastModified)}`);

// Resume the second-most-recent
const target = recent[1];
if (target) {
  for await (const m of query({
    prompt: "Continue what we were doing.",
    options: { resume: target.sessionId },
  })) { /* ... */ }
}
```

For partial-resume see [sessions.md → Resume strategy](sessions.md#resume-strategy).

---
name: claude-agent-sdk-reference
description: Authoritative reference for the @anthropic-ai/claude-agent-sdk TypeScript SDK — covers query(), startup(), tool(), createSdkMcpServer, the full Options surface, sandbox config (filesystem/network/proxy), canUseTool, PermissionMode, all hook events, all SDK message types, all built-in tool input/output schemas, session management (listSessions/getSessionMessages/rename/tag), resolveSettings, and applyFlagSettings. Use this skill whenever the user is writing, debugging, or upgrading code that touches claude-agent-sdk; asks about Agent SDK features (sandbox, HITL approval, permissions, hooks, sessions, MCP servers, custom tools, file checkpointing, MCP elicitation, beta features); wants the latest SDK API surface; needs a usage recipe; or is comparing the SDK against what Agent Studio's sidecar already does — even if they don't explicitly say "SDK reference". The SDK changes frequently and the surface is wide; consulting this skill prevents hallucinated APIs and outdated patterns.
---

# Claude Agent SDK Reference (TypeScript)

Reference for `@anthropic-ai/claude-agent-sdk`. The bundled snapshot captures the API surface as of 2026-05; **the SDK ships new fields most weeks**, so when the user asks about something not in the snapshot — or wants to verify a specific field still exists — fetch the live docs in addition to consulting the bundled reference.

## When this skill matters in Agent Studio

This project already uses the SDK in `sidecar/src/agui/provider-claude/` (provider.ts, bridge.ts, interrupt-bus.ts, sandbox.ts). Whenever you touch those files — or any code that imports from `@anthropic-ai/claude-agent-sdk` — pull the relevant section of this reference rather than recalling from memory. Common Agent Studio flashpoints:

| Agent Studio context | Read first |
|---|---|
| Adding/changing `canUseTool` behaviour | `references/permissions.md`, `references/recipes.md` (HITL) |
| Wiring up OS-level sandbox (the gap we discussed) | `references/sandbox.md`, `references/recipes.md` (workspace sandbox) |
| Working with `runWorker` lifecycle, hooks, abort | `references/options.md` (env vars, abortController), `references/hooks.md` |
| Multi-turn `resume` session_id juggling | `references/sessions.md`, `references/recipes.md` (resume) |
| Mounting custom MCP/SDK tools | `references/functions.md` (`tool`, `createSdkMcpServer`), `references/recipes.md` (custom tool) |
| Streaming partial events to the UI | `references/messages.md` (`SDKPartialAssistantMessage`, `SDKToolProgressMessage`) |

## Live docs

The SDK docs root: **<https://docs.claude.com/zh-CN/agent-sdk/typescript>** (English: replace `zh-CN` with `en`).

Master index: **<https://code.claude.com/docs/llms.txt>** — fetch this first when looking for a topic the bundled reference does not cover, then `WebFetch` the specific page it points to.

When the user asks about something that might be newer than the bundled snapshot (e.g. a feature mentioned in a blog post, a field name you don't see in `references/`), default to fetching the live page and quoting from it.

## How to use the bundled reference

`references/` is split by topic. Each file has its own table of contents. For most questions, **load only one file**, not the whole set:

| File | What's inside |
|---|---|
| [references/functions.md](references/functions.md) | Top-level functions: `query`, `startup`, `tool`, `createSdkMcpServer`, `resolveSettings` |
| [references/options.md](references/options.md) | The full `Options` type, every field. Env vars for timeouts/stall detection. `applyFlagSettings` details |
| [references/query-object.md](references/query-object.md) | The `Query` interface — `interrupt`, `rewindFiles`, `setPermissionMode`, `setModel`, `applyFlagSettings`, MCP server control, `streamInput`, `stopTask`, `close` |
| [references/messages.md](references/messages.md) | `SDKMessage` union — every variant (`SDKAssistantMessage`, `SDKResultMessage`, `SDKPartialAssistantMessage`, `SDKPermissionDeniedMessage`, task notifications, hook events, retry events, …) |
| [references/sandbox.md](references/sandbox.md) | `SandboxSettings`, `SandboxFilesystemConfig`, `SandboxNetworkConfig`, the `dangerouslyDisableSandbox` fallback, OS backend notes (bwrap on Linux, sandbox-exec on macOS) |
| [references/hooks.md](references/hooks.md) | `HookEvent`, `HookCallback`, all hook input/output types (PreToolUse, PostToolUse, PostToolBatch, UserPromptSubmit, SessionStart/End, Stop, SubagentStart/Stop, PreCompact, PermissionRequest, ConfigChange, Worktree*, …) |
| [references/permissions.md](references/permissions.md) | `PermissionMode`, `CanUseTool`, `PermissionResult`, `PermissionUpdate`, `PermissionRuleValue` |
| [references/tools.md](references/tools.md) | All built-in tool input/output schemas (Bash, Read, Write, Edit, Glob, Grep, Agent, Monitor, WebFetch, WebSearch, Notebook*, Task*, …) |
| [references/sessions.md](references/sessions.md) | `listSessions`, `getSessionMessages`, `getSessionInfo`, `renameSession`, `tagSession`, `SDKSessionInfo` |
| [references/mcp.md](references/mcp.md) | `McpServerConfig` variants (stdio/sse/http/sdk/claudeai-proxy), `SdkPluginConfig`, `AgentDefinition`, `AgentMcpServerSpec` |
| [references/recipes.md](references/recipes.md) | **Common patterns as runnable snippets** — workspace sandbox, HITL approval, custom MCP tools, resume sessions, pre-warm with startup, handle stalled responses, package as a bun --compile binary |

## Quick triage rules

- **"How do I do X with the SDK?"** → start in `references/recipes.md`; if not there, pick the relevant API file.
- **"What does field Y do on Z?"** → go straight to the type definition file. Don't read `recipes.md`.
- **"What's new in the SDK?"** → fetch `https://code.claude.com/docs/llms.txt` first; the bundled reference may not have the answer.
- **"Is feature F still supported?"** → check the bundled reference for deprecation notes, then verify via live docs.
- **Compiling with `bun build --compile`** → recipe in `references/recipes.md` for `extractFromBunfs()`. Agent Studio's sidecar relies on this; the SDK won't find its bundled CLI binary inside a `--compile`'d single-file executable without it.

## Authoring rules when writing code that uses the SDK

1. **Never hallucinate field names**. If you're not sure a field exists on `Options`, `SandboxSettings`, `PermissionResult`, or any other type — read the file first.
2. **Prefer the predefined builder** over hand-rolling JSON. `tool()` for MCP tools, `createSdkMcpServer()` for in-process servers, `startup()` for warm queries.
3. **Workspace sandbox** is OS-enforced (bwrap on Linux, sandbox-exec on macOS) — far stronger than `canUseTool` string checks. Use `sandbox: { enabled: true, filesystem: {...} }` whenever you can, and layer HITL on top instead of using it as the only barrier.
4. **`canUseTool` is async** and runs per tool invocation. Returning `{ behavior: "deny", message }` is what the model sees as a `tool_result` error — make the message specific enough that it can self-correct.
5. **`resume` session id** rotates if you pass `forkSession: true`. Otherwise the SDK reuses the same id; capture it from `system/init` messages and remember it per thread.
6. **Hooks vs canUseTool**: hooks (`PreToolUse`, etc.) run synchronously inside the CLI; `canUseTool` round-trips to your application. For latency-sensitive policies prefer hooks; for user-facing approval prefer `canUseTool`.
7. **`includePartialMessages: true`** is required for per-token streaming; without it you only get `SDKAssistantMessage` at end of turn.

## Verification reflex

If you write SDK code from this skill, ask yourself before handing back:

- Did I use a field/option that I confirmed exists in this skill or the live docs? (If not, go check.)
- Is the version of the SDK in the project's `package.json` recent enough? Run `grep '"@anthropic-ai/claude-agent-sdk"' sidecar/package.json` if unsure — features like `extractFromBunfs()` (≥0.3.144) and `SDKPermissionDeniedMessage` (≥CC v2.1.136) have minimum versions.
- Is what I wrote consistent with how Agent Studio's existing `sidecar/src/agui/provider-claude/provider.ts` does it? (Match the project's existing pattern, don't introduce a parallel style.)

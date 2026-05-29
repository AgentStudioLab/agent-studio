# `/schedule` via skill + in-process MCP tool

Date: 2026-05-28

## Decision

`/schedule` is **not** a UI modal. It's a built-in **skill** the agent loads,
which calls an in-process **MCP tool** (`create_scheduled_task`) to persist the
task. Chosen over a CLI approach for least-privilege (agent gets one narrow
tool, not the sidecar API token), automatic context injection (cwd/model), and
no multi-process SQLite contention. Consistent with how docx/pptx/pdf skills
already work (skill + agent action).

## Pieces

1. **`built-in/skills/schedule/SKILL.md`** — auto-scanned, default-enabled,
   shows as `/schedule` in the composer slash menu. Guides the agent: settle
   cadence, write a self-contained prompt, call `create_scheduled_task`. Tells
   it the task inherits the conversation's cwd + model (don't ask).

2. **`sidecar/src/agui/provider-claude/scheduled-tool.ts`** (new) —
   `buildScheduledMcpServer({ threadId, cwd, model, onCreate })` returns an
   in-process MCP server (`createSdkMcpServer` + `tool()`, zod v4 shape). Tool
   `create_scheduled_task` args: name, prompt, frequency, time_of_day?,
   weekday?, description?. Handler injects `workingDir = cwd`, `model`, then
   calls `onCreate`. Exports `SCHEDULED_MCP_SERVER` + `SCHEDULED_TOOL_FQN`
   (`mcp__agent_studio__create_scheduled_task`).

3. **provider.ts** — new option `onCreateScheduledTask?`. When set: append the
   tool FQN to `allowedTools`, build the MCP server per-run (inherits ctx.cwd +
   effectiveModel), register under `options.mcpServers`. Approval flows through
   the existing `canUseTool` (ask → approval card, act → auto).

4. **server.ts** — passes `onCreateScheduledTask` that calls
   `scheduledTasks.create({...})` (the same service the scheduler reads), so a
   newly created task is armed and picked up on the next tick. permissionMode
   defaults to "ask".

5. **sidecar `zod` dep** — added `zod@^4.0.0` (SDK 0.3.144 supports zod v3 & v4).

## Notes / out of scope

- The MCP tool is always registered (cheap); the skill is the discoverable
  entry. The agent can also schedule when asked in plain language.
- No UI modal, no frontend changes (the earlier modal approach was reverted).
- Requires a `tauri:dev` restart to recompile the sidecar + rescan skills.

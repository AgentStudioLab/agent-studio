# Permissions — `PermissionMode`, `CanUseTool`, `PermissionResult`, `PermissionUpdate`

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> (snapshot 2026-05).

For the **OS-level** sandbox (`SandboxSettings`) see [sandbox.md](sandbox.md). Permissions are the in-band, model-facing layer.

## TOC

- [`PermissionMode`](#permissionmode)
- [`CanUseTool`](#canusetool) — your custom permission callback
- [`PermissionResult`](#permissionresult)
- [`PermissionUpdate`](#permissionupdate) — programmatic rule edits
- [`PermissionBehavior`](#permissionbehavior)
- [`PermissionUpdateDestination`](#permissionupdatedestination)
- [`PermissionRuleValue`](#permissionrulevalue)
- [`SDKPermissionDeniedMessage` and `SDKPermissionDenial`](#auto-denial-events) — also covered in [messages.md](messages.md)

---

## `PermissionMode`

```typescript
type PermissionMode =
  | "default"            // Standard permission behavior — canUseTool is consulted, mode rules apply
  | "acceptEdits"        // Auto-accept file edits
  | "bypassPermissions"  // Bypass all permission checks (requires allowDangerouslySkipPermissions)
  | "plan"               // Plan Mode — read-only tools
  | "dontAsk"            // Don't prompt; deny if not pre-approved
  | "auto";              // Use a model classifier to approve/deny each tool call
```

Change at runtime via [`setPermissionMode()`](query-object.md) (streaming-input mode only).

---

## `CanUseTool`

The custom permission callback. Called per tool invocation before the tool runs.

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  },
) => Promise<PermissionResult>;
```

| Option | Type | Description |
|---|---|---|
| `signal` | `AbortSignal` | Aborts if you should stop |
| `suggestions` | `PermissionUpdate[]` | Suggested permission updates so the user isn't prompted again. **Bash** prompts include a suggestion with `localSettings` destination — returning it in `updatedPermissions` persists the rule to `.claude/settings.local.json` |
| `blockedPath` | `string` | The file path that triggered the request (if applicable) |
| `decisionReason` | `string` | Why this permission request was triggered |
| `toolUseID` | `string` | Unique id of this specific tool call in the assistant message |
| `agentID` | `string` | Subagent id when the call originates inside a subagent |

Return value:

---

## `PermissionResult`

```typescript
type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };
```

- **`allow.updatedInput`** — modified arguments to pass to the tool (e.g. sanitize a path).
- **`allow.updatedPermissions`** — apply these rule updates so future calls match without prompting.
- **`deny.message`** — what the model sees in the resulting `tool_result`. Make it specific so the model can self-correct.
- **`deny.interrupt`** — if `true`, halt the run instead of letting the model react to the denial.

---

## `PermissionUpdate`

Action describing a rule change. Used in `PermissionResult.allow.updatedPermissions` and elsewhere.

```typescript
type PermissionUpdate =
  | {
      type: "addRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "replaceRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "removeRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "setMode";
      mode: PermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "addDirectories";
      directories: string[];
      destination: PermissionUpdateDestination;
    }
  | {
      type: "removeDirectories";
      directories: string[];
      destination: PermissionUpdateDestination;
    };
```

## `PermissionBehavior`

```typescript
type PermissionBehavior = "allow" | "deny" | "ask";
```

## `PermissionUpdateDestination`

```typescript
type PermissionUpdateDestination =
  | "userSettings"      // ~/.claude/settings.json
  | "projectSettings"   // .claude/settings.json
  | "localSettings"     // .claude/settings.local.json (gitignored)
  | "session"           // current session only
  | "cliArg";           // CLI arg
```

## `PermissionRuleValue`

```typescript
type PermissionRuleValue = {
  toolName: string;
  ruleContent?: string;
};
```

Examples:
- `{ toolName: "Bash" }` — bare name, affects the whole tool
- `{ toolName: "Bash", ruleContent: "rm *" }` — scoped rule; matching invocations are gated even in `bypassPermissions`
- `{ toolName: "Read", ruleContent: "/etc/**" }` — path glob

---

## Auto-denial events

When the permission system denies a tool **without** an interactive prompt (e.g. a `deny` rule matches before `canUseTool` is consulted), the SDK emits `SDKPermissionDeniedMessage` in the stream. This is **separate** from the interactive `canUseTool` path. Hook-emitted denials do not surface here.

Requires Claude Code ≥ v2.1.136.

```typescript
type SDKPermissionDeniedMessage = {
  type: "system";
  subtype: "permission_denied";
  tool_name: string;
  tool_use_id: string;
  agent_id?: string;
  decision_reason_type?: string;   // "rule" | "mode" | "classifier" | "asyncAgent" | ...
  decision_reason?: string;
  message: string;                  // returned in tool_result
  uuid: UUID;
  session_id: string;
};
```

For the post-mortem list on the final result message, `SDKResultMessage.permission_denials` is an array of:

```typescript
type SDKPermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};
```

---

## When to use which layer

| Concern | Use |
|---|---|
| Per-invocation user approval (HITL UI) | `canUseTool` |
| Block specific commands regardless of mode | `disallowedTools: ["Bash(rm -rf *)"]` |
| OS-level filesystem/network boundary | `sandbox` — see [sandbox.md](sandbox.md) |
| Always-allow a subset | `allowedTools` (does not restrict; tools not listed still pass through mode/canUseTool) |
| Auto-accept all edits in plan-then-apply workflow | `permissionMode: "acceptEdits"` |
| Read-only exploration phase | `permissionMode: "plan"` |
| Fully autonomous (use carefully) | `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` |

For latency-sensitive policies, prefer **hooks** (`PreToolUse`) — they run synchronously inside the CLI process — see [hooks.md](hooks.md). For user-visible decisions, prefer `canUseTool` since it round-trips to your application's UI.

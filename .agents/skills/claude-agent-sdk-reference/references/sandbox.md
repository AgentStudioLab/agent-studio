# Sandbox configuration

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript> + <https://docs.claude.com/zh-CN/sandboxing>.

The SDK's sandbox is **OS-level enforcement**, not policy. Backends:

- **Linux** — `bubblewrap` (the `bwrap` binary, used by Flatpak): mount/network/pid/user namespaces
- **macOS** — `sandbox-exec` / Seatbelt: Apple's native sandbox profile system

This is materially stronger than `canUseTool` string checks. When you set workspace boundaries here, the kernel enforces them — the model literally cannot read paths outside `filesystem.allowRead`, even if it passes `canUseTool`.

> **Filesystem/network restrictions also flow through permission rules.** SDK docs note: "Filesystem access: use `Read` and `Edit` permission rules. Network access: use `WebFetch` permission rules. These sandbox settings control sandbox behavior; actual access restrictions come from your permission configuration." In practice, you usually combine: sandbox for OS-enforced boundary + permission rules for in-band model guidance.

> **Dependency check:** When `enabled: true` is passed via this option, `failIfUnavailable` defaults to `true`. If `bubblewrap` is missing on Linux or the platform is unsupported, `query()` emits an error result and exits rather than silently running unsandboxed. Set `failIfUnavailable: false` to allow graceful degradation.

## `SandboxSettings`

```typescript
type SandboxSettings = {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  ignoreViolations?: Record<string, string[]>;
  enableWeakerNestedSandbox?: boolean;
  ripgrep?: { command: string; args?: string[] };
};
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable sandbox mode for command execution |
| `autoAllowBashIfSandboxed` | `boolean` | `true` | When sandbox is on, Bash commands are auto-approved (the OS layer is the barrier) |
| `excludedCommands` | `string[]` | `[]` | Commands that **always** bypass sandbox restrictions (e.g. `['docker']`). Run outside the sandbox, no model involvement |
| `allowUnsandboxedCommands` | `boolean` | `true` | Lets the model **request** running a command outside the sandbox by setting `dangerouslyDisableSandbox: true` on the tool input. Falls back to permission system |
| `network` | `SandboxNetworkConfig` | — | Network restrictions |
| `filesystem` | `SandboxFilesystemConfig` | — | Filesystem read/write restrictions |
| `ignoreViolations` | `Record<string, string[]>` | — | Map of violation category → patterns to ignore. E.g. `{ file: ['/tmp/*'], network: ['localhost'] }` |
| `enableWeakerNestedSandbox` | `boolean` | `false` | Compatibility knob for weaker nested sandbox |
| `ripgrep` | `{ command, args? }` | — | Custom `rg` binary inside the sandbox |

Example:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Build and test my project",
  options: {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      network: { allowLocalBinding: true },
    },
  },
})) {
  if ("result" in message) console.log(message.result);
}
```

## `SandboxNetworkConfig`

```typescript
type SandboxNetworkConfig = {
  allowedDomains?: string[];
  deniedDomains?: string[];
  allowManagedDomainsOnly?: boolean;
  allowLocalBinding?: boolean;
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
};
```

| Property | Type | Default | Description |
|---|---|---|---|
| `allowedDomains` | `string[]` | `[]` | Domains the sandboxed process can reach |
| `deniedDomains` | `string[]` | `[]` | Blocked domains. Takes precedence over `allowedDomains` |
| `allowManagedDomainsOnly` | `boolean` | `false` | **Managed settings only.** When set in managed settings, only `allowedDomains` from managed settings are honored — user/project/local entries are ignored. No-op when set via SDK options |
| `allowLocalBinding` | `boolean` | `false` | Let the process bind local ports (e.g. dev servers) |
| `allowUnixSockets` | `string[]` | `[]` | Unix socket paths the process can access |
| `allowAllUnixSockets` | `boolean` | `false` | Allow all Unix sockets |
| `httpProxyPort` | `number` | — | HTTP proxy port for network requests |
| `socksProxyPort` | `number` | — | SOCKS proxy port |

> **Note:** The built-in sandbox proxy enforces `allowedDomains` **by hostname**, not by terminating TLS. Techniques like [domain fronting](https://en.wikipedia.org/wiki/Domain_fronting) may bypass it. For real TLS termination + inspection, configure a TLS-terminating proxy (see [Secure deployment](https://docs.claude.com/zh-CN/agent-sdk/secure-deployment#traffic-forwarding)).

> **⚠ Warning:** `allowUnixSockets` can grant access to powerful system services. Allowing `/var/run/docker.sock` effectively gives full host access via Docker API, bypassing isolation. Only allow strictly necessary sockets.

## `SandboxFilesystemConfig`

```typescript
type SandboxFilesystemConfig = {
  allowWrite?: string[];
  denyWrite?: string[];
  denyRead?: string[];
};
```

| Property | Type | Default | Description |
|---|---|---|---|
| `allowWrite` | `string[]` | `[]` | Path patterns that allow write access |
| `denyWrite` | `string[]` | `[]` | Path patterns that deny write access |
| `denyRead` | `string[]` | `[]` | Path patterns that deny read access |

> The schema in the public docs lists `allowWrite/denyWrite/denyRead`. The internal Zod schema also exposes `allowRead` + `allowManagedReadPathsOnly` (visible in `sidecar/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`'s `SandboxFilesystemConfigSchema`). When restricting reads, prefer `allowRead: [workspace]` if your SDK version exposes it; otherwise use `denyRead` for everything else.

## `dangerouslyDisableSandbox` fallback

With `allowUnsandboxedCommands: true`, the model may request unsandboxed execution by setting `dangerouslyDisableSandbox: true` in tool input. The request falls back to `canUseTool` — implement your authorization logic there.

> **`excludedCommands` vs `allowUnsandboxedCommands`:**
> - `excludedCommands`: static list, **always** bypasses sandbox. Model has no control.
> - `allowUnsandboxedCommands`: lets the model decide at runtime whether to **request** unsandboxed execution.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Deploy my application",
  options: {
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: true,
    },
    permissionMode: "default",
    canUseTool: async (tool, input) => {
      if (tool === "Bash" && input.dangerouslyDisableSandbox) {
        console.log(`Unsandboxed command requested: ${input.command}`);
        if (isCommandAuthorized(input.command as string)) {
          return { behavior: "allow" as const, updatedInput: input };
        }
        return {
          behavior: "deny" as const,
          message: "Command not authorized for unsandboxed execution",
        };
      }
      return { behavior: "allow" as const, updatedInput: input };
    },
  },
})) {
  if ("result" in message) console.log(message.result);
}
```

Use cases:
- **Audit:** log when the model requests unsandboxed execution
- **Allowlist:** only permit specific commands outside the sandbox
- **Approval flow:** require explicit authorization for privileged operations

> **⚠ Warning:** Commands run with `dangerouslyDisableSandbox: true` have full system access. Validate carefully in `canUseTool`.
>
> **`permissionMode: 'bypassPermissions'` + `allowUnsandboxedCommands: true`** lets the model silently escape the sandbox. Avoid that combination.

## Platform notes

- **macOS** — uses `sandbox-exec` / Seatbelt. Built into the OS — no extra dependency.
- **Linux** — requires `bubblewrap` (`bwrap`). Most distros ship a package: `apt install bubblewrap`, `dnf install bubblewrap`, etc. The SDK auto-detects `bwrap` on PATH; override via the **managed-settings only** key `bwrapPath` (admin-controlled, not exposed in user-level `SandboxSettings`).
- **Windows** — sandbox support is less mature than the other two platforms. Verify via live docs before promising it to users.

## Why this matters for Agent Studio

Agent Studio's `sidecar/src/agui/provider-claude/sandbox.ts` does **string-level** path checks before tools run. That's good as a fast-deny UX layer (model gets a clear deny reason). But it is **not** an enforcement boundary — anything that escapes our `checkWorkspaceSandbox()` function would still run with sidecar's full user privileges.

Adopting the SDK sandbox layers kernel-enforced boundaries underneath:

```typescript
sdkQuery({
  prompt,
  options: {
    cwd: ctx.cwd,
    canUseTool,
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      filesystem: {
        allowRead:  [ctx.cwd],
        allowWrite: [ctx.cwd],
      },
      network: {
        allowedDomains: ["api.anthropic.com", "registry.npmjs.org"],
      },
    },
    // ...
  },
});
```

After enabling, `checkWorkspaceSandbox()` becomes a UX hint, and HITL becomes user-experience rather than a security boundary.

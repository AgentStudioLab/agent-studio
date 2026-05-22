# Sessions

Source: <https://docs.claude.com/zh-CN/agent-sdk/typescript>.

## TOC

- [`listSessions`](#listsessions)
- [`getSessionMessages`](#getsessionmessages)
- [`getSessionInfo`](#getsessioninfo)
- [`renameSession`](#renamesession)
- [`tagSession`](#tagsession)
- [`SDKSessionInfo` / `SessionMessage`](#types)
- [Resume strategy](#resume-strategy) — how to wire `session_id` capture + `resume`

For external session mirroring (`sessionStore: SessionStore`) see <https://docs.claude.com/zh-CN/agent-sdk/session-storage>.

---

## `listSessions`

```typescript
function listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
```

| Param | Type | Default | Description |
|---|---|---|---|
| `options.dir` | `string` | — | Directory to list sessions for. Omit → all projects |
| `options.limit` | `number` | — | Max sessions to return |
| `options.includeWorktrees` | `boolean` | `true` | When `dir` is inside a git repo, include sessions from all worktree paths |

Returned `SDKSessionInfo[]` is sorted by `lastModified` desc — first item is newest.

```typescript
import { listSessions } from "@anthropic-ai/claude-agent-sdk";

const sessions = await listSessions({ dir: "/path/to/project", limit: 10 });
for (const s of sessions) {
  console.log(`${s.summary} (${s.sessionId})`);
}
```

---

## `getSessionMessages`

Read user + assistant messages from a past session.

```typescript
function getSessionMessages(
  sessionId: string,
  options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]>;
```

| Param | Type | Default | Description |
|---|---|---|---|
| `sessionId` | `string` | required | UUID from `listSessions()` |
| `options.dir` | `string` | — | Project directory. Omit → search all projects |
| `options.limit` | `number` | — | Max messages |
| `options.offset` | `number` | — | Skip from beginning |

```typescript
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

const [latest] = await listSessions({ dir: "/path/to/project", limit: 1 });
if (latest) {
  const messages = await getSessionMessages(latest.sessionId, {
    dir: "/path/to/project",
    limit: 20,
  });
  for (const msg of messages) console.log(`[${msg.type}] ${msg.uuid}`);
}
```

---

## `getSessionInfo`

```typescript
function getSessionInfo(
  sessionId: string,
  options?: GetSessionInfoOptions,
): Promise<SDKSessionInfo | undefined>;
```

| Param | Type | Default | Description |
|---|---|---|---|
| `sessionId` | `string` | required | UUID |
| `options.dir` | `string` | — | Project directory. Omit → search all |

Returns `undefined` if not found.

---

## `renameSession`

Append a custom-title entry. Safe to call repeatedly; latest title wins.

```typescript
function renameSession(
  sessionId: string,
  title: string,                       // must be non-empty after trim
  options?: SessionMutationOptions,
): Promise<void>;
```

---

## `tagSession`

Tag a session. Pass `null` to clear.

```typescript
function tagSession(
  sessionId: string,
  tag: string | null,
  options?: SessionMutationOptions,
): Promise<void>;
```

---

## Types

### `SDKSessionInfo`

| Property | Type | Description |
|---|---|---|
| `sessionId` | `string` | UUID |
| `summary` | `string` | Display title — custom title, auto-generated summary, or first prompt |
| `lastModified` | `number` | Last-modified ms epoch |
| `fileSize` | `number?` | File size in bytes. Only populated for local JSONL storage |
| `customTitle` | `string?` | User-set title (via `renameSession`) |
| `firstPrompt` | `string?` | First meaningful user prompt |
| `gitBranch` | `string?` | Git branch at session end |
| `cwd` | `string?` | Working directory |
| `tag` | `string?` | User-set tag |
| `createdAt` | `number?` | Created ms epoch, from first entry's timestamp |

### `SessionMessage`

| Property | Type | Description |
|---|---|---|
| `type` | `"user" \| "assistant"` | Message role |
| `uuid` | `string` | Unique message id |
| `session_id` | `string` | Owning session |
| `message` | `unknown` | Raw message payload from the transcript |
| `parent_tool_use_id` | `string \| null` | For subagent messages: the `tool_use_id` of the `Agent` tool call that spawned them. `null` for main-session messages and older sessions |

---

## Resume strategy

How the SDK threads sessions through `query()` calls:

1. **First turn** — no `resume`. The CLI allocates a fresh `session_id` and emits it in the first `SDKSystemMessage` (`subtype: "init"`). Capture it.
2. **Subsequent turns** — pass `options.resume: <session_id>` to `query()`. The CLI re-loads the transcript and continues.
3. **Forking** — pass `options.forkSession: true` along with `resume` to create a new `session_id` branched off the resumed one. The original session keeps its history; the new session id is emitted on its own first `init`.
4. **Resume at a point** — pass `options.resumeSessionAt: <message_uuid>` to resume only up to and including that message. Combine with `forkSession` to "edit and retry from message X".
5. **Multi-turn cancellation** — `query()`'s `abortController.abort()` kills the in-flight turn but **does not lose context**. Capture the `session_id` from each successful turn's `init` event and pass it back on the next call.

Agent Studio's `sidecar/src/agui/provider-claude/provider.ts` already does this:

```typescript
const sessionByThread = new Map<string, string>();

function runTurn(ctx, prompt) {
  const ac = new AbortController();
  ctx.abortSignal.addEventListener("abort", () => ac.abort(ctx.abortSignal.reason), { once: true });

  const resumeSessionId = sessionByThread.get(ctx.threadId);

  const sdkStream = sdkQuery({
    prompt,
    options: {
      abortController: ac,
      // ...
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
    },
  });

  return claudeSdkToAgui(sdkStream, {
    threadId: ctx.threadId,
    runId: ctx.runId,
    callbacks: ctx.callbacks,
    onSessionId: (sid) => sessionByThread.set(ctx.threadId, sid),
  });
}
```

The `onSessionId` callback fires when bridging the first `system/init` event. Storing per-thread maintains independent transcripts across UI threads while the SDK manages the JSONL on disk.

### Notes

- The SDK writes JSONL session files under the platform's data dir. `persistSession: false` opts out of that — the session cannot then be resumed.
- For multi-host setups (e.g. backend behind a load balancer), use `sessionStore: SessionStore` to mirror sessions to external storage so any host can pick them up.

import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type { SideEffectFile } from "../agui/provider-claude/bash-side-effects";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface MessageDTO {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  reasoning?: string;
  createdAt: number;
  toolCalls?: ToolCallDTO[];
}

export interface ToolCallDTO {
  id: string;
  toolName: string;
  args: unknown;
  result: unknown | null;
  status: "pending" | "success" | "error";
  errorMsg?: string;
  /**
   * Bash-only: files the tool indirectly produced/modified, detected by the
   * sidecar's PostToolUse cwd-diff hook. Mutation tools declare targets in args.
   */
  sideEffects?: SideEffectFile[];
}

export type TurnDTO =
  | { id: string; role: "user"; content: string; createdAt: number }
  | { id: string; role: "assistant"; blocks: AssistantBlock[]; createdAt: number };

export type NoticeReason = "user" | "process_restart";

export type AssistantBlock =
  | { kind: "text"; id: string; content: string }
  | { kind: "reasoning"; id: string; content: string }
  | { kind: "tool_call"; toolCall: ToolCallDTO }
  | {
      kind: "notice";
      id: string;
      level: "interrupted";
      content: string;
      reason?: NoticeReason;
    };

/**
 * System notes carry a `[reason]` content prefix (currently `[process_restart]`).
 * `appendSystemNote` stays plain text, but `groupIntoTurns` parses the prefix
 * back into a structured `reason` field on the notice block so the UI doesn't
 * have to string-match. No DB migration needed; old "已被用户中止" rows have
 * no prefix → reason undefined (defaults to user in the frontend).
 */
const PREFIX_PATTERN = /^\[(user|process_restart)\]\s*/;
function parseNoticeReason(content: string): {
  reason: NoticeReason | undefined;
  display: string;
} {
  const m = PREFIX_PATTERN.exec(content);
  if (!m) return { reason: undefined, display: content };
  return { reason: m[1] as NoticeReason, display: content.slice(m[0].length) };
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  reasoning: string | null;
  created_at: number;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  tool_name: string;
  args: string;
  result: string | null;
  status: "pending" | "success" | "error";
  error_msg: string | null;
  side_effects: string | null;
  created_at: number;
}

function safeJson(s: string | null): unknown {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * Decode tool_calls.side_effects (JSON column). Returns null for missing /
 * malformed / empty arrays so the DTO field stays `undefined` rather than
 * containing []. Each entry is validated — bad entries are dropped silently.
 */
function parseSideEffects(s: string | null): SideEffectFile[] | null {
  if (s == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: SideEffectFile[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.path !== "string") continue;
    if (o.kind !== "created" && o.kind !== "modified") continue;
    out.push({ path: o.path, kind: o.kind });
  }
  return out.length > 0 ? out : null;
}

export class MessageService {
  constructor(private db: Database) {}

  appendUser(threadId: string, content: string, id = `msg_${nanoid(12)}`): MessageDTO {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO messages (id, thread_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
      )
      .run(id, threadId, content, now);
    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, threadId);
    return { id, threadId, role: "user", content, createdAt: now };
  }

  /**
   * Upsert an assistant message. Idempotent on id so a stream that revisits
   * the same AIMessage (rare but possible — bridge re-emits when streaming
   * + assistant arrive twice) does not crash on PK violation; instead the
   * later write wins (content/reasoning update).
   */
  appendAssistant(
    threadId: string,
    input: { id: string; content: string; reasoning?: string },
  ): MessageDTO {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO messages (id, thread_id, role, content, reasoning, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           reasoning = excluded.reasoning`,
      )
      .run(input.id, threadId, input.content, input.reasoning ?? null, now);
    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, threadId);
    return {
      id: input.id,
      threadId,
      role: "assistant",
      content: input.content,
      reasoning: input.reasoning,
      createdAt: now,
    };
  }

  appendSystemNote(threadId: string, content: string, id = `msg_${nanoid(12)}`): MessageDTO {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO messages (id, thread_id, role, content, created_at)
         VALUES (?, ?, 'system', ?, ?)`,
      )
      .run(id, threadId, content, now);
    return { id, threadId, role: "system", content, createdAt: now };
  }

  upsertToolCall(
    messageId: string,
    input: { id: string; toolName: string; args: unknown },
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO tool_calls (id, message_id, tool_name, args, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)
         ON CONFLICT(id) DO UPDATE SET tool_name = excluded.tool_name, args = excluded.args`,
      )
      .run(input.id, messageId, input.toolName, JSON.stringify(input.args ?? null), now);
  }

  completeToolCall(
    id: string,
    payload: {
      result: unknown;
      status: "success" | "error";
      errorMsg?: string;
      sideEffects?: SideEffectFile[];
    },
  ): void {
    this.db
      .prepare(
        `UPDATE tool_calls
         SET result = ?, status = ?, error_msg = ?, side_effects = ?
         WHERE id = ?`,
      )
      .run(
        JSON.stringify(payload.result ?? null),
        payload.status,
        payload.errorMsg ?? null,
        payload.sideEffects && payload.sideEffects.length > 0
          ? JSON.stringify(payload.sideEffects)
          : null,
        id,
      );
  }

  cancelPendingToolCallsForThread(
    threadId: string,
    errorMsg = "tool execution did not complete",
  ): void {
    this.db
      .prepare(
        `UPDATE tool_calls SET status = 'error', error_msg = ?
         WHERE status = 'pending'
           AND message_id IN (SELECT id FROM messages WHERE thread_id = ?)`,
      )
      .run(errorMsg, threadId);
  }

  listByThread(threadId: string): MessageDTO[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
      )
      .all(threadId) as MessageRow[];
    const out: MessageDTO[] = [];
    for (const r of rows) {
      const tcs = this.db
        .prepare("SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC")
        .all(r.id) as ToolCallRow[];
      out.push({
        id: r.id,
        threadId: r.thread_id,
        role: r.role,
        content: r.content,
        reasoning: r.reasoning ?? undefined,
        createdAt: r.created_at,
        toolCalls: tcs.length
          ? tcs.map((t) => {
              const dto: ToolCallDTO = {
                id: t.id,
                toolName: t.tool_name,
                args: safeJson(t.args),
                result: safeJson(t.result),
                status: t.status,
                errorMsg: t.error_msg ?? undefined,
              };
              const effects = parseSideEffects(t.side_effects);
              if (effects) dto.sideEffects = effects;
              return dto;
            })
          : undefined,
      });
    }
    return out;
  }

  /**
   * Group flat message rows into turn-shaped view for the chat UI.
   * Mirrors agui-server's groupIntoTurns.
   */
  listByThreadGrouped(threadId: string): TurnDTO[] {
    const flat = this.listByThread(threadId);
    return groupIntoTurns(flat);
  }
}

export function groupIntoTurns(rows: MessageDTO[]): TurnDTO[] {
  const out: TurnDTO[] = [];
  let activeAssistant: Extract<TurnDTO, { role: "assistant" }> | null = null;

  for (const r of rows) {
    if (r.role === "user") {
      activeAssistant = null;
      out.push({ id: r.id, role: "user", content: r.content, createdAt: r.createdAt });
      continue;
    }
    if (r.role === "system") {
      if (!activeAssistant) {
        activeAssistant = {
          id: r.id,
          role: "assistant",
          blocks: [],
          createdAt: r.createdAt,
        };
        out.push(activeAssistant);
      }
      const { reason, display } = parseNoticeReason(r.content);
      activeAssistant.blocks.push({
        kind: "notice",
        id: r.id,
        level: "interrupted",
        content: display,
        ...(reason ? { reason } : {}),
      });
      continue;
    }
    if (r.role !== "assistant") continue;

    if (!activeAssistant) {
      activeAssistant = {
        id: r.id,
        role: "assistant",
        blocks: [],
        createdAt: r.createdAt,
      };
      out.push(activeAssistant);
    }

    if (r.reasoning && r.reasoning.length > 0) {
      activeAssistant.blocks.push({
        kind: "reasoning",
        id: `${r.id}:reasoning`,
        content: r.reasoning,
      });
    }
    if (r.content && r.content.length > 0) {
      activeAssistant.blocks.push({ kind: "text", id: r.id, content: r.content });
    }
    for (const tc of r.toolCalls ?? []) {
      activeAssistant.blocks.push({ kind: "tool_call", toolCall: tc });
    }
  }

  return out;
}

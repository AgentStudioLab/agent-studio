import type { Database } from "bun:sqlite";
import { ulid } from "../lib/ulid";
import type {
  Conversation,
  ConversationMode,
  CreateConversationInput,
  Message,
} from "../types";

interface ConversationRow {
  id: string;
  title: string;
  project_id: string | null;
  mode: ConversationMode;
  status: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    title: r.title,
    projectId: r.project_id,
    mode: r.mode,
    status: r.status as Conversation["status"],
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createConversation(
  db: Database,
  input: CreateConversationInput,
): Conversation {
  const id = ulid();
  const now = Date.now();
  const title = input.prompt.slice(0, 60);
  const msgId = ulid();
  const blocks = JSON.stringify([{ type: "text", text: input.prompt }]);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO conversations (id, title, project_id, mode, status, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
    ).run(id, title, input.projectId ?? null, input.mode, now, now);

    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
       VALUES (?, ?, 'user', ?, ?, 'end_turn', NULL)`,
    ).run(msgId, id, blocks, now);
  })();

  return {
    id,
    title,
    projectId: input.projectId ?? null,
    mode: input.mode,
    status: "active",
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function listConversations(
  db: Database,
  opts: { limit: number; pinnedOnly?: boolean },
): Conversation[] {
  const where = opts.pinnedOnly ? "WHERE pinned = 1" : "";
  const rows = db
    .prepare(
      `SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(opts.limit) as ConversationRow[];
  return rows.map(rowToConversation);
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  blocks_json: string;
  created_at: number;
  finish_reason: string | null;
  error_text: string | null;
}

export function getConversation(db: Database, id: string): Conversation | null {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | ConversationRow
    | undefined;
  return row ? rowToConversation(row) : null;
}

export function getMessages(db: Database, conversationId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    blocks: JSON.parse(r.blocks_json),
    createdAt: r.created_at,
    finishReason: r.finish_reason as Message["finishReason"],
    errorText: r.error_text,
  }));
}

export function updatePin(db: Database, id: string, pinned: boolean): void {
  db.prepare("UPDATE conversations SET pinned = ?, updated_at = ? WHERE id = ?").run(
    pinned ? 1 : 0,
    Date.now(),
    id,
  );
}

export function updateTitle(db: Database, id: string, title: string): void {
  db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function deleteConversation(db: Database, id: string): void {
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

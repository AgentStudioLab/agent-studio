import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type { ChannelSession, ChannelType } from "./ChannelTypes";

interface ChannelSessionRow {
  id: string;
  connection_id: string;
  channel_type: ChannelType;
  chat_id: string;
  sender_id: string;
  display_name: string | null;
  conversation_id: string;
  active_task_id: string | null;
  created_at: number;
  updated_at: number;
}

function rowToSession(row: ChannelSessionRow): ChannelSession {
  return {
    id: row.id,
    connectionId: row.connection_id,
    channelType: row.channel_type,
    chatId: row.chat_id,
    senderId: row.sender_id,
    displayName: row.display_name,
    conversationId: row.conversation_id,
    activeTaskId: row.active_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ChannelSessionService {
  constructor(private db: Database) {}

  find(connectionId: string, chatId: string, senderId: string): ChannelSession | null {
    const row = this.db
      .prepare(
        `SELECT * FROM channel_sessions
         WHERE connection_id = ? AND chat_id = ? AND sender_id = ?`,
      )
      .get(connectionId, chatId, senderId) as ChannelSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  get(id: string): ChannelSession | null {
    const row = this.db
      .prepare("SELECT * FROM channel_sessions WHERE id = ?")
      .get(id) as ChannelSessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  getOrCreate(input: {
    connectionId: string;
    channelType: ChannelType;
    chatId: string;
    senderId: string;
    displayName?: string;
    conversationId: string;
  }): ChannelSession {
    const existing = this.find(input.connectionId, input.chatId, input.senderId);
    if (existing) return existing;

    const id = `chs_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO channel_sessions
          (id, connection_id, channel_type, chat_id, sender_id, display_name, conversation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.connectionId,
        input.channelType,
        input.chatId,
        input.senderId,
        input.displayName ?? null,
        input.conversationId,
        now,
        now,
      );
    return this.get(id)!;
  }

  setActiveTask(sessionId: string, taskId: string): ChannelSession {
    this.db
      .prepare("UPDATE channel_sessions SET active_task_id = ?, updated_at = ? WHERE id = ?")
      .run(taskId, Date.now(), sessionId);
    const session = this.get(sessionId);
    if (!session) throw new Error(`channel session ${sessionId} not found`);
    return session;
  }

  clearActiveTask(sessionId: string, taskId?: string): ChannelSession {
    const now = Date.now();
    if (taskId) {
      this.db
        .prepare(
          `UPDATE channel_sessions
           SET active_task_id = NULL, updated_at = ?
           WHERE id = ? AND active_task_id = ?`,
        )
        .run(now, sessionId, taskId);
    } else {
      this.db
        .prepare("UPDATE channel_sessions SET active_task_id = NULL, updated_at = ? WHERE id = ?")
        .run(now, sessionId);
    }
    const session = this.get(sessionId);
    if (!session) throw new Error(`channel session ${sessionId} not found`);
    return session;
  }
}

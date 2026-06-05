import type { ChannelSessionService } from "../core/ChannelSessionService";
import type { ChannelSession } from "../core/ChannelTypes";
import type {
  UnifiedIncomingAttachment,
  UnifiedIncomingMessage,
} from "../core/PluginRegistry";

interface PendingAggregate {
  session: ChannelSession;
  connectionId: string;
  chatId: string;
  senderId: string;
  instructionText?: string;
  attachments: UnifiedIncomingAttachment[];
  contextToken?: string;
  updatedAt: number;
}

type AggregatorResult =
  | { type: "ignored" }
  | { type: "wait_for_file" }
  | { type: "wait_for_instruction" }
  | { type: "busy"; text: string; session: ChannelSession }
  | {
      type: "ready";
      instructionText: string;
      attachments: UnifiedIncomingAttachment[];
      contextToken?: string;
      session: ChannelSession;
    };

type ExpiredAggregate =
  | {
      type: "ask_for_file";
      connectionId: string;
      chatId: string;
      senderId: string;
      text: string;
      contextToken?: string;
    }
  | {
      type: "ask_for_instruction";
      connectionId: string;
      chatId: string;
      senderId: string;
      text: string;
      contextToken?: string;
    };

export class RemoteTaskAggregator {
  private pending = new Map<string, PendingAggregate>();
  private waitMs: number;
  private now: () => number;

  constructor(private deps: {
    sessions: ChannelSessionService;
    waitMs?: number;
    now?: () => number;
  }) {
    this.waitMs = deps.waitMs ?? 30_000;
    this.now = deps.now ?? (() => Date.now());
  }

  async ingest(message: UnifiedIncomingMessage): Promise<AggregatorResult> {
    const hasText = typeof message.text === "string" && message.text.trim() !== "";
    const hasAttachments = message.attachments.length > 0;
    if (!hasText && !hasAttachments) return { type: "ignored" };

    const session = await this.deps.sessions.getOrCreate({
      connectionId: message.connectionId,
      channelType: message.channelType,
      chatId: message.chatId,
      senderId: message.senderId,
      displayName: message.displayName,
      conversationId: `remote_${message.connectionId}_${message.chatId}_${message.senderId}`,
    });
    if (session.activeTaskId) {
      return {
        type: "busy",
        text: "当前会话已有远程任务在执行，请等待完成后再发送新任务。",
        session,
      };
    }

    const key = this.key(message.connectionId, message.chatId, message.senderId);
    const pending = this.pending.get(key) ?? {
      session,
      connectionId: message.connectionId,
      chatId: message.chatId,
      senderId: message.senderId,
      attachments: [],
      updatedAt: this.now(),
    };

    if (hasText) pending.instructionText = message.text!.trim();
    if (hasAttachments) pending.attachments.push(...message.attachments);
    if (message.contextToken) pending.contextToken = message.contextToken;
    pending.updatedAt = this.now();
    pending.session = session;
    this.pending.set(key, pending);

    if (pending.instructionText && pending.attachments.length > 0) {
      this.pending.delete(key);
      return {
        type: "ready",
        instructionText: pending.instructionText,
        attachments: pending.attachments,
        contextToken: pending.contextToken,
        session,
      };
    }

    return pending.instructionText
      ? { type: "wait_for_file" }
      : { type: "wait_for_instruction" };
  }

  flushExpired(): ExpiredAggregate[] {
    const now = this.now();
    const expired: ExpiredAggregate[] = [];
    for (const [key, pending] of this.pending) {
      if (now - pending.updatedAt <= this.waitMs) continue;
      this.pending.delete(key);
      if (pending.instructionText && pending.attachments.length === 0) {
        expired.push({
          type: "ask_for_file",
          connectionId: pending.connectionId,
          chatId: pending.chatId,
          senderId: pending.senderId,
          text: "请继续发送要处理的文件。",
          contextToken: pending.contextToken,
        });
      } else if (!pending.instructionText && pending.attachments.length > 0) {
        expired.push({
          type: "ask_for_instruction",
          connectionId: pending.connectionId,
          chatId: pending.chatId,
          senderId: pending.senderId,
          text: "请继续发送任务说明。",
          contextToken: pending.contextToken,
        });
      }
    }
    return expired;
  }

  private key(connectionId: string, chatId: string, senderId: string): string {
    return `${connectionId}\u0000${chatId}\u0000${senderId}`;
  }
}

export type { AggregatorResult, ExpiredAggregate };

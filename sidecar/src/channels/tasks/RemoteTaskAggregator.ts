import type { ChannelSessionService } from "../core/ChannelSessionService";
import type { ChannelSession } from "../core/ChannelTypes";
import type { UnifiedIncomingMessage } from "../core/PluginRegistry";

const ATTACHMENT_ONLY_INSTRUCTION = "Received remote attachments.";

interface RemoteTaskStatusReader {
  get(taskId: string): { status: string } | null;
}

type AggregatorResult =
  | { type: "ignored" }
  | { type: "busy"; session: ChannelSession }
  | {
      type: "ready";
      instructionText: string;
      attachments: UnifiedIncomingMessage["attachments"];
      contextToken?: string;
      session?: ChannelSession;
    };

type ExpiredAggregate = never;

export class RemoteTaskAggregator {
  constructor(private deps: {
    sessions: ChannelSessionService;
    tasks?: RemoteTaskStatusReader;
    waitMs?: number;
    now?: () => number;
  }) {}

  async ingest(message: UnifiedIncomingMessage): Promise<AggregatorResult> {
    const hasText = typeof message.text === "string" && message.text.trim() !== "";
    const hasAttachments = message.attachments.length > 0;
    if (!hasText && !hasAttachments) return { type: "ignored" };

    const session = this.deps.sessions.find(
      message.connectionId,
      message.chatId,
      message.senderId,
    );
    if (session?.activeTaskId && this.isActiveTaskStillRunning(session.activeTaskId)) {
      return {
        type: "busy",
        session,
      };
    }

    return {
      type: "ready",
      instructionText: hasText ? message.text!.trim() : ATTACHMENT_ONLY_INSTRUCTION,
      attachments: message.attachments,
      contextToken: message.contextToken,
      ...(session ? { session } : {}),
    };
  }

  flushExpired(): ExpiredAggregate[] {
    return [];
  }

  private isActiveTaskStillRunning(taskId: string): boolean {
    if (!this.deps.tasks) return true;
    const task = this.deps.tasks?.get(taskId);
    return task?.status === "running";
  }
}

export type { AggregatorResult, ExpiredAggregate };

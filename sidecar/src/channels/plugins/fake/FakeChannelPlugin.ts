import type {
  ChannelPlugin,
  UnifiedIncomingMessage,
  UnifiedOutgoingMessage,
} from "../../core/PluginRegistry";
import type { ChannelConnection } from "../../core/ChannelTypes";

export class FakeChannelPlugin implements ChannelPlugin {
  readonly type = "fake" as const;
  readonly sentMessages: Array<{
    connectionId: string;
    message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string };
  }> = [];
  private handler: ((message: UnifiedIncomingMessage) => Promise<void>) | null = null;
  private running = new Set<string>();

  async start(connection: ChannelConnection): Promise<void> {
    this.running.add(connection.id);
  }

  async stop(connectionId: string): Promise<void> {
    this.running.delete(connectionId);
  }

  async send(
    connectionId: string,
    message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string },
  ): Promise<void> {
    this.sentMessages.push({ connectionId, message });
  }

  onMessage(handler: (message: UnifiedIncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async emitIncoming(message: UnifiedIncomingMessage): Promise<void> {
    if (!this.handler) return;
    await this.handler(message);
  }

  clear(): void {
    this.sentMessages.length = 0;
  }

  isRunning(connectionId: string): boolean {
    return this.running.has(connectionId);
  }
}

import type { ChannelConnectionService } from "./ChannelConnectionService";
import type { ChannelConnection, ChannelType } from "./ChannelTypes";
import type { PluginRegistry, UnifiedIncomingMessage } from "./PluginRegistry";
import type { RemoteTaskAggregator } from "../tasks/RemoteTaskAggregator";
import type {
  RemoteTaskSendInput,
  RemoteTaskService,
} from "../tasks/RemoteTaskService";

export class ChannelManager {
  private handlersAttached = false;

  constructor(private deps: {
    connections: ChannelConnectionService;
    registry: PluginRegistry;
    aggregator: RemoteTaskAggregator;
    tasks: RemoteTaskService;
  }) {}

  async startEnabled(): Promise<void> {
    this.attachPluginHandlers();
    for (const connection of this.deps.connections.listEnabled()) {
      await this.start(connection.id);
    }
  }

  async start(connectionId: string): Promise<void> {
    this.attachPluginHandlers();
    const connection = this.deps.connections.getInternal(connectionId);
    if (!connection) throw new Error(`channel connection ${connectionId} not found`);
    const plugin = this.deps.registry.require(connection.type);
    try {
      await plugin.start(connection);
      this.deps.connections.update(connectionId, { enabled: true });
      this.deps.connections.updateStatus(connectionId, "running");
    } catch (err) {
      this.deps.connections.updateStatus(
        connectionId,
        "error",
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  async stop(connectionId: string): Promise<void> {
    const connection = this.deps.connections.getInternal(connectionId);
    if (!connection) throw new Error(`channel connection ${connectionId} not found`);
    const plugin = this.deps.registry.require(connection.type);
    await plugin.stop(connectionId);
    this.deps.connections.update(connectionId, { enabled: false });
    this.deps.connections.updateStatus(connectionId, "stopped");
  }

  attachPluginHandlers(): void {
    if (this.handlersAttached) return;
    this.handlersAttached = true;
    for (const plugin of this.deps.registry.list()) {
      plugin.onMessage?.((message) => this.handleIncoming(message));
    }
  }

  async sendRemoteTaskResult(input: RemoteTaskSendInput): Promise<void> {
    const plugin = this.deps.registry.require(input.channelType);
    const message = {
      chatId: input.chatId,
      ...(input.contextToken ? { contextToken: input.contextToken } : {}),
      ...(input.files.length > 0
        ? { type: "files" as const, text: input.text, files: input.files }
        : { type: "text" as const, text: input.text }),
    };
    const withConnection = plugin as typeof plugin & {
      sendWithConnection?: (
        connection: NonNullable<ReturnType<ChannelConnectionService["getInternal"]>>,
        message: Parameters<typeof plugin.send>[1],
      ) => Promise<void>;
    };
    const connection = this.deps.connections.getInternal(input.connectionId);
    if (connection && withConnection.sendWithConnection) {
      await withConnection.sendWithConnection(connection, message);
      return;
    }
    await plugin.send(input.connectionId, message);
  }

  async recoverRemoteTasksOnBoot(): Promise<void> {
    await this.deps.tasks.recoverRunningTasks();
  }

  private async handleIncoming(message: UnifiedIncomingMessage): Promise<void> {
    const result = await this.deps.aggregator.ingest(message);
    if (result.type === "ready") {
      await this.deps.tasks.createReadyTask({
        connectionId: message.connectionId,
        channelType: message.channelType,
        chatId: message.chatId,
        senderId: message.senderId,
        displayName: message.displayName,
        instructionText: result.instructionText,
        attachments: result.attachments,
        contextToken: result.contextToken,
      });
      return;
    }
    if (result.type === "busy") {
      await this.sendText(message.channelType, message.connectionId, message.chatId, result.text, message.contextToken);
    }
  }

  private async sendText(
    channelType: ChannelType,
    connectionId: string,
    chatId: string,
    text: string,
    contextToken?: string,
  ): Promise<void> {
    const plugin = this.deps.registry.require(channelType);
    await plugin.send(connectionId, {
      chatId,
      ...(contextToken ? { contextToken } : {}),
      type: "text",
      text,
    });
  }
}

export function statusForConnection(connection: ChannelConnection): ChannelConnection["status"] {
  return connection.status;
}

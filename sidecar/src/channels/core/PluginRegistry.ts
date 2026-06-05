import type { ChannelConnection, ChannelType } from "./ChannelTypes";

export interface UnifiedIncomingAttachment {
  type: "file" | "image";
  path: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface UnifiedIncomingMessage {
  id: string;
  connectionId: string;
  channelType: ChannelType;
  chatId: string;
  senderId: string;
  displayName?: string;
  text?: string;
  attachments: UnifiedIncomingAttachment[];
  contextToken?: string;
  timestamp: number;
  raw?: unknown;
}

export type UnifiedOutgoingMessage =
  | {
      type: "text";
      text: string;
      files?: never;
    }
  | {
      type: "files";
      text?: string;
      files: Array<{
        type: "file" | "image";
        path: string;
        fileName?: string;
        caption?: string;
      }>;
    };

export interface ChannelPlugin {
  readonly type: ChannelType;
  start(connection: ChannelConnection): Promise<void>;
  stop(connectionId: string): Promise<void>;
  send(
    connectionId: string,
    message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string },
  ): Promise<void>;
  onMessage?(handler: (message: UnifiedIncomingMessage) => Promise<void>): void;
}

export class PluginRegistry {
  private plugins = new Map<ChannelType, ChannelPlugin>();

  register(plugin: ChannelPlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: ChannelType): ChannelPlugin | null {
    return this.plugins.get(type) ?? null;
  }

  require(type: ChannelType): ChannelPlugin {
    const plugin = this.get(type);
    if (!plugin) throw new Error(`channel plugin not registered: ${type}`);
    return plugin;
  }

  list(): ChannelPlugin[] {
    return [...this.plugins.values()];
  }
}

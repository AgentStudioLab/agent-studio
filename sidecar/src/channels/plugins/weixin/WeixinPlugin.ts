import { join } from "node:path";
import { homedir } from "node:os";
import type { ChannelConnection } from "../../core/ChannelTypes";
import type {
  ChannelPlugin,
  UnifiedIncomingMessage,
  UnifiedOutgoingMessage,
} from "../../core/PluginRegistry";
import { toUnifiedIncomingMessage } from "./WeixinAdapter";
import { createWeixinMonitor, sendWeixinOutgoing } from "./WeixinMonitor";

type WeixinPluginDeps = {
  createMonitor?: typeof createWeixinMonitor;
  sendOutgoing?: typeof sendWeixinOutgoing;
  dataDir?: string;
};

export class WeixinPlugin implements ChannelPlugin {
  readonly type = "weixin" as const;
  private handler: ((message: UnifiedIncomingMessage) => Promise<void>) | null = null;
  private aborters = new Map<string, AbortController>();

  constructor(private deps: WeixinPluginDeps = {}) {}

  async start(connection: ChannelConnection): Promise<void> {
    const credentials = connection.credentials ?? {};
    const accountId = typeof credentials.accountId === "string" ? credentials.accountId : "";
    const botToken = typeof credentials.botToken === "string" ? credentials.botToken : "";
    const baseUrl =
      typeof credentials.baseUrl === "string"
        ? credentials.baseUrl
        : "https://ilinkai.weixin.qq.com";
    if (!accountId || !botToken) throw new Error("WeChat accountId and botToken are required");
    this.aborters.get(connection.id)?.abort();
    const abort = new AbortController();
    this.aborters.set(connection.id, abort);
    const monitor = (this.deps.createMonitor ?? createWeixinMonitor)({
      baseUrl,
      token: botToken,
      accountId,
      dataDir: this.deps.dataDir ?? join(homedir(), ".agent-studio"),
      abortSignal: abort.signal,
      onMessage: async (incoming) => {
        await this.handler?.(
          toUnifiedIncomingMessage({
            id: `weixin_${Date.now()}`,
            connectionId: connection.id,
            incoming,
          }),
        );
      },
      log: (message) => console.log(`[channels:weixin] ${message}`),
    });
    void (async () => {
      while (!abort.signal.aborted) {
        await monitor.pollOnce().catch((err) => {
          console.warn("[channels:weixin] poll failed:", err);
        });
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    })();
  }

  async stop(connectionId: string): Promise<void> {
    this.aborters.get(connectionId)?.abort();
    this.aborters.delete(connectionId);
  }

  async send(
    _connectionId: string,
    _message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string },
  ): Promise<void> {
    throw new Error("WeixinPlugin.send requires ChannelManager to pass connection credentials");
  }

  async sendWithConnection(
    connection: ChannelConnection,
    message: UnifiedOutgoingMessage & { chatId: string; contextToken?: string },
  ): Promise<void> {
    const credentials = connection.credentials ?? {};
    const accountId = typeof credentials.accountId === "string" ? credentials.accountId : "";
    const botToken = typeof credentials.botToken === "string" ? credentials.botToken : "";
    const baseUrl =
      typeof credentials.baseUrl === "string"
        ? credentials.baseUrl
        : "https://ilinkai.weixin.qq.com";
    await (this.deps.sendOutgoing ?? sendWeixinOutgoing)({
      baseUrl,
      token: botToken,
      accountId,
      chatId: message.chatId,
      contextToken: message.contextToken,
      text: message.type === "text" ? message.text : message.text,
      files: message.type === "files" ? message.files : [],
    });
  }

  onMessage(handler: (message: UnifiedIncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }
}

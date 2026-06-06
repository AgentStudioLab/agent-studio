import { describe, expect, it } from "bun:test";
import type { ChannelConnection } from "../../core/ChannelTypes";
import { WeixinPlugin } from "./WeixinPlugin";

function connection(id: string): ChannelConnection {
  return {
    id,
    type: "weixin",
    name: "WeChat",
    enabled: true,
    status: "running",
    credentials: {
      accountId: "bot_1",
      botToken: "token_1",
      baseUrl: "https://ilink.example",
    },
    config: { permissionStrategy: "auto_execute" },
    lastConnectedAt: null,
    errorMsg: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("WeixinPlugin", () => {
  it("aborts the old monitor before restarting the same connection", async () => {
    const monitorOptions: Array<{ abortSignal?: AbortSignal }> = [];
    const plugin = new WeixinPlugin({
      createMonitor: (options) => {
        monitorOptions.push(options);
        return { pollOnce: async () => {} };
      },
      dataDir: "/tmp/agent-works-test",
    });

    await plugin.start(connection("wx_1"));
    await plugin.start(connection("wx_1"));

    expect(monitorOptions).toHaveLength(2);
    expect(monitorOptions[0]!.abortSignal?.aborted).toBe(true);
    expect(monitorOptions[1]!.abortSignal?.aborted).toBe(false);
  });

  it("passes files to the WeChat outgoing sender", async () => {
    const sent: unknown[] = [];
    const plugin = new WeixinPlugin({
      sendOutgoing: async (input) => {
        sent.push(input);
      },
    });

    await plugin.sendWithConnection(connection("wx_1"), {
      type: "files",
      chatId: "chat_1",
      contextToken: "ctx_1",
      text: "Done",
      files: [
        {
          type: "file",
          path: "/tmp/report.pdf",
          fileName: "report.pdf",
          caption: "Report",
        },
      ],
    });

    expect(sent).toEqual([
      {
        baseUrl: "https://ilink.example",
        token: "token_1",
        accountId: "bot_1",
        chatId: "chat_1",
        contextToken: "ctx_1",
        text: "Done",
        files: [
          {
            type: "file",
            path: "/tmp/report.pdf",
            fileName: "report.pdf",
            caption: "Report",
          },
        ],
      },
    ]);
  });
});

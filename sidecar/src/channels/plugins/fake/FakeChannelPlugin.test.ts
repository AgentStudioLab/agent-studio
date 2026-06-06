import { describe, expect, it } from "bun:test";
import { FakeChannelPlugin } from "./FakeChannelPlugin";
import type { ChannelConnection } from "../../core/ChannelTypes";

function connection(): ChannelConnection {
  return {
    id: "conn_1",
    type: "fake",
    name: "Fake",
    enabled: true,
    status: "running",
    config: { permissionStrategy: "auto_execute" },
    lastConnectedAt: null,
    errorMsg: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("FakeChannelPlugin", () => {
  it("emits incoming messages to the registered handler", async () => {
    const plugin = new FakeChannelPlugin();
    const received: string[] = [];
    plugin.onMessage(async (message) => {
      received.push(message.text ?? "");
    });

    await plugin.start(connection());
    await plugin.emitIncoming({
      id: "msg_1",
      connectionId: "conn_1",
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      text: "hello",
      attachments: [],
      timestamp: 1,
    });

    expect(received).toEqual(["hello"]);
  });

  it("records sent messages and can clear them", async () => {
    const plugin = new FakeChannelPlugin();

    await plugin.send("conn_1", {
      chatId: "chat_1",
      type: "text",
      text: "done",
      contextToken: "ctx_1",
    });

    expect(plugin.sentMessages).toEqual([
      {
        connectionId: "conn_1",
        message: {
          chatId: "chat_1",
          type: "text",
          text: "done",
          contextToken: "ctx_1",
        },
      },
    ]);

    plugin.clear();
    expect(plugin.sentMessages).toEqual([]);
  });
});

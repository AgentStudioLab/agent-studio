import { describe, expect, it } from "bun:test";
import type { ChannelSessionService } from "../core/ChannelSessionService";
import type { ChannelSession } from "../core/ChannelTypes";
import { RemoteTaskAggregator } from "./RemoteTaskAggregator";
import type { UnifiedIncomingMessage } from "../core/PluginRegistry";

class FakeSessions {
  activeTaskId: string | null = null;
  find(): ChannelSession | null {
    if (!this.activeTaskId) return null;
    return {
      id: "chs_1",
      connectionId: "conn_1",
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      displayName: null,
      conversationId: "thr_1",
      activeTaskId: this.activeTaskId,
      createdAt: 1,
      updatedAt: 1,
    };
  }
}

function message(input: Partial<UnifiedIncomingMessage>): UnifiedIncomingMessage {
  return {
    id: input.id ?? `msg_${Math.random()}`,
    connectionId: "conn_1",
    channelType: "fake",
    chatId: "chat_1",
    senderId: "sender_1",
    text: input.text,
    attachments: input.attachments ?? [],
    contextToken: input.contextToken,
    timestamp: input.timestamp ?? Date.now(),
  };
}

describe("RemoteTaskAggregator", () => {
  it("is ready immediately for text then file", async () => {
    const sessions = new FakeSessions();
    const aggregator = new RemoteTaskAggregator({
      sessions: sessions as unknown as ChannelSessionService,
      waitMs: 30_000,
    });

    expect(await aggregator.ingest(message({ text: "summarize", contextToken: "ctx_1" }))).toEqual({
      type: "wait_for_file",
    });
    const result = await aggregator.ingest(
      message({
        attachments: [{ type: "file", path: "/tmp/a.txt", name: "a.txt" }],
        contextToken: "ctx_2",
      }),
    );

    expect(result).toEqual({
      type: "ready",
      instructionText: "summarize",
      attachments: [{ type: "file", path: "/tmp/a.txt", name: "a.txt" }],
      contextToken: "ctx_2",
    });
  });

  it("is ready immediately for file then text", async () => {
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
    });

    expect(
      await aggregator.ingest(
        message({
          attachments: [{ type: "image", path: "/tmp/a.png", name: "a.png" }],
          contextToken: "ctx_file",
        }),
      ),
    ).toEqual({ type: "wait_for_instruction" });

    const result = await aggregator.ingest(message({ text: "describe it" }));

    expect(result).toMatchObject({
      type: "ready",
      instructionText: "describe it",
      contextToken: "ctx_file",
    });
  });

  it("asks for file after text-only timeout", async () => {
    let now = 1_000;
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
      now: () => now,
    });

    await aggregator.ingest(message({ text: "please process", timestamp: now }));
    now += 30_001;

    expect(aggregator.flushExpired()).toEqual([
      {
        type: "ask_for_file",
        connectionId: "conn_1",
        chatId: "chat_1",
        senderId: "sender_1",
        text: "请继续发送要处理的文件。",
        contextToken: undefined,
      },
    ]);
  });

  it("asks for instruction after file-only timeout", async () => {
    let now = 1_000;
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
      now: () => now,
    });

    await aggregator.ingest(
      message({
        attachments: [{ type: "file", path: "/tmp/a.txt", name: "a.txt" }],
        timestamp: now,
      }),
    );
    now += 30_001;

    expect(aggregator.flushExpired()).toEqual([
      {
        type: "ask_for_instruction",
        connectionId: "conn_1",
        chatId: "chat_1",
        senderId: "sender_1",
        text: "请继续发送任务说明。",
        contextToken: undefined,
      },
    ]);
  });

  it("returns busy when the session has an active task", async () => {
    const sessions = new FakeSessions();
    sessions.activeTaskId = "rt_running";
    const aggregator = new RemoteTaskAggregator({
      sessions: sessions as unknown as ChannelSessionService,
      waitMs: 30_000,
    });

    expect(await aggregator.ingest(message({ text: "new task" }))).toEqual({
      type: "busy",
      text: "当前会话已有远程任务在执行，请等待完成后再发送新任务。",
      session: expect.objectContaining({ activeTaskId: "rt_running" }),
    });
  });
});

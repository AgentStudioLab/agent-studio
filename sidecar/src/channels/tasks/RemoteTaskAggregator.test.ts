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
  it("is ready immediately for text-only messages", async () => {
    const sessions = new FakeSessions();
    const aggregator = new RemoteTaskAggregator({
      sessions: sessions as unknown as ChannelSessionService,
      waitMs: 30_000,
    });

    const result = await aggregator.ingest(message({ text: "summarize", contextToken: "ctx_1" }));

    expect(result).toEqual({
      type: "ready",
      instructionText: "summarize",
      attachments: [],
      contextToken: "ctx_1",
    });
  });

  it("is ready immediately for file-only messages", async () => {
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
    });

    const result = await aggregator.ingest(
      message({
        attachments: [{ type: "image", path: "/tmp/a.png", name: "a.png" }],
        contextToken: "ctx_file",
      }),
    );

    expect(result).toMatchObject({
      type: "ready",
      instructionText: "Received remote attachments.",
      attachments: [{ type: "image", path: "/tmp/a.png", name: "a.png" }],
      contextToken: "ctx_file",
    });
  });

  it("does not keep text-only messages pending for file follow-up", async () => {
    let now = 1_000;
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
      now: () => now,
    });

    expect(await aggregator.ingest(message({ text: "please process", timestamp: now }))).toEqual({
      type: "ready",
      instructionText: "please process",
      attachments: [],
      contextToken: undefined,
    });
    now += 30_001;

    expect(aggregator.flushExpired()).toEqual([]);
  });

  it("does not ask for instruction after file-only timeout", async () => {
    let now = 1_000;
    const aggregator = new RemoteTaskAggregator({
      sessions: new FakeSessions() as unknown as ChannelSessionService,
      waitMs: 30_000,
      now: () => now,
    });

    expect(
      await aggregator.ingest(
        message({
          attachments: [{ type: "file", path: "/tmp/a.txt", name: "a.txt" }],
          timestamp: now,
        }),
      ),
    ).toMatchObject({
      type: "ready",
      instructionText: "Received remote attachments.",
    });
    await aggregator.ingest(
      message({
        attachments: [],
        timestamp: now,
      }),
    );
    now += 30_001;

    expect(aggregator.flushExpired()).toEqual([]);
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
      session: expect.objectContaining({ activeTaskId: "rt_running" }),
    });
  });
});

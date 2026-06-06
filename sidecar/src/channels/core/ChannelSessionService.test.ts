import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { ThreadService } from "../../services/threads";
import { ChannelConnectionService } from "./ChannelConnectionService";
import { ChannelSessionService } from "./ChannelSessionService";

function freshServices(): {
  connections: ChannelConnectionService;
  sessions: ChannelSessionService;
} {
  const db = new Database(":memory:");
  migrate(db);
  const threads = new ThreadService(db);
  threads.create({ id: "thr_1" });
  threads.create({ id: "thr_2" });
  return {
    connections: new ChannelConnectionService(db),
    sessions: new ChannelSessionService(db),
  };
}

describe("ChannelSessionService", () => {
  it("reuses sessions by connectionId + chatId + senderId", () => {
    const { connections, sessions } = freshServices();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute" },
    });

    const first = sessions.getOrCreate({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      displayName: "Alice",
      conversationId: "thr_1",
    });
    const second = sessions.getOrCreate({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      displayName: "Alice Updated",
      conversationId: "thr_2",
    });

    expect(second.id).toBe(first.id);
    expect(second.conversationId).toBe("thr_1");
    expect(sessions.find(connection.id, "chat_1", "sender_1")?.id).toBe(first.id);
  });

  it("sets and clears activeTaskId", () => {
    const { connections, sessions } = freshServices();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute" },
    });
    const session = sessions.getOrCreate({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      conversationId: "thr_1",
    });

    expect(sessions.setActiveTask(session.id, "rt_1").activeTaskId).toBe("rt_1");
    expect(sessions.clearActiveTask(session.id, "rt_1").activeTaskId).toBeNull();
  });

  it("does not clear a newer active task with a stale task id", () => {
    const { connections, sessions } = freshServices();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute" },
    });
    const session = sessions.getOrCreate({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      conversationId: "thr_1",
    });

    sessions.setActiveTask(session.id, "rt_new");
    expect(sessions.clearActiveTask(session.id, "rt_old").activeTaskId).toBe("rt_new");
  });
});

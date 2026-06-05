import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../../db";
import { ThreadService } from "../../services/threads";
import { MessageService } from "../../services/messages";
import { createBunSqliteRunStore } from "../../agui/store-sqlite/createBunSqliteRunStore";
import { ChannelConnectionService } from "./ChannelConnectionService";
import { ChannelSessionService } from "./ChannelSessionService";
import { PluginRegistry } from "./PluginRegistry";
import { RemoteTaskAggregator } from "../tasks/RemoteTaskAggregator";
import { RemoteTaskService } from "../tasks/RemoteTaskService";
import type { RemoteTaskSendInput } from "../tasks/RemoteTaskService";
import { ChannelManager } from "./ChannelManager";
import { FakeChannelPlugin } from "../plugins/fake/FakeChannelPlugin";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeManager() {
  const root = mkdtempSync(join(tmpdir(), "channel-manager-"));
  tmpRoots.push(root);
  const db = new Database(":memory:");
  migrate(db);
  const connections = new ChannelConnectionService(db);
  const sessions = new ChannelSessionService(db);
  const threads = new ThreadService(db);
  const messages = new MessageService(db);
  const store = createBunSqliteRunStore(db);
  const registry = new PluginRegistry();
  const fake = new FakeChannelPlugin();
  registry.register(fake);
  let manager!: ChannelManager;
  const tasks: RemoteTaskService = new RemoteTaskService({
    db,
    dataDir: root,
    connections,
    sessions,
    threads,
    messages,
    store,
    startRun: async () => {},
    sendResult: async (input: RemoteTaskSendInput): Promise<void> =>
      manager.sendRemoteTaskResult(input),
  });
  manager = new ChannelManager({
    connections,
    registry,
    aggregator: new RemoteTaskAggregator({ sessions, waitMs: 30_000 }),
    tasks,
  });
  return { manager, connections, fake, tasks };
}

describe("ChannelManager", () => {
  it("starts enabled connections and updates status", async () => {
    const { manager, connections, fake } = makeManager();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      enabled: true,
      config: { permissionStrategy: "auto_execute" },
    });

    await manager.startEnabled();

    expect(fake.isRunning(connection.id)).toBe(true);
    expect(connections.get(connection.id)?.status).toBe("running");
  });

  it("routes ready inbound aggregates into RemoteTaskService", async () => {
    const { manager, connections, fake, tasks } = makeManager();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      enabled: true,
      config: { permissionStrategy: "auto_execute", defaultWorkspace: "/tmp" },
    });
    await manager.startEnabled();

    await fake.emitIncoming({
      id: "msg_1",
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      text: "summarize",
      attachments: [{ type: "file", path: import.meta.path, name: "file.txt" }],
      contextToken: "ctx_1",
      timestamp: 1,
    });

    expect(tasks.listRecent()).toHaveLength(1);
  });

  it("sends busy responses through the plugin", async () => {
    const { manager, connections, fake, tasks } = makeManager();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      enabled: true,
      config: { permissionStrategy: "auto_execute", defaultWorkspace: "/tmp" },
    });
    await manager.startEnabled();
    await fake.emitIncoming({
      id: "msg_1",
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      text: "summarize",
      attachments: [{ type: "file", path: import.meta.path, name: "file.txt" }],
      timestamp: 1,
    });
    const task = tasks.listRecent()[0]!;
    await fake.emitIncoming({
      id: "msg_2",
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      text: "again",
      attachments: [],
      timestamp: 2,
    });

    expect(task.status).toBe("running");
    expect(fake.sentMessages.at(-1)?.message).toMatchObject({
      type: "text",
      text: "当前会话已有远程任务在执行，请等待完成后再发送新任务。",
    });
  });

  it("sends completion text and files through the plugin", async () => {
    const { manager, fake } = makeManager();

    await manager.sendRemoteTaskResult({
      taskId: "rt_1",
      connectionId: "conn_1",
      channelType: "fake",
      chatId: "chat_1",
      contextToken: "ctx_1",
      text: "Done",
      files: [{ type: "file", path: "/tmp/a.txt" }],
    });

    expect(fake.sentMessages[0]).toEqual({
      connectionId: "conn_1",
      message: {
        chatId: "chat_1",
        contextToken: "ctx_1",
        type: "files",
        text: "Done",
        files: [{ type: "file", path: "/tmp/a.txt" }],
      },
    });
  });
});

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../../db";
import { ThreadService } from "../../services/threads";
import { MessageService } from "../../services/messages";
import { createBunSqliteRunStore } from "../../agui/store-sqlite/createBunSqliteRunStore";
import { ChannelConnectionService } from "../core/ChannelConnectionService";
import { ChannelSessionService } from "../core/ChannelSessionService";
import { PluginRegistry } from "../core/PluginRegistry";
import { ChannelManager } from "../core/ChannelManager";
import { RemoteTaskAggregator } from "../tasks/RemoteTaskAggregator";
import { RemoteTaskService, type RemoteTaskRunInput } from "../tasks/RemoteTaskService";
import { FakeChannelPlugin } from "../plugins/fake/FakeChannelPlugin";

describe("fake remote task E2E", () => {
  it("runs text + file inbound to completion and sends summary plus output file", async () => {
    const root = mkdtempSync(join(tmpdir(), "fake-remote-e2e-"));
    try {
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
      let capturedRun: RemoteTaskRunInput | null = null;
      const tasks = new RemoteTaskService({
        db,
        dataDir: root,
        connections,
        sessions,
        threads,
        messages,
        store,
        startRun: async (input) => {
          capturedRun = input;
        },
        sendResult: async (input) => manager.sendRemoteTaskResult(input),
      });
      const manager = new ChannelManager({
        connections,
        registry,
        aggregator: new RemoteTaskAggregator({ sessions }),
        tasks,
      });
      const connection = connections.create({
        type: "fake",
        name: "Fake",
        enabled: true,
        config: { permissionStrategy: "auto_execute", defaultWorkspace: root },
      });
      await manager.startEnabled();
      const incoming = join(root, "incoming.txt");
      writeFileSync(incoming, "input");

      await fake.emitIncoming({
        id: "msg_1",
        connectionId: connection.id,
        channelType: "fake",
        chatId: "chat_1",
        senderId: "sender_1",
        text: "summarize",
        attachments: [{ type: "file", path: incoming, name: "incoming.txt" }],
        contextToken: "ctx_1",
        timestamp: 1,
      });

      expect(capturedRun).not.toBeNull();
      const task = tasks.listRecent()[0];
      mkdirSync(task.outputDir, { recursive: true });
      const outputFile = join(task.outputDir, "result.txt");
      writeFileSync(outputFile, "done");

      await capturedRun!.onTerminalResult!({
        status: "completed",
        assistantText: `Done\n[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"${outputFile}"}[/AGENT_WORKS_REMOTE_SEND]`,
      });

      expect(tasks.get(task.id)).toMatchObject({
        status: "completed",
        replyState: "sent",
      });
      expect(fake.sentMessages).toHaveLength(1);
      expect(fake.sentMessages[0].message).toMatchObject({
        type: "files",
        text: "Done",
        files: [expect.objectContaining({ type: "file" })],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

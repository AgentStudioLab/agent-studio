import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { mkdtempSync } from "node:fs";
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
import { RemoteTaskService } from "../tasks/RemoteTaskService";
import { FakeChannelPlugin } from "../plugins/fake/FakeChannelPlugin";
import { buildChannelConnectionRoutes } from "./channelConnections";
import { buildRemoteTaskRoutes } from "./remoteTasks";

function makeApp() {
  const root = mkdtempSync(join(tmpdir(), "channel-routes-"));
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
  const tasks = new RemoteTaskService({
    db,
    dataDir: root,
    connections,
    sessions,
    threads,
    messages,
    store,
    startRun: async () => {},
    sendResult: async (input) => manager.sendRemoteTaskResult(input),
  });
  const manager = new ChannelManager({
    connections,
    registry,
    aggregator: new RemoteTaskAggregator({ sessions }),
    tasks,
  });
  const app = new Hono();
  app.route("/", buildChannelConnectionRoutes({ connections, manager, fake }));
  app.route("/", buildRemoteTaskRoutes({ tasks }));
  return { app, connections, fake };
}

describe("channel connection routes", () => {
  it("lists, patches, enables, and disables connections", async () => {
    const { app, connections } = makeApp();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute" },
    });

    expect((await app.request("/channels/connections")).status).toBe(200);

    const patch = await app.request(`/channels/connections/${connection.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Fake Updated", config: { defaultWorkspace: "/tmp" } }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()) as unknown).toMatchObject({
      connection: {
        name: "Fake Updated",
        config: { permissionStrategy: "auto_execute", defaultWorkspace: "/tmp" },
      },
    });

    expect(
      (await app.request(`/channels/connections/${connection.id}/enable`, { method: "POST" }))
        .status,
    ).toBe(200);
    expect(connections.get(connection.id)?.enabled).toBe(true);
    expect(connections.get(connection.id)?.status).toBe("running");

    expect(
      (await app.request(`/channels/connections/${connection.id}/disable`, { method: "POST" }))
        .status,
    ).toBe(200);
    expect(connections.get(connection.id)?.enabled).toBe(false);
    expect(connections.get(connection.id)?.status).toBe("stopped");
  });

  it("triggers fake incoming messages and lists recent remote tasks", async () => {
    const { app, connections } = makeApp();
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      enabled: true,
      config: { permissionStrategy: "auto_execute", defaultWorkspace: "/tmp" },
    });
    await app.request(`/channels/connections/${connection.id}/enable`, { method: "POST" });

    const res = await app.request(`/channels/fake/${connection.id}/incoming`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        senderId: "sender_1",
        text: "summarize",
        attachments: [{ type: "file", path: import.meta.path, name: "file.txt" }],
      }),
    });
    expect(res.status).toBe(202);

    const recent = await app.request("/channels/remote-tasks/recent");
    expect(recent.status).toBe(200);
    expect((await recent.json()) as unknown).toMatchObject({
      tasks: [expect.objectContaining({ status: "running" })],
    });
  });
});

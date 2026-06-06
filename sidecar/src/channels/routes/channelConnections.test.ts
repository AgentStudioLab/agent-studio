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
import type { RemoteTaskSendInput } from "../tasks/RemoteTaskService";
import { FakeChannelPlugin } from "../plugins/fake/FakeChannelPlugin";
import type { ChannelConnection } from "../core/ChannelTypes";
import type { LoginCallbacks } from "../plugins/weixin/WeixinLogin";
import { buildRemoteTaskRoutes } from "./remoteTasks";

import { buildChannelConnectionRoutes } from "./channelConnections";

let runLoginFlow: LoginCallbacks | null = null;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
  const started: ChannelConnection[] = [];
  registry.register(fake);
  registry.register({
    type: "weixin",
    start: async (connection) => {
      started.push(connection);
    },
    stop: async () => {},
    send: async () => {},
  });
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
    aggregator: new RemoteTaskAggregator({ sessions }),
    tasks,
  });
  const app = new Hono();
  app.route(
    "/",
    buildChannelConnectionRoutes({
      connections,
      manager,
      fake,
      startWeixinLogin: (callbacks) => {
        runLoginFlow = callbacks;
        return { abort: () => {} };
      },
    }),
  );
  app.route("/", buildRemoteTaskRoutes({ tasks }));
  return { app, connections, fake, started };
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

  it("persists confirmed weixin login as an enabled running connection", async () => {
    const { app, started } = makeApp();

    const login = await app.request("/channels/weixin/login/start", { method: "POST" });
    expect(login.status).toBe(200);
    expect(runLoginFlow).toBeTruthy();
    runLoginFlow!.onDone({
      accountId: "bot_1",
      botToken: "token_1",
      baseUrl: "https://ilink.example",
    });
    await tick();

    const listed = await app.request("/channels/connections");
    expect((await listed.json()) as unknown).toMatchObject({
      connections: [
        expect.objectContaining({
          type: "weixin",
          enabled: true,
          status: "running",
        }),
      ],
    });
    expect(started).toHaveLength(1);
  });

  it("reuses the existing weixin connection after a second confirmed login", async () => {
    const { app, connections, started } = makeApp();
    connections.create({
      type: "weixin",
      name: "WeChat",
      enabled: true,
      status: "running",
      credentials: {
        accountId: "old_bot",
        botToken: "old_token",
        baseUrl: "https://old.example",
      },
      config: { permissionStrategy: "auto_execute" },
    });

    const login = await app.request("/channels/weixin/login/start", { method: "POST" });
    expect(login.status).toBe(200);
    runLoginFlow!.onDone({
      accountId: "new_bot",
      botToken: "new_token",
      baseUrl: "https://new.example",
    });
    await tick();

    const listed = await app.request("/channels/connections");
    const json = (await listed.json()) as { connections: Array<{ type: string; id: string }> };
    expect(json.connections.filter((connection) => connection.type === "weixin")).toHaveLength(1);
    expect(connections.getInternal(json.connections[0]!.id)?.credentials).toMatchObject({
      accountId: "new_bot",
      botToken: "new_token",
      baseUrl: "https://new.example",
    });
    expect(started).toHaveLength(1);
  });
});

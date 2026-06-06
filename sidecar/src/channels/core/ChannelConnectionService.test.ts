import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { ChannelConnectionService } from "./ChannelConnectionService";

function freshService(): ChannelConnectionService {
  const db = new Database(":memory:");
  migrate(db);
  return new ChannelConnectionService(db);
}

describe("ChannelConnectionService", () => {
  it("creates fake and weixin connections", () => {
    const svc = freshService();

    const fake = svc.create({
      type: "fake",
      name: "Fake Channel",
      enabled: true,
      status: "running",
      config: {
        permissionStrategy: "auto_execute",
        defaultWorkspace: "/tmp/agent-works",
      },
    });
    const weixin = svc.create({
      type: "weixin",
      name: "WeChat",
      credentials: { botToken: "secret-token" },
      config: { permissionStrategy: "auto_execute" },
    });

    expect(fake.type).toBe("fake");
    expect(fake.enabled).toBe(true);
    expect(weixin.type).toBe("weixin");
    expect(weixin.status).toBe("stopped");
  });

  it("does not expose credentials in list but can read them internally", () => {
    const svc = freshService();
    const created = svc.create({
      type: "weixin",
      name: "WeChat",
      credentials: { accountId: "wx_1", botToken: "secret-token" },
      config: { permissionStrategy: "auto_execute" },
    });

    expect(svc.list()[0]!.credentials).toBeUndefined();
    expect(svc.get(created.id)?.credentials).toBeUndefined();
    expect(svc.getInternal(created.id)?.credentials).toEqual({
      accountId: "wx_1",
      botToken: "secret-token",
    });
  });

  it("only accepts auto_execute permission strategy", () => {
    const svc = freshService();

    expect(() =>
      svc.create({
        type: "fake",
        name: "bad",
        config: { permissionStrategy: "interactive_approval" as "auto_execute" },
      }),
    ).toThrow(/permissionStrategy/);
  });

  it("updates connection config and status", () => {
    const svc = freshService();
    const created = svc.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute" },
    });

    const updated = svc.update(created.id, {
      name: "Fake Updated",
      enabled: true,
      config: {
        permissionStrategy: "auto_execute",
        defaultWorkspace: "/tmp/workspace",
      },
    });
    expect(updated?.name).toBe("Fake Updated");
    expect(updated?.enabled).toBe(true);
    expect(updated?.config.defaultWorkspace).toBe("/tmp/workspace");

    svc.updateStatus(created.id, "error", "cannot connect");
    const after = svc.get(created.id)!;
    expect(after.status).toBe("error");
    expect(after.errorMsg).toBe("cannot connect");
  });

  it("lists enabled connections only", () => {
    const svc = freshService();
    svc.create({
      type: "fake",
      name: "enabled",
      enabled: true,
      config: { permissionStrategy: "auto_execute" },
    });
    svc.create({
      type: "weixin",
      name: "disabled",
      enabled: false,
      config: { permissionStrategy: "auto_execute" },
    });

    expect(svc.listEnabled().map((c) => c.name)).toEqual(["enabled"]);
  });
});

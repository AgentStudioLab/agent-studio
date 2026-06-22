import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { migrate } from "../db";
import { SettingsToolsService, DEFAULT_ALLOWED_TOOLS } from "../services/settings-tools";
import { buildSettingsToolsRoutes } from "./settings-tools";

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  const svc = new SettingsToolsService(db);
  const app = new Hono();
  app.route("/", buildSettingsToolsRoutes(svc));
  return app;
}

describe("settings-tools routes", () => {
  it("GET returns default initially", async () => {
    const res = await makeApp().request("/settings/allowed-tools");
    expect(res.status).toBe(200);
    const body = await res.json() as { tools: string[] };
    expect(body.tools).toEqual(DEFAULT_ALLOWED_TOOLS);
  });

  it("default tools include SDK task tracking tools", () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskCreate");
    expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskGet");
    expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskUpdate");
    expect(DEFAULT_ALLOWED_TOOLS).toContain("TaskList");
  });

  it("PUT persists and GET reflects", async () => {
    const app = makeApp();
    const put = await app.request("/settings/allowed-tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tools: ["Bash"] }),
    });
    expect(put.status).toBe(200);
    const got = await app.request("/settings/allowed-tools");
    expect((await got.json() as { tools: string[] }).tools).toEqual(["Bash"]);
  });
});

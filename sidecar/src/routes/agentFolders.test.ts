import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { AgentFolderService } from "../services/agentFolders";
import { buildAgentFolderRoutes } from "./agentFolders";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agf-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const agentFolders = new AgentFolderService(db);
  const app = buildAgentFolderRoutes({ agentFolders, agentWorkspaces });
  // A real on-disk directory to mount (POST validates existence).
  const realDir = mkdtempSync(join(tmpdir(), "agf-mount-"));
  return { app, agentWorkspaces, agentFolders, realDir };
}

async function postFolder(app: ReturnType<typeof harness>["app"], agentId: string, body: unknown) {
  return app.request(`/agents/${agentId}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent folder routes", () => {
  it("POST creates (defaults: read-only, name=basename) and GET lists", async () => {
    const { app, agentWorkspaces, realDir } = harness();
    const agent = agentWorkspaces.create({ name: "A" });

    const created = await postFolder(app, agent.id, { path: realDir });
    expect(created.status).toBe(201);
    const folder = (await created.json()) as {
      id: string;
      path: string;
      folderName: string;
      writable: boolean;
    };
    expect(folder.path).toBe(realDir);
    expect(folder.folderName).toBe(basename(realDir));
    expect(folder.writable).toBe(false);

    const list = await app.request(`/agents/${agent.id}/folders`);
    expect(list.status).toBe(200);
    const folders = (await list.json()) as { id: string }[];
    expect(folders.map((f) => f.id)).toEqual([folder.id]);
  });

  it("POST honors folderName + writable", async () => {
    const { app, agentWorkspaces, realDir } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await postFolder(app, agent.id, {
      path: realDir,
      folderName: "My Docs",
      writable: true,
    });
    const folder = (await res.json()) as { folderName: string; writable: boolean };
    expect(folder.folderName).toBe("My Docs");
    expect(folder.writable).toBe(true);
  });

  it("POST to a non-existent agent returns 404", async () => {
    const { app, realDir } = harness();
    const res = await postFolder(app, "agw_missing", { path: realDir });
    expect(res.status).toBe(404);
  });

  it("POST rejects a relative path with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await postFolder(app, agent.id, { path: "relative/dir" });
    expect(res.status).toBe(400);
  });

  it("POST rejects a non-existent directory with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await postFolder(app, agent.id, { path: "/definitely/not/here/xyz123" });
    expect(res.status).toBe(400);
  });

  it("PATCH toggles writable", async () => {
    const { app, agentWorkspaces, realDir } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const folder = (await (await postFolder(app, agent.id, { path: realDir })).json()) as {
      id: string;
    };
    const res = await app.request(`/agents/${agent.id}/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writable: true }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { writable: boolean }).writable).toBe(true);
  });

  it("PATCH on a folder belonging to a different agent returns 404", async () => {
    const { app, agentWorkspaces, realDir } = harness();
    const a1 = agentWorkspaces.create({ name: "A1" });
    const a2 = agentWorkspaces.create({ name: "A2" });
    const folder = (await (await postFolder(app, a1.id, { path: realDir })).json()) as {
      id: string;
    };
    const res = await app.request(`/agents/${a2.id}/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writable: true }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE removes the folder", async () => {
    const { app, agentWorkspaces, realDir } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const folder = (await (await postFolder(app, agent.id, { path: realDir })).json()) as {
      id: string;
    };
    const del = await app.request(`/agents/${agent.id}/folders/${folder.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    const list = (await (await app.request(`/agents/${agent.id}/folders`)).json()) as unknown[];
    expect(list).toEqual([]);
  });

  it("DELETE on a non-existent folder returns 404", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await app.request(`/agents/${agent.id}/folders/agf_missing`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

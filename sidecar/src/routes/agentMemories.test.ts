import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { AgentMemoryService } from "../services/agentMemories";
import { buildAgentMemoryRoutes } from "./agentMemories";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agm-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const agentMemories = new AgentMemoryService(db);
  const app = buildAgentMemoryRoutes({ agentMemories, agentWorkspaces });
  return { app, agentWorkspaces, agentMemories };
}

async function postMemory(app: ReturnType<typeof harness>["app"], agentId: string, body: unknown) {
  return app.request(`/agents/${agentId}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent memory routes", () => {
  it("POST creates a user memory in the given block and GET lists it", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await postMemory(app, agent.id, { content: "likes terse replies", block: "profile" });
    expect(res.status).toBe(201);
    const m = (await res.json()) as { id: string; content: string; source: string; block: string };
    expect(m.content).toBe("likes terse replies");
    expect(m.source).toBe("user");
    expect(m.block).toBe("profile");

    const list = (await (await app.request(`/agents/${agent.id}/memories`)).json()) as {
      id: string;
    }[];
    expect(list.map((x) => x.id)).toEqual([m.id]);
  });

  it("POST rejects empty content with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    expect((await postMemory(app, agent.id, { content: "   ", block: "facts" })).status).toBe(400);
  });

  it("POST rejects a missing or invalid block with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    expect((await postMemory(app, agent.id, { content: "x" })).status).toBe(400);
    expect((await postMemory(app, agent.id, { content: "x", block: "bogus" })).status).toBe(400);
  });

  it("POST to a non-existent agent returns 404", async () => {
    const { app } = harness();
    expect((await postMemory(app, "agw_missing", { content: "x", block: "facts" })).status).toBe(404);
  });

  it("DELETE removes the memory", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const m = (await (await postMemory(app, agent.id, { content: "x", block: "facts" })).json()) as {
      id: string;
    };
    const del = await app.request(`/agents/${agent.id}/memories/${m.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const list = (await (await app.request(`/agents/${agent.id}/memories`)).json()) as unknown[];
    expect(list).toEqual([]);
  });

  it("DELETE on a memory of a different agent returns 404", async () => {
    const { app, agentWorkspaces } = harness();
    const a1 = agentWorkspaces.create({ name: "A1" });
    const a2 = agentWorkspaces.create({ name: "A2" });
    const m = (await (await postMemory(app, a1.id, { content: "x", block: "facts" })).json()) as { id: string };
    const del = await app.request(`/agents/${a2.id}/memories/${m.id}`, { method: "DELETE" });
    expect(del.status).toBe(404);
  });
});

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { ThreadService } from "../services/threads";
import { ScheduledTaskService } from "../services/scheduledTasks";
import { buildAgentWorkspaceRoutes } from "./agentWorkspaces";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agw-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const threads = new ThreadService(db);
  const scheduledTasks = new ScheduledTaskService(db);
  const app = buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks });
  return { app, db, baseDir, agentWorkspaces, threads, scheduledTasks };
}

describe("agent workspace routes", () => {
  it("POST /agents creates, GET /agents lists", async () => {
    const { app } = harness();
    const created = await app.request("/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Research" }),
    });
    expect(created.status).toBe(201);
    const agent = (await created.json()) as { id: string; name: string };
    expect(agent.name).toBe("Research");

    const list = await app.request("/agents");
    const agents = (await list.json()) as { id: string }[];
    expect(agents.map((a) => a.id)).toContain(agent.id);
  });

  it("POST /agents rejects an empty name with 400", async () => {
    const { app } = harness();
    const res = await app.request("/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /agents/:id archives bound conversations and unbinds tasks", async () => {
    const { app, agentWorkspaces, threads, scheduledTasks } = harness();
    const agent = agentWorkspaces.create({ name: "Doomed" });
    const conv = threads.create({ agentWorkspaceId: agent.id });
    const task = scheduledTasks.create({
      name: "t",
      prompt: "p",
      frequency: "manual",
      agentWorkspaceId: agent.id,
    });

    const res = await app.request(`/agents/${agent.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(agentWorkspaces.get(agent.id)).toBeNull();
    expect(threads.get(conv.id)?.archived).toBe(true);
    const reloaded = scheduledTasks.get(task.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.agentWorkspaceId).toBeNull();
  });
});

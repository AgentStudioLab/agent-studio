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
import { buildConversationRoutes } from "./conversations";
import { createBunSqliteRunStore } from "../agui/store-sqlite";

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

  it("PATCH /agents/:id toggles pinned", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "Pinnable" });
    const res = await app.request(`/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as { pinned: boolean }).pinned).toBe(true);
    expect(agentWorkspaces.get(agent.id)?.pinned).toBe(true);
  });
});

describe("conversation ↔ agent binding", () => {
  it("POST /conversations with agentWorkspaceId sets working_dir = home", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const baseDir = mkdtempSync(join(tmpdir(), "agw-bind-"));
    const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
    const threads = new ThreadService(db);
    const store = createBunSqliteRunStore(db);
    const app = buildConversationRoutes({ threads, store, agentWorkspaces });
    const agent = agentWorkspaces.create({ name: "Bound" });

    const res = await app.request("/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentWorkspaceId: agent.id }),
    });
    const conv = (await res.json()) as { id: string; workingDir: string; agentWorkspaceId: string };
    expect(conv.agentWorkspaceId).toBe(agent.id);
    expect(conv.workingDir).toBe(agent.homeDir);

    // PATCH move-out: clearing the binding clears the agent binding.
    const moved = await app.request(`/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentWorkspaceId: null }),
    });
    const after = (await moved.json()) as { agentWorkspaceId: string | null };
    expect(after.agentWorkspaceId).toBeNull();
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("POST /conversations with a non-existent agentWorkspaceId returns 404", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const baseDir = mkdtempSync(join(tmpdir(), "agw-bind-404-"));
    const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
    const threads = new ThreadService(db);
    const store = createBunSqliteRunStore(db);
    const app = buildConversationRoutes({ threads, store, agentWorkspaces });

    const res = await app.request("/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentWorkspaceId: "agw_nonexistent" }),
    });
    expect(res.status).toBe(404);
    rmSync(baseDir, { recursive: true, force: true });
  });
});

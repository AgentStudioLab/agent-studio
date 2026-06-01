import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { AgentMemoryStore } from "../services/agentMemoryStore";
import { buildAgentMemoryTreeRoutes } from "./agentMemory";

function setup() {
  const db = new Database(":memory:");
  migrate(db);
  const base = mkdtempSync(join(tmpdir(), "agm-rt-"));
  const agents = new AgentWorkspaceService(db, { baseDir: base });
  const store = new AgentMemoryStore(agents);
  const app = new Hono();
  app.route("/", buildAgentMemoryTreeRoutes({ agentMemoryStore: store, agentWorkspaces: agents }));
  return { app, agents, store };
}

describe("GET /agents/:id/memory/tree", () => {
  it("returns the memory file tree", async () => {
    const { app, agents, store } = setup();
    const a = agents.create({ name: "A" });
    await store.save(a.id, { file: "p", title: "P", hook: "h", content: "x" });
    const res = await app.request(`/agents/${a.id}/memory/tree`);
    expect(res.status).toBe(200);
    const names = ((await res.json()) as { name: string }[]).map((n) => n.name).sort();
    expect(names).toEqual(["MEMORY.md", "p.md"]);
  });
  it("404s for unknown agent", async () => {
    const { app } = setup();
    expect((await app.request(`/agents/nope/memory/tree`)).status).toBe(404);
  });
});

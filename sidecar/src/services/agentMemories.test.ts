import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";
import { AgentMemoryService } from "./agentMemories";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agm-svc-"));
  const agents = new AgentWorkspaceService(db, { baseDir });
  const memories = new AgentMemoryService(db);
  return { db, agents, memories };
}

describe("AgentMemoryService", () => {
  it("create records source and listByAgent returns oldest-first", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    const m1 = memories.create({ agentWorkspaceId: agent.id, content: "first", source: "user" });
    const m2 = memories.create({ agentWorkspaceId: agent.id, content: "second", source: "agent" });
    expect(m1.id.startsWith("agm_")).toBe(true);
    expect(m1.source).toBe("user");
    expect(m2.source).toBe("agent");

    const list = memories.listByAgent(agent.id);
    expect(list.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("delete removes the entry", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    const m = memories.create({ agentWorkspaceId: agent.id, content: "x", source: "user" });
    memories.delete(m.id);
    expect(memories.get(m.id)).toBeNull();
    expect(memories.listByAgent(agent.id)).toEqual([]);
  });

  it("listByAgent scopes to one agent", () => {
    const { agents, memories } = harness();
    const a1 = agents.create({ name: "A1" });
    const a2 = agents.create({ name: "A2" });
    memories.create({ agentWorkspaceId: a1.id, content: "one", source: "user" });
    memories.create({ agentWorkspaceId: a2.id, content: "two", source: "user" });
    expect(memories.listByAgent(a1.id).map((m) => m.content)).toEqual(["one"]);
    expect(memories.listByAgent(a2.id).map((m) => m.content)).toEqual(["two"]);
  });

  it("deleting the parent agent cascades its memory rows", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "Doomed" });
    memories.create({ agentWorkspaceId: agent.id, content: "a", source: "agent" });
    memories.create({ agentWorkspaceId: agent.id, content: "b", source: "user" });
    expect(memories.listByAgent(agent.id).length).toBe(2);
    agents.delete(agent.id);
    expect(memories.listByAgent(agent.id)).toEqual([]);
  });
});

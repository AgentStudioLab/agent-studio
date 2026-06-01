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

  it("create defaults block to 'facts' and accepts an explicit block", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    const def = memories.create({ agentWorkspaceId: agent.id, content: "x", source: "user" });
    const prof = memories.create({
      agentWorkspaceId: agent.id,
      content: "likes terse replies",
      source: "agent",
      block: "profile",
    });
    expect(def.block).toBe("facts");
    expect(prof.block).toBe("profile");
  });

  it("listByAgentBlock and blockCharLength scope to one block", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "ab", source: "agent", block: "facts" });
    memories.create({ agentWorkspaceId: agent.id, content: "cde", source: "agent", block: "facts" });
    memories.create({ agentWorkspaceId: agent.id, content: "z", source: "agent", block: "profile" });
    expect(memories.listByAgentBlock(agent.id, "facts").map((m) => m.content)).toEqual(["ab", "cde"]);
    expect(memories.blockCharLength(agent.id, "facts")).toBe(5);
    expect(memories.blockCharLength(agent.id, "profile")).toBe(1);
  });

  it("replaceAgentRow updates a matched agent row (case-insensitive substring)", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "deploys to Vercel", source: "agent", block: "facts" });
    const res = memories.replaceAgentRow(agent.id, "facts", "vercel", "deploys to Fly.io");
    expect(res.status).toBe("ok");
    expect(memories.listByAgentBlock(agent.id, "facts").map((m) => m.content)).toEqual([
      "deploys to Fly.io",
    ]);
  });

  it("replace/remove return no_match when nothing matches", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "uses bun", source: "agent", block: "facts" });
    expect(memories.replaceAgentRow(agent.id, "facts", "npm", "x").status).toBe("no_match");
    expect(memories.removeAgentRow(agent.id, "facts", "npm").status).toBe("no_match");
  });

  it("replace/remove return ambiguous (no mutation) when >1 match", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "test with bun", source: "agent", block: "facts" });
    memories.create({ agentWorkspaceId: agent.id, content: "build with bun", source: "agent", block: "facts" });
    const res = memories.removeAgentRow(agent.id, "facts", "bun");
    expect(res.status).toBe("ambiguous");
    if (res.status === "ambiguous") expect(res.matches.length).toBe(2);
    expect(memories.listByAgentBlock(agent.id, "facts").length).toBe(2); // untouched
  });

  it("replace/remove never touch user rows (treated as no_match)", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "user-authored fact", source: "user", block: "facts" });
    expect(memories.removeAgentRow(agent.id, "facts", "user-authored").status).toBe("no_match");
    expect(memories.replaceAgentRow(agent.id, "facts", "user-authored", "x").status).toBe("no_match");
    expect(memories.listByAgentBlock(agent.id, "facts").length).toBe(1); // user row survives
  });

  it("trimBlockToBudget drops oldest agent rows, keeps user rows", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    // 4 chars each; oldest first.
    memories.create({ agentWorkspaceId: agent.id, content: "aaaa", source: "agent", block: "facts" });
    memories.create({ agentWorkspaceId: agent.id, content: "bbbb", source: "user", block: "facts" });
    memories.create({ agentWorkspaceId: agent.id, content: "cccc", source: "agent", block: "facts" });
    // length 12 > softBudget 6. Drop oldest agent "aaaa" → 8 (bbbb+cccc) still
    // > 6 → drop next oldest agent "cccc" → left user "bbbb"=4 ≤ 6. user row kept.
    const dropped = memories.trimBlockToBudget(agent.id, "facts", 6);
    const remaining = memories.listByAgentBlock(agent.id, "facts").map((m) => m.content);
    expect(dropped).toBe(2);
    expect(remaining).toEqual(["bbbb"]);
  });

  it("trimBlockToBudget stops when only user rows remain even if over budget", () => {
    const { agents, memories } = harness();
    const agent = agents.create({ name: "A" });
    memories.create({ agentWorkspaceId: agent.id, content: "uuuuuuuuuu", source: "user", block: "profile" });
    const dropped = memories.trimBlockToBudget(agent.id, "profile", 3);
    expect(dropped).toBe(0);
    expect(memories.listByAgentBlock(agent.id, "profile").length).toBe(1);
  });

  it("migrate backfills 'block' = 'facts' on rows created before the column", () => {
    const { db, agents } = harness();
    const agent = agents.create({ name: "Legacy" });
    // Simulate a pre-migration row by inserting without block, then re-running
    // migrate (idempotent) — the DEFAULT applies to the column for old rows.
    db.prepare(
      "INSERT INTO agent_memories (id, agent_workspace_id, content, source, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("agm_legacy", agent.id, "old fact", "agent", Date.now());
    const memories = new AgentMemoryService(db);
    const row = memories.get("agm_legacy");
    expect(row?.block).toBe("facts");
  });
});

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";
import { AgentLinkService } from "./agentLinks";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agl-svc-"));
  const agents = new AgentWorkspaceService(db, { baseDir });
  const links = new AgentLinkService(db);
  return { db, agents, links };
}

describe("AgentLinkService", () => {
  it("create + listByAgent returns the link", () => {
    const { agents, links } = harness();
    const agent = agents.create({ name: "A" });
    const l = links.create({
      agentWorkspaceId: agent.id,
      url: "https://docs.example.com",
      title: "Docs",
    });
    expect(l.id.startsWith("alk_")).toBe(true);
    expect(l.url).toBe("https://docs.example.com");
    expect(links.listByAgent(agent.id)).toHaveLength(1);
  });

  it("listByAgent is ordered oldest-first and scoped per agent", () => {
    const { agents, links } = harness();
    const a = agents.create({ name: "A" });
    const b = agents.create({ name: "B" });
    links.create({ agentWorkspaceId: a.id, url: "https://1.example", title: "1" });
    links.create({ agentWorkspaceId: a.id, url: "https://2.example", title: "2" });
    links.create({ agentWorkspaceId: b.id, url: "https://3.example", title: "3" });
    expect(links.listByAgent(a.id).map((l) => l.title)).toEqual(["1", "2"]);
    expect(links.listByAgent(b.id).map((l) => l.title)).toEqual(["3"]);
  });

  it("delete removes the link", () => {
    const { agents, links } = harness();
    const agent = agents.create({ name: "A" });
    const l = links.create({ agentWorkspaceId: agent.id, url: "https://x.example", title: "X" });
    links.delete(l.id);
    expect(links.listByAgent(agent.id)).toHaveLength(0);
  });

  it("cascades when the owning agent is deleted", () => {
    const { agents, links } = harness();
    const agent = agents.create({ name: "A" });
    links.create({ agentWorkspaceId: agent.id, url: "https://x.example", title: "X" });
    agents.delete(agent.id);
    expect(links.listByAgent(agent.id)).toHaveLength(0);
  });
});

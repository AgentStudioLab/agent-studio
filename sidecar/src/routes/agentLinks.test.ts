import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { AgentLinkService } from "../services/agentLinks";
import { buildAgentLinkRoutes } from "./agentLinks";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agl-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const agentLinks = new AgentLinkService(db);
  const app = buildAgentLinkRoutes({ agentLinks, agentWorkspaces });
  return { app, agentWorkspaces, agentLinks };
}

function postLink(app: ReturnType<typeof harness>["app"], agentId: string, body: unknown) {
  return app.request(`/agents/${agentId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent link routes", () => {
  it("POST creates (title defaults to host) and GET lists", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });

    const created = await postLink(app, agent.id, { url: "https://docs.example.com/guide" });
    expect(created.status).toBe(201);
    const link = (await created.json()) as { url: string; title: string };
    expect(link.url).toBe("https://docs.example.com/guide");
    expect(link.title).toBe("docs.example.com"); // host fallback

    const listed = await app.request(`/agents/${agent.id}/links`);
    expect((await listed.json()) as unknown[]).toHaveLength(1);
  });

  it("POST keeps a provided title", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await postLink(app, agent.id, { url: "https://x.example", title: "My Ref" });
    expect(((await res.json()) as { title: string }).title).toBe("My Ref");
  });

  it("POST rejects a non-http(s) or malformed URL with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    expect((await postLink(app, agent.id, { url: "ftp://x.example" })).status).toBe(400);
    expect((await postLink(app, agent.id, { url: "not a url" })).status).toBe(400);
    expect((await postLink(app, agent.id, { url: "" })).status).toBe(400);
  });

  it("404s for an unknown agent", async () => {
    const { app } = harness();
    expect((await app.request("/agents/nope/links")).status).toBe(404);
    expect((await postLink(app, "nope", { url: "https://x.example" })).status).toBe(404);
  });

  it("DELETE removes a link", async () => {
    const { app, agentWorkspaces, agentLinks } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const link = agentLinks.create({
      agentWorkspaceId: agent.id,
      url: "https://x.example",
      title: "X",
    });
    const res = await app.request(`/agents/${agent.id}/links/${link.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(agentLinks.listByAgent(agent.id)).toHaveLength(0);
  });
});

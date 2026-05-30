import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { buildAgentInstructionRoutes } from "./agentInstructions";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agi-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const app = buildAgentInstructionRoutes({ agentWorkspaces });
  return { app, agentWorkspaces };
}

describe("agent instructions routes (CLAUDE.md)", () => {
  it("GET returns empty content when no CLAUDE.md exists yet", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const res = await app.request(`/agents/${agent.id}/instructions`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { content: string }).content).toBe("");
  });

  it("PUT writes <home>/CLAUDE.md and GET reads it back", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const put = await app.request(`/agents/${agent.id}/instructions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "# Role\nAlways answer in French." }),
    });
    expect(put.status).toBe(200);

    // File actually landed in the home dir.
    const onDisk = readFileSync(join(agent.homeDir, "CLAUDE.md"), "utf8");
    expect(onDisk).toBe("# Role\nAlways answer in French.");

    const got = (await (await app.request(`/agents/${agent.id}/instructions`)).json()) as {
      content: string;
    };
    expect(got.content).toBe("# Role\nAlways answer in French.");
  });

  it("GET / PUT on a non-existent agent return 404", async () => {
    const { app } = harness();
    expect((await app.request(`/agents/agw_missing/instructions`)).status).toBe(404);
    const put = await app.request(`/agents/agw_missing/instructions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(put.status).toBe(404);
  });

  it("PUT rejects non-string content with 400", async () => {
    const { app, agentWorkspaces } = harness();
    const agent = agentWorkspaces.create({ name: "A" });
    const put = await app.request(`/agents/${agent.id}/instructions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: 123 }),
    });
    expect(put.status).toBe(400);
  });
});

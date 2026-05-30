import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";
import { AgentFolderService } from "./agentFolders";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agf-svc-"));
  const agents = new AgentWorkspaceService(db, { baseDir });
  const folders = new AgentFolderService(db);
  return { db, agents, folders };
}

describe("AgentFolderService", () => {
  it("create defaults to read-only and listByAgent returns it", () => {
    const { agents, folders } = harness();
    const agent = agents.create({ name: "A" });
    const f = folders.create({
      agentWorkspaceId: agent.id,
      path: "/data/docs",
      folderName: "docs",
    });
    expect(f.writable).toBe(false);
    expect(f.path).toBe("/data/docs");
    expect(f.folderName).toBe("docs");
    expect(f.id.startsWith("agf_")).toBe(true);

    const list = folders.listByAgent(agent.id);
    expect(list.map((x) => x.id)).toEqual([f.id]);
  });

  it("create can mount a writable folder", () => {
    const { agents, folders } = harness();
    const agent = agents.create({ name: "A" });
    const f = folders.create({
      agentWorkspaceId: agent.id,
      path: "/data/out",
      folderName: "out",
      writable: true,
    });
    expect(f.writable).toBe(true);
  });

  it("setWritable toggles the flag", () => {
    const { agents, folders } = harness();
    const agent = agents.create({ name: "A" });
    const f = folders.create({ agentWorkspaceId: agent.id, path: "/p", folderName: "p" });
    const updated = folders.setWritable(f.id, true);
    expect(updated?.writable).toBe(true);
    expect(folders.get(f.id)?.writable).toBe(true);
    folders.setWritable(f.id, false);
    expect(folders.get(f.id)?.writable).toBe(false);
  });

  it("setWritable on a missing id returns null", () => {
    const { folders } = harness();
    expect(folders.setWritable("agf_missing", true)).toBeNull();
  });

  it("delete removes the row", () => {
    const { agents, folders } = harness();
    const agent = agents.create({ name: "A" });
    const f = folders.create({ agentWorkspaceId: agent.id, path: "/p", folderName: "p" });
    folders.delete(f.id);
    expect(folders.get(f.id)).toBeNull();
    expect(folders.listByAgent(agent.id)).toEqual([]);
  });

  it("listByAgent scopes to one agent", () => {
    const { agents, folders } = harness();
    const a1 = agents.create({ name: "A1" });
    const a2 = agents.create({ name: "A2" });
    folders.create({ agentWorkspaceId: a1.id, path: "/x", folderName: "x" });
    folders.create({ agentWorkspaceId: a2.id, path: "/y", folderName: "y" });
    expect(folders.listByAgent(a1.id).map((f) => f.path)).toEqual(["/x"]);
    expect(folders.listByAgent(a2.id).map((f) => f.path)).toEqual(["/y"]);
  });

  it("deleting the parent agent cascades its folder rows (FK ON DELETE CASCADE)", () => {
    const { agents, folders } = harness();
    const agent = agents.create({ name: "Doomed" });
    folders.create({ agentWorkspaceId: agent.id, path: "/a", folderName: "a" });
    folders.create({ agentWorkspaceId: agent.id, path: "/b", folderName: "b" });
    expect(folders.listByAgent(agent.id).length).toBe(2);
    agents.delete(agent.id);
    expect(folders.listByAgent(agent.id)).toEqual([]);
  });
});

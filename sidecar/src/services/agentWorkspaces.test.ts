import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";

const baseDirs: string[] = [];
function svc(): { service: AgentWorkspaceService; baseDir: string } {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agw-test-"));
  baseDirs.push(baseDir);
  return { service: new AgentWorkspaceService(db, { baseDir }), baseDir };
}

afterEach(() => {
  for (const d of baseDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("AgentWorkspaceService", () => {
  it("create() persists a row and mkdirs the home dir", () => {
    const { service, baseDir } = svc();
    const a = service.create({ name: "Research" });
    expect(a.id).toMatch(/^agw_/);
    expect(a.name).toBe("Research");
    expect(a.homeDir).toBe(join(baseDir, a.id));
    expect(a.archived).toBe(false);
    expect(existsSync(a.homeDir)).toBe(true);
  });

  it("get / list reflect created rows newest-first", () => {
    const { service } = svc();
    const a = service.create({ name: "A" });
    const b = service.create({ name: "B" });
    expect(service.get(a.id)?.name).toBe("A");
    expect(service.list().map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("update() changes name + archived; get reflects it", () => {
    const { service } = svc();
    const a = service.create({ name: "Old" });
    const updated = service.update(a.id, { name: "New", archived: true });
    expect(updated?.name).toBe("New");
    expect(updated?.archived).toBe(true);
  });

  it("create defaults pinned false; update toggles it", () => {
    const { service } = svc();
    const a = service.create({ name: "P" });
    expect(a.pinned).toBe(false);
    expect(service.update(a.id, { pinned: true })?.pinned).toBe(true);
    expect(service.get(a.id)?.pinned).toBe(true);
    expect(service.update(a.id, { pinned: false })?.pinned).toBe(false);
  });

  it("delete() removes the row (home dir is left on disk)", () => {
    const { service } = svc();
    const a = service.create({ name: "X" });
    service.delete(a.id);
    expect(service.get(a.id)).toBeNull();
    expect(existsSync(a.homeDir)).toBe(true);
  });

  it("create seeds <home>/memory/MEMORY.md", () => {
    const { service } = svc();
    const agent = service.create({ name: "Jay" });
    expect(existsSync(join(agent.homeDir, "memory", "MEMORY.md"))).toBe(true);
  });
});

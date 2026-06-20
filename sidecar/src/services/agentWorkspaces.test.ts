import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService, normalizeAgentCategory } from "./agentWorkspaces";

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
  it("normalizes legacy localized category labels to function categories", () => {
    expect(normalizeAgentCategory("开发构建")).toBe("development");
    expect(normalizeAgentCategory("研究分析")).toBe("research");
    expect(normalizeAgentCategory("内容写作")).toBe("writing");
    expect(normalizeAgentCategory("自动化执行")).toBe("automation");
    expect(normalizeAgentCategory("通用助手")).toBe("general");
  });

  it("create() persists a row and mkdirs the home dir", () => {
    const { service, baseDir } = svc();
    const a = service.create({ name: "Research", category: "research", coverImage: "research" });
    expect(a.id).toMatch(/^agw_/);
    expect(a.name).toBe("Research");
    expect(a.category).toBe("research");
    expect(a.coverImage).toBe("research");
    expect(a.homeDir).toBe(join(baseDir, a.id));
    expect(a.archived).toBe(false);
    expect(existsSync(a.homeDir)).toBe(true);
  });

  it("create() defaults uncategorized agents to general with a general cover", () => {
    const { service } = svc();
    const a = service.create({ name: "General" });
    expect(a.category).toBe("general");
    expect(a.coverImage).toBe("general");
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
    const updated = service.update(a.id, {
      name: "New",
      archived: true,
      category: "development",
      coverImage: "development",
    });
    expect(updated?.name).toBe("New");
    expect(updated?.archived).toBe(true);
    expect(updated?.category).toBe("development");
    expect(updated?.coverImage).toBe("development");
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

  it("create writes initial instructions to <home>/CLAUDE.md", () => {
    const { service } = svc();
    const agent = service.create({
      name: "Writer",
      instructions: "你是一个内容写作助手。",
    });
    expect(readFileSync(join(agent.homeDir, "CLAUDE.md"), "utf8")).toBe(
      "你是一个内容写作助手。",
    );
  });
});

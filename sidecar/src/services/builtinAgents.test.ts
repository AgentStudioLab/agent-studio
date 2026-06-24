import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";
import { builtinAgentId, reconcileBuiltinAgents } from "./builtinAgents";
import type { BuiltinAgentDef } from "../builtins/agents";

const baseDirs: string[] = [];
function setup() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "builtin-test-"));
  baseDirs.push(baseDir);
  const service = new AgentWorkspaceService(db, { baseDir });
  return { db, baseDir, service };
}
afterEach(() => {
  for (const d of baseDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const DEF_A: BuiltinAgentDef = {
  slug: "alpha",
  name: "Alpha",
  avatar: "blue",
  category: "development",
  coverImage: "development",
  instructions: "# Alpha\ninstr A",
  mountedSkills: ["s1", "s2"],
  pack: {
    domain: "audio",
    scenario: "podcast-production",
    tagline: "Alpha pack",
    inputTypes: ["audio", "text"],
    outputTypes: ["script", "shownotes"],
    optionalTools: ["ffmpeg"],
    riskTags: ["copyright"],
    sampleTasks: [{ title: "试跑", prompt: "生成一期播客脚本" }],
  },
};
const DEF_B: BuiltinAgentDef = { slug: "beta", name: "Beta", instructions: "instr B" };

describe("reconcileBuiltinAgents", () => {
  it("inserts rows with homeDir + CLAUDE.md + memory + source=builtin", () => {
    const { db, baseDir, service } = setup();
    const res = reconcileBuiltinAgents(db, baseDir, [DEF_A, DEF_B]);
    expect(res.upserted).toEqual([builtinAgentId("alpha"), builtinAgentId("beta")]);
    expect(res.archived).toEqual([]);

    const a = service.get(builtinAgentId("alpha"))!;
    expect(a.source).toBe("builtin");
    expect(a.name).toBe("Alpha");
    expect(a.avatar).toBe("blue");
    expect(a.category).toBe("development");
    expect(a.coverImage).toBe("development");
    expect(a.mountedSkills).toEqual(["s1", "s2"]);
    expect(a.catalogMetadata?.tagline).toBe("Alpha pack");
    expect(a.catalogMetadata?.sampleTasks[0]?.title).toBe("试跑");
    expect(a.homeDir).toBe(join(baseDir, builtinAgentId("alpha")));
    expect(readFileSync(join(a.homeDir, "CLAUDE.md"), "utf8")).toContain("instr A");
    expect(existsSync(join(a.homeDir, "memory", "MEMORY.md"))).toBe(true);

    // beta: avatar 省略 → null；category/coverImage 省略 → general；mountedSkills 省略 → null（继承全部）。
    const b = service.get(builtinAgentId("beta"))!;
    expect(b.avatar).toBeNull();
    expect(b.category).toBe("general");
    expect(b.coverImage).toBe("general");
    expect(b.mountedSkills).toBeNull();
    expect(b.catalogMetadata).toBeNull();
  });

  it("is idempotent — a second run keeps a single row", () => {
    const { db, baseDir, service } = setup();
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    expect(service.list().filter((x) => x.source === "builtin").length).toBe(1);
  });

  it("overwrites definition fields (name/avatar/skills/instructions) on change", () => {
    const { db, baseDir, service } = setup();
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    const changed: BuiltinAgentDef = {
      slug: "alpha",
      name: "Alpha v2",
      avatar: "red",
      category: "research",
      coverImage: "research",
      instructions: "new instr",
      mountedSkills: [], // 显式不挂
      pack: {
        domain: "audio",
        scenario: "podcast-production",
        tagline: "Alpha v2 pack",
        inputTypes: ["url", "pdf"],
        outputTypes: ["script", "publish-copy"],
        optionalTools: ["whisper"],
        riskTags: ["web-access"],
        sampleTasks: [{ title: "复跑", prompt: "重新生成播客脚本" }],
      },
    };
    reconcileBuiltinAgents(db, baseDir, [changed]);
    const a = service.get(builtinAgentId("alpha"))!;
    expect(a.name).toBe("Alpha v2");
    expect(a.avatar).toBe("red");
    expect(a.category).toBe("research");
    expect(a.coverImage).toBe("research");
    expect(a.mountedSkills).toEqual([]);
    expect(a.catalogMetadata?.tagline).toBe("Alpha v2 pack");
    expect(readFileSync(join(a.homeDir, "CLAUDE.md"), "utf8")).toBe("new instr");
  });

  it("never touches user-owned pinned on reconcile", () => {
    const { db, baseDir, service } = setup();
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    const id = builtinAgentId("alpha");
    service.update(id, { pinned: true });
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    expect(service.get(id)?.pinned).toBe(true);
  });

  it("soft-archives a removed builtin, preserving row + folders (no cascade delete)", () => {
    const { db, baseDir, service } = setup();
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    const id = builtinAgentId("alpha");
    db.prepare(
      "INSERT INTO agent_folders (id, agent_workspace_id, path, folder_name, writable, created_at) VALUES (?,?,?,?,0,?)",
    ).run("fld_1", id, "/tmp/x", "x", Date.now());

    const res = reconcileBuiltinAgents(db, baseDir, []);
    expect(res.archived).toEqual([id]);

    const row = db
      .prepare("SELECT archived FROM agent_workspaces WHERE id = ?")
      .get(id) as { archived: number };
    expect(row.archived).toBe(1); // 软下架，行还在
    expect(db.prepare("SELECT id FROM agent_folders WHERE id = ?").get("fld_1")).not.toBeNull();
    expect(service.list().some((x) => x.id === id)).toBe(false); // list 排除 archived
  });

  it("re-activates an archived builtin when its def returns", () => {
    const { db, baseDir, service } = setup();
    reconcileBuiltinAgents(db, baseDir, [DEF_A]);
    reconcileBuiltinAgents(db, baseDir, []); // 下架
    reconcileBuiltinAgents(db, baseDir, [DEF_A]); // 回归
    expect(service.get(builtinAgentId("alpha"))?.archived).toBe(false);
  });

  it("ships real bundled defs that reconcile cleanly (default arg)", () => {
    const { db, baseDir, service } = setup();
    const res = reconcileBuiltinAgents(db, baseDir); // 用真实清单
    expect(res.upserted.length).toBeGreaterThan(0);
    for (const id of res.upserted) {
      const a = service.get(id)!;
      expect(a.source).toBe("builtin");
      expect(a.id.startsWith("agw_builtin_")).toBe(true);
      expect(existsSync(join(a.homeDir, "CLAUDE.md"))).toBe(true);
    }
  });
});

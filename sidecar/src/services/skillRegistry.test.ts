import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { SkillRegistry, scanSourceDir } from "./skillRegistry";

function makeDb(): Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function writeSkill(
  root: string,
  dirName: string,
  frontmatter: Record<string, string>,
  body = "# body",
): void {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  writeFileSync(join(dir, "SKILL.md"), `---\n${fm}\n---\n${body}\n`);
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `skillRegistry-${Date.now()}-${Math.random()}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("scanSourceDir", () => {
  it("returns empty array for missing directory", () => {
    expect(scanSourceDir(join(tmpRoot, "nope"), "personal")).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    expect(scanSourceDir(tmpRoot, "personal")).toEqual([]);
  });

  it("parses one well-formed SKILL.md", () => {
    writeSkill(tmpRoot, "my-skill", {
      name: "my-skill",
      description: "Do a thing",
    });
    const got = scanSourceDir(tmpRoot, "personal");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      id: "my-skill",
      name: "my-skill",
      description: "Do a thing",
      source: "personal",
      sourcePath: tmpRoot,
    });
  });

  it("builtin source prefixes id with agent-studio:", () => {
    writeSkill(tmpRoot, "anything", { name: "fancy-tool", description: "x" });
    const got = scanSourceDir(tmpRoot, "builtin");
    expect(got[0]!.id).toBe("agent-studio:fancy-tool");
    // name itself isn't prefixed
    expect(got[0]!.name).toBe("fancy-tool");
  });

  it("skips subdirectories without SKILL.md", () => {
    mkdirSync(join(tmpRoot, "not-a-skill"));
    writeSkill(tmpRoot, "real", { name: "real", description: "x" });
    expect(scanSourceDir(tmpRoot, "personal").map((s) => s.name)).toEqual([
      "real",
    ]);
  });

  it("warns and skips SKILL.md without frontmatter", () => {
    const dir = join(tmpRoot, "no-fm");
    mkdirSync(dir);
    writeFileSync(join(dir, "SKILL.md"), "# just a body, no fm\n");
    expect(scanSourceDir(tmpRoot, "personal")).toEqual([]);
  });

  it("skips SKILL.md missing name or description", () => {
    writeSkill(tmpRoot, "no-desc", { name: "no-desc" });
    writeSkill(tmpRoot, "no-name", { description: "lonely" });
    writeSkill(tmpRoot, "good", { name: "good", description: "ok" });
    const names = scanSourceDir(tmpRoot, "personal").map((s) => s.name);
    expect(names).toEqual(["good"]);
  });

  it("skips malformed YAML frontmatter", () => {
    const dir = join(tmpRoot, "bad-yaml");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: x\ndescription: [unclosed\n---\n",
    );
    expect(scanSourceDir(tmpRoot, "personal")).toEqual([]);
  });

  it("ignores plain files at top level", () => {
    writeFileSync(join(tmpRoot, "README.md"), "hi");
    writeSkill(tmpRoot, "real", { name: "real", description: "x" });
    expect(scanSourceDir(tmpRoot, "personal").map((s) => s.id)).toEqual([
      "real",
    ]);
  });
});

describe("SkillRegistry", () => {
  it("default-enabled when no SQLite row exists", () => {
    writeSkill(tmpRoot, "a", { name: "a", description: "a" });
    process.env.AGENT_STUDIO_BUILTIN_DIR = "/nonexistent";
    const reg = new SkillRegistryForTest(makeDb(), [tmpRoot]);
    const skills = reg.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.enabled).toBe(true);
  });

  it("listEnabledIds returns only enabled skills", () => {
    writeSkill(tmpRoot, "a", { name: "a", description: "a" });
    writeSkill(tmpRoot, "b", { name: "b", description: "b" });
    const reg = new SkillRegistryForTest(makeDb(), [tmpRoot]);
    expect(reg.listEnabledIds().sort()).toEqual(["a", "b"]);
    expect(reg.setEnabled("a", false)).toBe(true);
    expect(reg.listEnabledIds()).toEqual(["b"]);
  });

  it("setEnabled returns false for unknown id", () => {
    const reg = new SkillRegistryForTest(makeDb(), [tmpRoot]);
    expect(reg.setEnabled("ghost", false)).toBe(false);
  });

  it("orphan SQLite rows do not appear in listSkills", () => {
    const db = makeDb();
    db.prepare(
      "INSERT INTO skill_state (skill_id, enabled, updated_at) VALUES (?, 0, 0)",
    ).run("ghost-from-past");
    writeSkill(tmpRoot, "live", { name: "live", description: "l" });
    const reg = new SkillRegistryForTest(db, [tmpRoot]);
    expect(reg.listSkills().map((s) => s.id)).toEqual(["live"]);
  });

  it("orphan row state persists — resurrects when skill returns", () => {
    const db = makeDb();
    db.prepare(
      "INSERT INTO skill_state (skill_id, enabled, updated_at) VALUES (?, 0, 0)",
    ).run("resurrects");
    // Initially the skill folder doesn't exist
    let reg = new SkillRegistryForTest(db, [tmpRoot]);
    expect(reg.listSkills()).toEqual([]);
    // Now add the folder back
    writeSkill(tmpRoot, "anything", {
      name: "resurrects",
      description: "x",
    });
    reg = new SkillRegistryForTest(db, [tmpRoot]); // fresh scan
    const found = reg.listSkills();
    expect(found).toHaveLength(1);
    expect(found[0]!.enabled).toBe(false); // resurrected disabled state
  });

  it("duplicate id across sources — first wins, second skipped", () => {
    const studioDir = join(tmpRoot, "studio");
    const claudeDir = join(tmpRoot, "claude");
    mkdirSync(studioDir);
    mkdirSync(claudeDir);
    writeSkill(studioDir, "x", { name: "dup", description: "studio version" });
    writeSkill(claudeDir, "x", { name: "dup", description: "claude version" });
    const reg = new SkillRegistryForTest(makeDb(), [studioDir, claudeDir]);
    const skills = reg.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.description).toBe("studio version");
  });

  it("builtinPluginPath returns null when no valid manifest", () => {
    process.env.AGENT_STUDIO_BUILTIN_DIR = "/nonexistent";
    const reg = new SkillRegistry(makeDb());
    expect(reg.builtinPluginPath()).toBeNull();
  });

  it("builtinPluginPath returns dir when manifest exists", () => {
    const fakeBuiltin = join(tmpRoot, "built-in");
    mkdirSync(join(fakeBuiltin, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(fakeBuiltin, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "agent-studio", version: "0.0.1" }),
    );
    process.env.AGENT_STUDIO_BUILTIN_DIR = fakeBuiltin;
    const reg = new SkillRegistry(makeDb());
    expect(reg.builtinPluginPath()).toBe(fakeBuiltin);
  });
});

/**
 * Test-only subclass that lets us inject the personal-source dir list
 * (skipping the homedir lookup). Built-in is still picked up from env.
 */
class SkillRegistryForTest extends SkillRegistry {
  private personalDirs: string[];
  constructor(db: Database, personalDirs: string[]) {
    super(db);
    this.personalDirs = personalDirs;
  }
  override init(): void {
    const seen = new Map<string, ReturnType<typeof scanSourceDir>[number]>();
    for (const dir of this.personalDirs) {
      for (const e of scanSourceDir(dir, "personal")) {
        if (!seen.has(e.id)) seen.set(e.id, e);
      }
    }
    this.entries = [...seen.values()];
    this.initialized = true;
  }
}

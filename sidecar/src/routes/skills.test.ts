import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { SkillRegistry, scanSourceDir } from "../services/skillRegistry";
import { buildSkillsRoutes } from "./skills";

function writeSkill(root: string, dirName: string, name: string, desc: string) {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${desc}\n---\nbody\n`,
  );
}

// Mirrors SkillRegistryForTest in skillRegistry.test.ts.
class InjectableRegistry extends SkillRegistry {
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

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `skills-route-${Date.now()}-${Math.random()}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeApp() {
  const db = new Database(":memory:");
  migrate(db);
  writeSkill(tmpRoot, "alpha", "alpha", "first");
  writeSkill(tmpRoot, "beta", "beta", "second");
  const reg = new InjectableRegistry(db, [tmpRoot]);
  const app = new Hono();
  app.route("/", buildSkillsRoutes(reg));
  return { app, reg };
}

describe("skills routes", () => {
  it("GET /skills returns the merged list", async () => {
    const { app } = makeApp();
    const res = await app.request("/skills");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ id: string; enabled: boolean }> };
    expect(body.skills).toHaveLength(2);
    expect(body.skills.map((s) => s.id).sort()).toEqual(["alpha", "beta"]);
    expect(body.skills.every((s) => s.enabled === true)).toBe(true);
  });

  it("PATCH /skills/:id/enabled flips the bit and GET reflects it", async () => {
    const { app } = makeApp();
    const patch = await app.request("/skills/alpha/enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(patch.status).toBe(204);
    const got = await app.request("/skills");
    const body = (await got.json()) as { skills: Array<{ id: string; enabled: boolean }> };
    const alpha = body.skills.find((s) => s.id === "alpha")!;
    expect(alpha.enabled).toBe(false);
  });

  it("PATCH unknown id → 404", async () => {
    const { app } = makeApp();
    const res = await app.request("/skills/ghost/enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH non-boolean enabled → 400", async () => {
    const { app } = makeApp();
    const res = await app.request("/skills/alpha/enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: "yes" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH invalid JSON body → 400", async () => {
    const { app } = makeApp();
    const res = await app.request("/skills/alpha/enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("PATCH missing body → 400", async () => {
    const { app } = makeApp();
    const res = await app.request("/skills/alpha/enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});

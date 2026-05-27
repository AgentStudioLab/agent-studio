import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillRegistry, SkillView } from "../services/skillRegistry";
import { buildSkillFilesRoutes } from "./skillFiles";

function makeRegistryStub(skills: SkillView[]): SkillRegistry {
  return {
    getById: (id: string) => skills.find((s) => s.id === id) ?? null,
  } as unknown as SkillRegistry;
}

function makeApp(registry: SkillRegistry) {
  return new Hono().route("/", buildSkillFilesRoutes(registry));
}

describe("GET /skills/:id/tree", () => {
  let parentDir: string;
  let skillDir: string;

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), "skillfiles-"));
    skillDir = join(parentDir, "demo");
    await mkdir(skillDir, { recursive: true });
    // Layout:
    //   demo/
    //     SKILL.md
    //     LICENSE.txt
    //     scripts/
    //       run.py
    //     .git/        ← skip
    //     .hidden.txt  ← skip
    //     foo.pyc      ← skip
    await writeFile(join(skillDir, "SKILL.md"), "# demo\n");
    await writeFile(join(skillDir, "LICENSE.txt"), "MIT\n");
    await mkdir(join(skillDir, "scripts"));
    await writeFile(join(skillDir, "scripts", "run.py"), "print(1)\n");
    await mkdir(join(skillDir, ".git"));
    await writeFile(join(skillDir, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(skillDir, ".hidden.txt"), "h\n");
    await writeFile(join(skillDir, "foo.pyc"), "");
  });

  afterEach(async () => {
    await rm(parentDir, { recursive: true, force: true });
  });

  it("returns nested tree with directories before files and noise filtered", async () => {
    const registry = makeRegistryStub([
      {
        id: "demo",
        name: "demo",
        description: "",
        source: "personal",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
    const res = await makeApp(registry).request("/skills/demo/tree");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tree: Array<{ name: string; kind: string; children?: unknown[] }>;
      truncated: boolean;
    };
    const names = body.tree.map((n) => n.name);
    expect(names).toEqual(["scripts", "LICENSE.txt", "SKILL.md"]);
    const scripts = body.tree.find((n) => n.name === "scripts")!;
    expect(scripts.kind).toBe("dir");
    expect((scripts.children as Array<{ name: string }>).map((n) => n.name)).toEqual([
      "run.py",
    ]);
    expect(body.truncated).toBe(false);
  });

  it("rejects built-in skills with 403", async () => {
    const registry = makeRegistryStub([
      {
        id: "agent-studio:pptx",
        name: "pptx",
        description: "",
        source: "builtin",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
    const res = await makeApp(registry).request("/skills/agent-studio:pptx/tree");
    expect(res.status).toBe(403);
  });

  it("404s when skill id is unknown", async () => {
    const registry = makeRegistryStub([]);
    const res = await makeApp(registry).request("/skills/missing/tree");
    expect(res.status).toBe(404);
  });

  it("404s when the skill directory was removed from disk", async () => {
    const registry = makeRegistryStub([
      {
        id: "ghost",
        name: "ghost",
        description: "",
        source: "personal",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
    const res = await makeApp(registry).request("/skills/ghost/tree");
    expect(res.status).toBe(404);
  });

  it("handles url-encoded skill ids (agent-studio:pptx style)", async () => {
    const id = "studio:demo";
    const otherDir = join(parentDir, "demo");
    void otherDir; // dir already exists
    const registry = makeRegistryStub([
      {
        id,
        name: "demo",
        description: "",
        source: "personal",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
    const res = await makeApp(registry).request(
      `/skills/${encodeURIComponent(id)}/tree`,
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /skills/:id/files", () => {
  let parentDir: string;
  let skillDir: string;

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), "skillfiles-files-"));
    skillDir = join(parentDir, "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# hello\n");
    await writeFile(join(skillDir, "image.bin"), Buffer.from([0, 1, 2, 3]));
  });

  afterEach(async () => {
    await rm(parentDir, { recursive: true, force: true });
  });

  function reg() {
    return makeRegistryStub([
      {
        id: "demo",
        name: "demo",
        description: "",
        source: "personal",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
  }

  it("reads a text file as utf8", async () => {
    const res = await makeApp(reg()).request(
      "/skills/demo/files?path=SKILL.md",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; encoding: string };
    expect(body.encoding).toBe("utf8");
    expect(body.content).toBe("# hello\n");
  });

  it("reads a binary file as base64", async () => {
    const res = await makeApp(reg()).request(
      "/skills/demo/files?path=image.bin",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; encoding: string };
    expect(body.encoding).toBe("base64");
  });

  it("rejects path traversal with 403", async () => {
    const res = await makeApp(reg()).request(
      "/skills/demo/files?path=../../etc/passwd",
    );
    expect(res.status).toBe(403);
  });

  it("404s for missing files", async () => {
    const res = await makeApp(reg()).request(
      "/skills/demo/files?path=nope.txt",
    );
    expect(res.status).toBe(404);
  });

  it("400s when path query is absent", async () => {
    const res = await makeApp(reg()).request("/skills/demo/files");
    expect(res.status).toBe(400);
  });

  it("rejects built-in skills with 403", async () => {
    const registry = makeRegistryStub([
      {
        id: "agent-studio:pptx",
        name: "pptx",
        description: "",
        source: "builtin",
        sourcePath: parentDir,
        enabled: true,
      },
    ]);
    const res = await makeApp(registry).request(
      "/skills/agent-studio:pptx/files?path=SKILL.md",
    );
    expect(res.status).toBe(403);
  });
});

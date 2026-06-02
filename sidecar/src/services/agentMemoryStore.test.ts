// sidecar/src/services/agentMemoryStore.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentMemoryStore } from "./agentMemoryStore";

// Minimal AgentWorkspaceService stand-in: only homeDir(id) is used.
function makeStore(base: string) {
  const agents = { homeDir: (id: string) => join(base, id) } as never;
  return new AgentMemoryStore(agents);
}

describe("AgentMemoryStore", () => {
  let base: string;
  beforeEach(() => { base = mkdtempSync(join(tmpdir(), "agm-")); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  test("ensure creates memory/ + an index file", () => {
    const s = makeStore(base);
    const dir = s.ensure("a1");
    expect(dir).toBe(join(base, "a1", "memory"));
    expect(existsSync(join(dir!, "MEMORY.md"))).toBe(true);
  });

  test("save (new slug) writes the file and appends an index line", async () => {
    const s = makeStore(base);
    const r = await s.save("a1", { originThreadId: "t1", file: "user-profile", title: "User profile", hook: "Jay, 前端工程师", content: "name is Jay" });
    expect(r.status).toBe("ok");
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "user-profile.md"), "utf8")).toContain("name is Jay");
    expect(s.indexText("a1")).toContain("- [User profile](user-profile.md) — Jay, 前端工程师");
  });

  test("save (existing slug) overwrites body and upserts (no duplicate index line)", async () => {
    const s = makeStore(base);
    await s.save("a1", { originThreadId: "t1", file: "p", title: "P", hook: "v1", content: "old" });
    await s.save("a1", { originThreadId: "t1", file: "p", title: "P", hook: "v2", content: "new" });
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "p.md"), "utf8")).toContain("new");
    const idx = s.indexText("a1");
    expect(idx).toContain("— v2");
    expect(idx.match(/\(p\.md\)/g)?.length).toBe(1);
  });

  test("remove deletes the file and its index line", async () => {
    const s = makeStore(base);
    await s.save("a1", { originThreadId: "t1", file: "p", title: "P", hook: "h", content: "x" });
    const r = await s.remove("a1", "p");
    expect(r.status).toBe("ok");
    expect(existsSync(join(base, "a1", "memory", "p.md"))).toBe(false);
    expect(s.indexText("a1")).not.toContain("(p.md)");
  });

  test("remove of a missing file returns not_found", async () => {
    const s = makeStore(base);
    s.ensure("a1");
    expect((await s.remove("a1", "nope")).status).toBe("not_found");
  });

  test("concurrent saves serialize (both index lines survive)", async () => {
    const s = makeStore(base);
    await Promise.all([
      s.save("a1", { originThreadId: "t1", file: "x", title: "X", hook: "hx", content: "cx" }),
      s.save("a1", { originThreadId: "t1", file: "y", title: "Y", hook: "hy", content: "cy" }),
    ]);
    const idx = s.indexText("a1");
    expect(idx).toContain("(x.md)");
    expect(idx).toContain("(y.md)");
  });

  test("tree lists the index + scenario files", async () => {
    const s = makeStore(base);
    await s.save("a1", { originThreadId: "t1", file: "p", title: "P", hook: "h", content: "x" });
    const names = (await s.tree("a1")).map((n) => n.name).sort();
    expect(names).toEqual(["MEMORY.md", "p.md"]);
  });

  test("save with reserved/dotfile slugs does not clobber the index and stays visible", async () => {
    const s = makeStore(base);
    await s.save("a1", { originThreadId: "t1", file: "x", title: "X", hook: "h", content: "first" });
    // 'MEMORY' would collide with MEMORY.md on case-insensitive FS → must remap.
    await s.save("a1", { originThreadId: "t1", file: "MEMORY", title: "M", hook: "h", content: "scenario body" });
    expect(s.indexText("a1")).toContain("(x.md)"); // index intact
    expect(s.indexText("a1")).not.toContain("scenario body");
    // '.hidden' must not become an invisible dotfile.
    await s.save("a1", { originThreadId: "t1", file: ".hidden", title: "H", hook: "h", content: "z" });
    const names = (await s.tree("a1")).map((n) => n.name);
    expect(names.every((n) => !n.startsWith("."))).toBe(true);
    expect(names).toContain("memory-file.md"); // MEMORY remapped to memory-file
  });

  test("upsert/remove are not fooled by a slug name inside another entry's hook", async () => {
    const s = makeStore(base);
    await s.save("a1", { originThreadId: "t1", file: "alpha", title: "Alpha", hook: "see ](beta.md) for more", content: "a" });
    await s.save("a1", { originThreadId: "t1", file: "beta", title: "Beta", hook: "hb", content: "b" });
    // removing beta must NOT delete alpha (whose hook mentions beta.md)
    await s.remove("a1", "beta");
    const idx = s.indexText("a1");
    expect(idx).toContain("(alpha.md)");
    // beta's entry line must be gone; alpha's entry (whose hook contains "(beta.md)") must remain
    expect(idx).not.toMatch(/^- \[[^\]]*\]\(beta\.md\)/m);
  });

  test("enforceIndexBudget evicts oldest entries + files past the hard cap", async () => {
    const s = makeStore(base);
    // Each hook is long so few entries exceed hard (2800 chars).
    const big = "x".repeat(400);
    for (let i = 0; i < 12; i++) {
      await s.save("a1", { originThreadId: "t1", file: `s${i}`, title: `T${i}`, hook: big, content: "c" });
    }
    expect(s.indexText("a1").length).toBeGreaterThan(2800);
    await s.enforceIndexBudget("a1");
    expect(s.indexText("a1").length).toBeLessThanOrEqual(2000);
    // oldest (s0) gone, newest (s11) kept
    expect(s.indexText("a1")).not.toContain("(s0.md)");
    expect(s.indexText("a1")).toContain("(s11.md)");
    expect(existsSync(join(base, "a1", "memory", "s0.md"))).toBe(false);
  });

  test("save writes cowork-style frontmatter carrying the origin thread id", async () => {
    const s = makeStore(base);
    await s.save("a1", {
      originThreadId: "thr-abc", type: "user",
      file: "user-profile", title: "User Profile", hook: "Jay, 前端工程师", content: "name is Jay",
    });
    const md = readFileSync(join(base, "a1", "memory", "user-profile.md"), "utf8");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: user-profile");
    expect(md).toContain("node_type: memory");
    expect(md).toContain("type: user");
    expect(md).toContain("originThreadId: thr-abc");
    expect(md).toContain("name is Jay"); // body preserved after frontmatter
  });

  test("a bracketed title stays a valid markdown link (path not lost)", async () => {
    const s = makeStore(base);
    await s.save("a1", {
      originThreadId: "t1",
      file: "cr", title: "代码必须 [blocked] 审查", hook: "二次 review", content: "x",
    });
    const idx = s.indexText("a1");
    expect(idx).toContain("(cr.md)"); // relative path present
    expect(idx).toMatch(/^- \[[^[\]]*\]\(cr\.md\)/m); // link text has no stray brackets
    expect(idx).not.toContain("[blocked]");
  });
});

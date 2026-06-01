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
    const r = await s.save("a1", { file: "user-profile", title: "User profile", hook: "Jay, 前端工程师", content: "name is Jay" });
    expect(r.status).toBe("ok");
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "user-profile.md"), "utf8")).toContain("name is Jay");
    expect(s.indexText("a1")).toContain("- [User profile](user-profile.md) — Jay, 前端工程师");
  });

  test("save (existing slug) overwrites body and upserts (no duplicate index line)", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "v1", content: "old" });
    await s.save("a1", { file: "p", title: "P", hook: "v2", content: "new" });
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "p.md"), "utf8")).toContain("new");
    const idx = s.indexText("a1");
    expect(idx).toContain("— v2");
    expect(idx.match(/\(p\.md\)/g)?.length).toBe(1);
  });

  test("remove deletes the file and its index line", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "h", content: "x" });
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
      s.save("a1", { file: "x", title: "X", hook: "hx", content: "cx" }),
      s.save("a1", { file: "y", title: "Y", hook: "hy", content: "cy" }),
    ]);
    const idx = s.indexText("a1");
    expect(idx).toContain("(x.md)");
    expect(idx).toContain("(y.md)");
  });

  test("tree lists the index + scenario files", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "h", content: "x" });
    const names = (await s.tree("a1")).map((n) => n.name).sort();
    expect(names).toEqual(["MEMORY.md", "p.md"]);
  });
});

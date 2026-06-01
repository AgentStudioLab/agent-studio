import { describe, expect, it } from "bun:test";
import { buildAgentAppendContext, computeAgentDirs } from "./runWorker";

describe("computeAgentDirs", () => {
  it("treats every folder as readable", () => {
    const dirs = computeAgentDirs([
      { path: "/a", writable: false },
      { path: "/b", writable: true },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/a", "/b"]);
  });

  it("only writable folders are writable", () => {
    const dirs = computeAgentDirs([
      { path: "/ro", writable: false },
      { path: "/rw", writable: true },
    ]);
    expect(dirs.additionalWriteDirs).toEqual(["/rw"]);
  });

  it("no folders → empty sets", () => {
    expect(computeAgentDirs([])).toEqual({
      additionalReadDirs: [],
      additionalWriteDirs: [],
    });
  });

  it("all read-only → no writable dirs", () => {
    const dirs = computeAgentDirs([
      { path: "/x", writable: false },
      { path: "/y", writable: false },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/x", "/y"]);
    expect(dirs.additionalWriteDirs).toEqual([]);
  });
});

describe("buildAgentAppendContext", () => {
  const empty = { profile: [] as string[], facts: [] as string[] };

  it("nothing to inject → null", () => {
    expect(buildAgentAppendContext(null, empty)).toBeNull();
    expect(buildAgentAppendContext("   ", empty)).toBeNull();
  });

  it("CLAUDE.md only → verbatim instructions", () => {
    const out = buildAgentAppendContext("Always answer in French.", empty);
    expect(out).toBe("Always answer in French.");
  });

  it("renders only non-empty blocks, profile before facts", () => {
    const out = buildAgentAppendContext(null, {
      profile: ["likes terse replies"],
      facts: ["deploys to Fly.io"],
    });
    expect(out).toContain("## 用户画像 / User profile");
    expect(out).toContain("- likes terse replies");
    expect(out).toContain("## 事实约定 / Facts & conventions");
    expect(out).toContain("- deploys to Fly.io");
    expect(out!.indexOf("用户画像")).toBeLessThan(out!.indexOf("事实约定"));
  });

  it("an empty block is omitted entirely", () => {
    const out = buildAgentAppendContext(null, { profile: [], facts: ["only a fact"] });
    expect(out).not.toContain("用户画像");
    expect(out).toContain("## 事实约定 / Facts & conventions");
  });

  it("usage annotation shows used/soft; no nudge below warn", () => {
    const out = buildAgentAppendContext(null, { profile: ["abc"], facts: [] });
    expect(out).toContain("(used 3/1500)");
    expect(out).not.toContain("near capacity");
  });

  it("at/over warn threshold the section appends a consolidation nudge", () => {
    // tiny budget so a short entry crosses warn.
    const budgets = {
      profile: { soft: 10, warn: 5, hard: 12 },
      facts: { soft: 10, warn: 5, hard: 12 },
    };
    const out = buildAgentAppendContext(null, { profile: ["abcdef"], facts: [] }, budgets);
    expect(out).toContain("(used 6/10 — near capacity, consolidate via the remember tool");
  });

  it("CLAUDE.md comes first, then blocks, separated by blank lines", () => {
    const out = buildAgentAppendContext("# Role\nBe concise.", { profile: [], facts: ["fact one"] });
    expect(out!.startsWith("# Role\nBe concise.\n\n## 事实约定")).toBe(true);
  });
});

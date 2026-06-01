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
  it("returns CLAUDE.md + memory index", () => {
    const out = buildAgentAppendContext("Be terse.", "- [User](user.md) — Jay");
    expect(out).toContain("Be terse.");
    expect(out).toContain("## Memory index");
    expect(out).toContain("- [User](user.md) — Jay");
  });
  it("returns null when both empty", () => {
    expect(buildAgentAppendContext(null, "")).toBeNull();
    expect(buildAgentAppendContext("   ", "")).toBeNull();
  });
  it("appends a nudge near budget", () => {
    const big = "- x\n".repeat(500); // 2000 chars > warn (1600)
    expect(buildAgentAppendContext(null, big)).toContain("consolidate");
  });
  it("CLAUDE.md only, no memory section when index empty", () => {
    const out = buildAgentAppendContext("# Role\nBe concise.", "");
    expect(out).toContain("Be concise.");
    expect(out).not.toContain("Memory index");
  });
});

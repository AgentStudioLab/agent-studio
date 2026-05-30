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
  it("nothing to inject → null", () => {
    expect(buildAgentAppendContext(null, [])).toBeNull();
    expect(buildAgentAppendContext("   ", [])).toBeNull();
  });

  it("CLAUDE.md only → verbatim instructions", () => {
    const out = buildAgentAppendContext("Always answer in French.", []);
    expect(out).toBe("Always answer in French.");
  });

  it("memories only → bulleted memory block", () => {
    const out = buildAgentAppendContext(null, [{ content: "likes terse replies" }, { content: "prefers TS" }]);
    expect(out).toContain("Saved memories about this agent workspace:");
    expect(out).toContain("- likes terse replies");
    expect(out).toContain("- prefers TS");
  });

  it("both → CLAUDE.md first, then memories, separated by a blank line", () => {
    const out = buildAgentAppendContext("# Role\nBe concise.", [{ content: "fact one" }]);
    expect(out).toBe("# Role\nBe concise.\n\nSaved memories about this agent workspace:\n- fact one");
  });
});

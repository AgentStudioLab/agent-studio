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
  const INDEX = "# Memory index\n\n- [User](user.md) — Jay, 前端工程师";

  it("returns CLAUDE.md first, then the memory directive + index verbatim", () => {
    const out = buildAgentAppendContext("Be terse.", INDEX);
    expect(out).not.toBeNull();
    expect(out!.startsWith("Be terse.")).toBe(true);
    expect(out).toContain("# Memory index");
    expect(out).toContain("- [User](user.md) — Jay, 前端工程师");
    // single heading — no double "## Memory index" wrapper
    expect(out).not.toContain("## Memory index");
    // redirect directive present (use our memory, not the preset default)
    expect(out).toContain("remember");
    expect(out).toContain("memory/<slug>.md");
  });
  it("always emits the memory redirect directive, even with no CLAUDE.md or index", () => {
    const out = buildAgentAppendContext(null, "");
    expect(out).not.toBeNull();
    expect(out).toContain("memory/");
    expect(out).toContain("No memories saved yet.");
    expect(out).not.toContain("# Memory index"); // no index heading when empty
  });
  it("CLAUDE.md + memory directive (empty note) when the index is empty", () => {
    const out = buildAgentAppendContext("# Role\nBe concise.", "");
    expect(out).toContain("Be concise.");
    expect(out).toContain("No memories saved yet.");
    expect(out).not.toContain("# Memory index");
  });
  it("no nudge below the warn threshold", () => {
    const out = buildAgentAppendContext(null, INDEX); // short, well under warn
    expect(out).not.toContain("consolidate");
  });
  it("appends a consolidate nudge at/over the warn threshold", () => {
    const big = "- x\n".repeat(500); // 2000 chars >= warn (1600)
    expect(buildAgentAppendContext(null, big)).toContain("consolidate");
  });
  it("appends a reference-links section with one line per link", () => {
    const out = buildAgentAppendContext(null, "", [
      { id: "alk_1", agentWorkspaceId: "a", url: "https://docs.example.com", title: "Docs", createdAt: 0 },
      { id: "alk_2", agentWorkspaceId: "a", url: "https://api.example.com", title: "API", createdAt: 0 },
    ]);
    expect(out).toContain("## Reference links");
    expect(out).toContain("- [Docs](https://docs.example.com)");
    expect(out).toContain("- [API](https://api.example.com)");
    expect(out).toContain("WebFetch");
  });
  it("no links section when the list is empty", () => {
    expect(buildAgentAppendContext("Be terse.", "", [])).not.toContain("Reference links");
  });
});

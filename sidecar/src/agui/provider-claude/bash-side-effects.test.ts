import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BashSideEffectsTracker } from "./bash-side-effects";

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "bash-side-effects-"));
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean tmpRoot between tests for isolation.
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot);
});

describe("BashSideEffectsTracker", () => {
  it("returns null effects when finalize is called without a snapshot", () => {
    const t = new BashSideEffectsTracker();
    t.finalize("tool_x", tmpRoot);
    expect(t.takeEffects("tool_x")).toEqual([]);
  });

  it("detects newly created files", () => {
    const t = new BashSideEffectsTracker();
    t.snapshot("tool_a", tmpRoot);
    writeFileSync(join(tmpRoot, "out.pptx"), "fake pptx data");
    t.finalize("tool_a", tmpRoot);
    const got = t.takeEffects("tool_a");
    expect(got).toHaveLength(1);
    expect(got![0]!.path).toBe(join(tmpRoot, "out.pptx"));
    expect(got![0]!.kind).toBe("created");
  });

  it("detects modified files via mtime", () => {
    const f = join(tmpRoot, "report.md");
    writeFileSync(f, "v1");
    // Backdate so the change clearly bumps mtime.
    const past = new Date(Date.now() - 5000);
    utimesSync(f, past, past);

    const t = new BashSideEffectsTracker();
    t.snapshot("tool_b", tmpRoot);
    writeFileSync(f, "v2");
    t.finalize("tool_b", tmpRoot);
    const got = t.takeEffects("tool_b");
    expect(got).toHaveLength(1);
    expect(got![0]!.kind).toBe("modified");
  });

  it("ignores unchanged files", () => {
    writeFileSync(join(tmpRoot, "fixed.txt"), "stable");
    const past = new Date(Date.now() - 5000);
    utimesSync(join(tmpRoot, "fixed.txt"), past, past);

    const t = new BashSideEffectsTracker();
    t.snapshot("tool_c", tmpRoot);
    // No changes between snapshot/finalize.
    t.finalize("tool_c", tmpRoot);
    expect(t.takeEffects("tool_c")).toEqual([]);
  });

  it("skips .git / node_modules during scan", () => {
    mkdirSync(join(tmpRoot, ".git"));
    mkdirSync(join(tmpRoot, "node_modules"));
    writeFileSync(join(tmpRoot, ".git", "HEAD"), "ref");
    writeFileSync(join(tmpRoot, "node_modules", "lib.js"), "x");

    const t = new BashSideEffectsTracker();
    t.snapshot("tool_d", tmpRoot);
    writeFileSync(join(tmpRoot, ".git", "noise"), "still-skipped");
    writeFileSync(join(tmpRoot, "node_modules", "another.js"), "also-skipped");
    writeFileSync(join(tmpRoot, "real.txt"), "real");
    t.finalize("tool_d", tmpRoot);

    const got = t.takeEffects("tool_d");
    expect(got).toHaveLength(1);
    expect(got![0]!.path).toBe(join(tmpRoot, "real.txt"));
  });

  it("descends into normal subdirectories", () => {
    mkdirSync(join(tmpRoot, "sub"));

    const t = new BashSideEffectsTracker();
    t.snapshot("tool_e", tmpRoot);
    writeFileSync(join(tmpRoot, "sub", "nested.md"), "x");
    t.finalize("tool_e", tmpRoot);

    const got = t.takeEffects("tool_e");
    expect(got).toHaveLength(1);
    expect(got![0]!.path).toBe(join(tmpRoot, "sub", "nested.md"));
  });

  it("takeEffects is idempotent — second call returns null", () => {
    const t = new BashSideEffectsTracker();
    t.snapshot("tool_f", tmpRoot);
    writeFileSync(join(tmpRoot, "x.md"), "y");
    t.finalize("tool_f", tmpRoot);
    expect(t.takeEffects("tool_f")?.length).toBe(1);
    expect(t.takeEffects("tool_f")).toBeNull();
  });
});

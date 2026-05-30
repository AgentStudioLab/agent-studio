import { describe, it, expect } from "bun:test";
import { isPathUnder, checkWorkspaceSandbox } from "./sandbox";

describe("isPathUnder", () => {
  const root = "/Users/jay/proj";

  it("absolute path under root", () => {
    expect(isPathUnder("/Users/jay/proj/src/index.ts", root)).toBe(true);
  });
  it("exact root match", () => {
    expect(isPathUnder("/Users/jay/proj", root)).toBe(true);
  });
  it("rejects sibling directory", () => {
    expect(isPathUnder("/Users/jay/other", root)).toBe(false);
  });
  it("rejects parent traversal", () => {
    expect(isPathUnder("/Users/jay/proj/../etc", root)).toBe(false);
  });
  it("relative path resolves against root", () => {
    expect(isPathUnder("src/main.ts", root)).toBe(true);
    expect(isPathUnder("../escape", root)).toBe(false);
  });
});

describe("checkWorkspaceSandbox — single root (home only, no external folders)", () => {
  // read === write === [home] mirrors a non-agent thread (cwd only).
  const home = "/Users/jay/proj";
  const roots = { read: [home], write: [home] };

  it("allows Read inside root", () => {
    expect(checkWorkspaceSandbox("Read", { file_path: "/Users/jay/proj/a.ts" }, roots)).toBeNull();
  });
  it("denies Read outside root", () => {
    const reason = checkWorkspaceSandbox(
      "Read",
      { file_path: "/Users/other/secret.txt" },
      roots,
    );
    expect(reason).not.toBeNull();
  });
  it("denies Write outside root", () => {
    expect(
      checkWorkspaceSandbox("Write", { file_path: "/etc/passwd" }, roots),
    ).not.toBeNull();
  });
  it("denies Edit + MultiEdit + NotebookEdit outside root", () => {
    for (const t of ["Edit", "MultiEdit", "NotebookEdit"]) {
      expect(
        checkWorkspaceSandbox(t, { file_path: "/elsewhere/x" }, roots),
      ).not.toBeNull();
    }
  });
  it("Glob with no path passes (defaults to cwd)", () => {
    expect(checkWorkspaceSandbox("Glob", { pattern: "**/*.ts" }, roots)).toBeNull();
  });
  it("Glob with path outside root denies", () => {
    expect(
      checkWorkspaceSandbox("Glob", { pattern: "**/*", path: "/Users/jay/other" }, roots),
    ).not.toBeNull();
  });
  it("Grep with path inside root allows", () => {
    expect(
      checkWorkspaceSandbox("Grep", { pattern: "foo", path: "/Users/jay/proj/src" }, roots),
    ).toBeNull();
  });
  it("Bash is intentionally not sandboxed by path inspection", () => {
    expect(
      checkWorkspaceSandbox("Bash", { command: "cat /etc/hosts" }, roots),
    ).toBeNull();
  });
  it("WebFetch / WebSearch / Task pass through", () => {
    expect(checkWorkspaceSandbox("WebFetch", { url: "https://x", prompt: "y" }, roots)).toBeNull();
    expect(checkWorkspaceSandbox("WebSearch", { query: "anything" }, roots)).toBeNull();
    expect(checkWorkspaceSandbox("Task", { description: "x" }, roots)).toBeNull();
  });
});

describe("checkWorkspaceSandbox — multi-root (home + external folders)", () => {
  const home = "/Users/jay/home";
  const readonlyExt = "/Volumes/share/readonly";
  const writableExt = "/Volumes/share/writable";
  // External folders are ALL readable; only `writableExt` is writable.
  const roots = {
    read: [home, readonlyExt, writableExt],
    write: [home, writableExt],
  };

  it("allows Read in any mounted folder (home + both external)", () => {
    expect(checkWorkspaceSandbox("Read", { file_path: `${home}/a.ts` }, roots)).toBeNull();
    expect(checkWorkspaceSandbox("Read", { file_path: `${readonlyExt}/b.ts` }, roots)).toBeNull();
    expect(checkWorkspaceSandbox("Read", { file_path: `${writableExt}/c.ts` }, roots)).toBeNull();
  });

  it("denies Read outside every mounted folder", () => {
    expect(checkWorkspaceSandbox("Read", { file_path: "/etc/passwd" }, roots)).not.toBeNull();
  });

  it("allows Write to home and to a writable external folder", () => {
    expect(checkWorkspaceSandbox("Write", { file_path: `${home}/out.txt` }, roots)).toBeNull();
    expect(checkWorkspaceSandbox("Write", { file_path: `${writableExt}/out.txt` }, roots)).toBeNull();
  });

  it("denies Write to a read-only external folder (readable but not writable)", () => {
    const reason = checkWorkspaceSandbox("Write", { file_path: `${readonlyExt}/x.txt` }, roots);
    expect(reason).not.toBeNull();
    expect(reason).toContain("writable");
  });

  it("denies Edit to a read-only external folder", () => {
    expect(
      checkWorkspaceSandbox("Edit", { file_path: `${readonlyExt}/x.txt` }, roots),
    ).not.toBeNull();
  });

  it("Grep search root in a read-only external folder is allowed", () => {
    expect(
      checkWorkspaceSandbox("Grep", { pattern: "foo", path: `${readonlyExt}/sub` }, roots),
    ).toBeNull();
  });
});

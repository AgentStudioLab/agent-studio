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

describe("checkWorkspaceSandbox", () => {
  const root = "/Users/jay/proj";

  it("allows Read inside root", () => {
    expect(checkWorkspaceSandbox("Read", { file_path: "/Users/jay/proj/a.ts" }, root)).toBeNull();
  });
  it("denies Read outside root", () => {
    const reason = checkWorkspaceSandbox(
      "Read",
      { file_path: "/Users/other/secret.txt" },
      root,
    );
    expect(reason).toContain("outside the working directory");
  });
  it("denies Write outside root", () => {
    expect(
      checkWorkspaceSandbox("Write", { file_path: "/etc/passwd" }, root),
    ).not.toBeNull();
  });
  it("denies Edit + MultiEdit + NotebookEdit outside root", () => {
    for (const t of ["Edit", "MultiEdit", "NotebookEdit"]) {
      expect(
        checkWorkspaceSandbox(t, { file_path: "/elsewhere/x" }, root),
      ).not.toBeNull();
    }
  });
  it("Glob with no path passes (defaults to cwd)", () => {
    expect(checkWorkspaceSandbox("Glob", { pattern: "**/*.ts" }, root)).toBeNull();
  });
  it("Glob with path outside root denies", () => {
    expect(
      checkWorkspaceSandbox(
        "Glob",
        { pattern: "**/*", path: "/Users/jay/other" },
        root,
      ),
    ).not.toBeNull();
  });
  it("Grep with path inside root allows", () => {
    expect(
      checkWorkspaceSandbox(
        "Grep",
        { pattern: "foo", path: "/Users/jay/proj/src" },
        root,
      ),
    ).toBeNull();
  });
  it("Bash is intentionally not sandboxed by path inspection", () => {
    // The command could `cd` anywhere — Bash relies on HITL approval, not
    // a static path check. The sandbox layer must return null here.
    expect(
      checkWorkspaceSandbox("Bash", { command: "cat /etc/hosts" }, root),
    ).toBeNull();
  });
  it("WebFetch / WebSearch / Task pass through", () => {
    expect(checkWorkspaceSandbox("WebFetch", { url: "https://x", prompt: "y" }, root)).toBeNull();
    expect(checkWorkspaceSandbox("WebSearch", { query: "anything" }, root)).toBeNull();
    expect(checkWorkspaceSandbox("Task", { description: "x" }, root)).toBeNull();
  });
});

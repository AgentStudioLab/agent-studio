import { describe, it, expect } from "bun:test";
import { parseRule, matchApprovalRule, anyRuleMatches } from "./approval-rules";

describe("parseRule", () => {
  it("parses a bare tool name", () => {
    expect(parseRule("Bash")).toEqual({ tool: "Bash", pattern: null });
    expect(parseRule("  Edit  ")).toEqual({ tool: "Edit", pattern: null });
  });

  it("parses Tool(pattern), keeping inner spaces/parens", () => {
    expect(parseRule("Bash(git status:*)")).toEqual({ tool: "Bash", pattern: "git status:*" });
    expect(parseRule("Bash(echo (hi))")).toEqual({ tool: "Bash", pattern: "echo (hi)" });
    expect(parseRule("Bash(*)")).toEqual({ tool: "Bash", pattern: "*" });
  });

  it("rejects garbage / non-identifier tool names", () => {
    expect(parseRule("")).toBeNull();
    expect(parseRule("git status")).toBeNull(); // 命令片段不是裸工具名
    expect(parseRule("Bash(unterminated")).toBeNull();
  });
});

describe("matchApprovalRule", () => {
  const bash = (command: string) => ({ command });

  it("bare name and (*) allow every invocation of that tool", () => {
    expect(matchApprovalRule("Bash", "Bash", bash("rm -rf /"))).toBe(true);
    expect(matchApprovalRule("Bash(*)", "Bash", bash("anything"))).toBe(true);
    expect(matchApprovalRule("Edit", "Edit", { file_path: "/x" })).toBe(true);
  });

  it("tool segment must match the toolName", () => {
    expect(matchApprovalRule("Edit", "Bash", bash("ls"))).toBe(false);
    expect(matchApprovalRule("Bash(ls)", "Edit", { file_path: "/x" })).toBe(false);
  });

  it("exact pattern matches only the identical command", () => {
    expect(matchApprovalRule("Bash(git status)", "Bash", bash("git status"))).toBe(true);
    expect(matchApprovalRule("Bash(git status)", "Bash", bash("  git status  "))).toBe(true); // trim
    expect(matchApprovalRule("Bash(git status)", "Bash", bash("git status --short"))).toBe(false);
    expect(matchApprovalRule("Bash(git status)", "Bash", bash("git statusx"))).toBe(false);
  });

  it("`prefix:*` matches the prefix itself and prefix + space", () => {
    const rule = "Bash(git status:*)";
    expect(matchApprovalRule(rule, "Bash", bash("git status"))).toBe(true);
    expect(matchApprovalRule(rule, "Bash", bash("git status --short"))).toBe(true);
    expect(matchApprovalRule(rule, "Bash", bash("git statusx"))).toBe(false); // 边界：不能粘连
    expect(matchApprovalRule(rule, "Bash", bash("git"))).toBe(false);
  });

  it("trailing `*` matches by prefix + word boundary (CC-style)", () => {
    expect(matchApprovalRule("Bash(rg *)", "Bash", bash("rg foo"))).toBe(true);
    expect(matchApprovalRule("Bash(rg *)", "Bash", bash("rgfoo"))).toBe(false); // 需要空格
    expect(matchApprovalRule("Bash(npm run *)", "Bash", bash("npm run test"))).toBe(true);
  });

  it("trailing `*` with no space enforces a word boundary (git* does NOT match gitfoo)", () => {
    expect(matchApprovalRule("Bash(git*)", "Bash", bash("git"))).toBe(true);
    expect(matchApprovalRule("Bash(git*)", "Bash", bash("git status"))).toBe(true);
    expect(matchApprovalRule("Bash(git*)", "Bash", bash("gitfoo"))).toBe(false); // 词边界，关键回归
  });

  it("degenerate empty patterns never match a real command", () => {
    expect(matchApprovalRule("Bash()", "Bash", bash("ls"))).toBe(false);
    expect(matchApprovalRule("Bash(  )", "Bash", bash("ls"))).toBe(false);
    expect(matchApprovalRule("Bash(:*)", "Bash", bash("ls"))).toBe(false);
    expect(matchApprovalRule("Bash()", "Bash", bash(""))).toBe(false);
  });

  it("non-Bash tool with a pattern never matches (out of scope this phase)", () => {
    expect(matchApprovalRule("Edit(/x/**)", "Edit", { file_path: "/x/a" })).toBe(false);
  });
});

describe("anyRuleMatches", () => {
  it("returns true if any rule matches", () => {
    const rules = ["Bash(git status:*)", "Bash(npm run test:*)"];
    expect(anyRuleMatches(rules, "Bash", { command: "npm run test --watch" })).toBe(true);
    expect(anyRuleMatches(rules, "Bash", { command: "rm -rf /" })).toBe(false);
  });

  it("empty rule set never matches", () => {
    expect(anyRuleMatches([], "Bash", { command: "ls" })).toBe(false);
  });
});

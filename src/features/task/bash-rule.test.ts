import { describe, it, expect } from "bun:test";
import { bashRulePrefix, buildBashRule } from "./bash-rule";

describe("bashRulePrefix", () => {
  it("stops at the first flag", () => {
    expect(bashRulePrefix("git status --short")).toBe("git status");
    expect(bashRulePrefix("rg -n foo")).toBe("rg");
  });

  it("stops at the first path-like token", () => {
    expect(bashRulePrefix("cat /etc/hosts")).toBe("cat");
    expect(bashRulePrefix("ls ./src")).toBe("ls");
  });

  it("keeps multi-word subcommands with no flags", () => {
    expect(bashRulePrefix("npm run test")).toBe("npm run test");
  });

  it("degrades to the first token when everything is a flag/path", () => {
    expect(bashRulePrefix("-v")).toBe("-v");
    expect(bashRulePrefix("/usr/bin/env node")).toBe("/usr/bin/env");
  });

  it("trims surrounding whitespace", () => {
    expect(bashRulePrefix("   git   status   ")).toBe("git status");
  });
});

describe("buildBashRule", () => {
  it("exact → Bash(<command>) trimmed", () => {
    expect(buildBashRule("  git status  ", "exact")).toBe("Bash(git status)");
  });

  it("prefix → Bash(<prefix>:*)", () => {
    expect(buildBashRule("git status --short", "prefix")).toBe("Bash(git status:*)");
    expect(buildBashRule("npm run test --watch", "prefix")).toBe("Bash(npm run test:*)");
  });
});

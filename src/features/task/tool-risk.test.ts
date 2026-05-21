import { describe, it, expect } from "bun:test";
import { assessToolRisk } from "./tool-risk";

describe("assessToolRisk", () => {
  it("flags rm -rf as high", () => {
    expect(assessToolRisk("Bash", { command: "rm -rf node_modules" })).toEqual({
      level: "high",
      label: "破坏性",
    });
  });
  it("flags sudo as high", () => {
    expect(assessToolRisk("Bash", { command: "sudo apt update" }).level).toBe("high");
  });
  it("flags mkfs as high", () => {
    expect(assessToolRisk("Bash", { command: "mkfs.ext4 /dev/sda1" }).level).toBe("high");
  });
  it("flags curl as medium", () => {
    expect(assessToolRisk("Bash", { command: "curl https://example.com" })).toEqual({
      level: "medium",
      label: "网络访问",
    });
  });
  it("flags WebSearch as medium", () => {
    expect(assessToolRisk("WebSearch", { query: "anything" }).level).toBe("medium");
  });
  it("flags WebFetch as medium", () => {
    expect(assessToolRisk("WebFetch", { url: "https://x", prompt: "y" }).level).toBe("medium");
  });
  it("flags writing to /etc as high", () => {
    expect(assessToolRisk("Write", { file_path: "/etc/hosts" })).toEqual({
      level: "high",
      label: "系统路径",
    });
  });
  it("flags editing /usr binaries as high", () => {
    expect(assessToolRisk("Edit", { file_path: "/usr/local/bin/x" }).level).toBe("high");
  });
  it("normal Bash returns none", () => {
    expect(assessToolRisk("Bash", { command: "ls -la" }).level).toBe("none");
  });
  it("plain Read returns none", () => {
    expect(assessToolRisk("Read", { file_path: "/tmp/x.txt" }).level).toBe("none");
  });
  it("write under home is fine", () => {
    expect(assessToolRisk("Write", { file_path: "/Users/jay/proj/a.ts" }).level).toBe("none");
  });
});

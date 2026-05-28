import { describe, expect, it } from "bun:test";
import { isDestructiveToolCall } from "./destructive";

describe("isDestructiveToolCall", () => {
  it("flags destructive Bash commands", () => {
    const cases = [
      "rm -rf node_modules",
      "rm -f secrets.txt",
      "rmdir build",
      "git push origin main --force",
      "git push -f",
      "git reset --hard HEAD~3",
      "git clean -fd",
      "sudo shutdown now",
      "dd if=/dev/zero of=/dev/sda",
    ];
    for (const command of cases) {
      expect(isDestructiveToolCall("Bash", { command })).toBe(true);
    }
  });

  it("leaves benign Bash commands alone", () => {
    const cases = [
      "ls -la",
      "git status",
      "git push origin main",
      "npm run build",
      "echo 'rm is just a word here'",
      "cat README.md",
    ];
    for (const command of cases) {
      expect(isDestructiveToolCall("Bash", { command })).toBe(false);
    }
  });

  it("never flags non-Bash tools (sandbox guards their paths)", () => {
    expect(isDestructiveToolCall("Write", { file_path: "/x", content: "" })).toBe(false);
    expect(isDestructiveToolCall("Read", { file_path: "/x" })).toBe(false);
    expect(isDestructiveToolCall("Edit", {})).toBe(false);
  });
});

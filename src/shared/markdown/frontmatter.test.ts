import { describe, expect, test } from "bun:test";
import { stripFrontmatter } from "./frontmatter";

describe("stripFrontmatter", () => {
  test("removes a leading YAML frontmatter block, keeps the body", () => {
    const md = [
      "---",
      "name: gentle-tone",
      'description: "用户要求语气像温柔的小猫咪"',
      "metadata:",
      "  node_type: memory",
      "  type: feedback",
      "  originThreadId: thr_PCqXZ9kyOg_b",
      "---",
      "",
      "用户要求走温柔小猫咪路线。",
    ].join("\n");
    expect(stripFrontmatter(md)).toBe("\n用户要求走温柔小猫咪路线。");
  });

  test("leaves content without frontmatter unchanged", () => {
    const md = "# Title\n\nbody text";
    expect(stripFrontmatter(md)).toBe(md);
  });

  test("does not strip a `---` that isn't at the very start", () => {
    const md = "intro paragraph\n\n---\nname: x\n---\n";
    expect(stripFrontmatter(md)).toBe(md);
  });

  test("preserves a horizontal rule inside the body", () => {
    const md = "---\nname: x\n---\n\nabove\n\n---\n\nbelow";
    expect(stripFrontmatter(md)).toBe("\nabove\n\n---\n\nbelow");
  });
});

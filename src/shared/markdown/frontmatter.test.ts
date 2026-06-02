import { describe, expect, test } from "bun:test";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  test("splits a leading frontmatter block from the body", () => {
    const md = [
      "---",
      "name: gentle-tone",
      'description: "用户要求语气像温柔的小猫咪"',
      "metadata:",
      "  type: feedback",
      "  originThreadId: thr_PCqXZ9kyOg_b",
      "---",
      "",
      "用户要求走温柔小猫咪路线。",
    ].join("\n");
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe(
      'name: gentle-tone\ndescription: "用户要求语气像温柔的小猫咪"\nmetadata:\n  type: feedback\n  originThreadId: thr_PCqXZ9kyOg_b',
    );
    expect(body).toBe("\n用户要求走温柔小猫咪路线。");
  });

  test("returns null frontmatter + original body when there's none", () => {
    const md = "# Title\n\nbody text";
    expect(splitFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });

  test("ignores a `---` that isn't at the very start", () => {
    const md = "intro paragraph\n\n---\nname: x\n---\n";
    expect(splitFrontmatter(md).frontmatter).toBeNull();
  });
});

describe("parseFrontmatter", () => {
  test("parses scalars + a nested map, unquoting values", () => {
    const raw =
      'name: gentle-tone\ndescription: "soft kitten"\nmetadata:\n  type: feedback\n  originThreadId: thr_1';
    expect(parseFrontmatter(raw)).toEqual([
      { key: "name", value: "gentle-tone", depth: 0 },
      { key: "description", value: "soft kitten", depth: 0 },
      { key: "metadata", value: "", depth: 0 },
      { key: "type", value: "feedback", depth: 1 },
      { key: "originThreadId", value: "thr_1", depth: 1 },
    ]);
  });

  test("keeps colons inside a value (timestamps)", () => {
    expect(parseFrontmatter("createdAt: 2026-06-02T02:22:39.025Z")).toEqual([
      { key: "createdAt", value: "2026-06-02T02:22:39.025Z", depth: 0 },
    ]);
  });
});

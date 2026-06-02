import { describe, expect, test } from "bun:test";
import { AVATAR_HUES, hueForAgent, initialsFromName } from "./agent-avatar";

describe("initialsFromName", () => {
  test("two latin words → first letters of each", () => {
    expect(initialsFromName("John Doe")).toBe("JD");
  });
  test("one latin word → first two letters", () => {
    expect(initialsFromName("Anthropic")).toBe("An");
  });
  test("CJK name → first glyph", () => {
    expect(initialsFromName("小猫咪")).toBe("小");
  });
  test("empty/whitespace → fallback", () => {
    expect(initialsFromName("   ")).toBe("?");
  });
});

describe("hueForAgent", () => {
  test("uses a valid stored hue", () => {
    expect(hueForAgent({ id: "agw_1", avatar: "blue" })).toBe("blue");
  });
  test("ignores an invalid stored hue, falls back to a known hue", () => {
    expect(AVATAR_HUES).toContain(hueForAgent({ id: "agw_1", avatar: "chartreuse" }));
  });
  test("null avatar → deterministic + stable for the same id", () => {
    const a = hueForAgent({ id: "agw_42", avatar: null });
    const b = hueForAgent({ id: "agw_42", avatar: null });
    expect(a).toBe(b);
    expect(AVATAR_HUES).toContain(a);
  });
});

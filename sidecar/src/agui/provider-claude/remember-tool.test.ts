import { describe, expect, it } from "bun:test";
import { resultToText, validateMemoryEditArgs, type MemoryEdit } from "./remember-tool";

describe("validateMemoryEditArgs", () => {
  it("add/replace require content", () => {
    expect(validateMemoryEditArgs({ action: "add" })).toContain("content");
    expect(validateMemoryEditArgs({ action: "replace", match: "x" })).toContain("content");
  });

  it("replace/remove require match", () => {
    expect(validateMemoryEditArgs({ action: "replace", content: "x" })).toContain("match");
    expect(validateMemoryEditArgs({ action: "remove" })).toContain("match");
  });

  it("valid combos pass", () => {
    expect(validateMemoryEditArgs({ action: "add", content: "x" })).toBeNull();
    expect(validateMemoryEditArgs({ action: "replace", content: "x", match: "y" })).toBeNull();
    expect(validateMemoryEditArgs({ action: "remove", match: "y" })).toBeNull();
  });

  it("whitespace-only content/match is rejected", () => {
    expect(validateMemoryEditArgs({ action: "add", content: "   " })).toContain("content");
    expect(validateMemoryEditArgs({ action: "remove", match: "  " })).toContain("match");
  });
});

describe("resultToText", () => {
  const edit = (a: MemoryEdit["action"], over: Partial<MemoryEdit> = {}): MemoryEdit => ({
    action: a,
    block: "facts",
    ...over,
  });

  it("ok messages vary by action", () => {
    expect(resultToText(edit("add"), { status: "ok", message: "uses bun" })).toBe(
      "Saved to facts memory: uses bun",
    );
    expect(resultToText(edit("replace"), { status: "ok", message: "uses bun v1.3" })).toContain(
      "Updated a facts memory",
    );
    expect(resultToText(edit("remove"), { status: "ok", message: "old fact" })).toContain(
      "Removed from facts memory",
    );
  });

  it("no_match explains user rows are off-limits", () => {
    const txt = resultToText(edit("remove", { match: "npm" }), { status: "no_match" });
    expect(txt).toContain('matches "npm"');
    expect(txt).toContain("didn't write yourself");
  });

  it("ambiguous lists the candidates and asks to be specific", () => {
    const txt = resultToText(edit("replace", { match: "bun", content: "x" }), {
      status: "ambiguous",
      matches: ["test with bun", "build with bun"],
    });
    expect(txt).toContain("matches 2 entries");
    expect(txt).toContain("- test with bun");
    expect(txt).toContain("- build with bun");
  });
});

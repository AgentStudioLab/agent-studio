import { describe, expect, test } from "bun:test";
import { validateMemoryEditArgs, resultToText } from "./remember-tool";

describe("validateMemoryEditArgs", () => {
  test("save requires file/title/hook/content", () => {
    expect(validateMemoryEditArgs({ action: "save" })).toBeTruthy();
    expect(validateMemoryEditArgs({ action: "save", file: "p", title: "P", hook: "h", content: "c" })).toBeNull();
  });
  test("remove requires file", () => {
    expect(validateMemoryEditArgs({ action: "remove" })).toBeTruthy();
    expect(validateMemoryEditArgs({ action: "remove", file: "p" })).toBeNull();
  });
});

describe("resultToText", () => {
  test("ok save / remove", () => {
    expect(resultToText({ action: "save", file: "p", title: "P", hook: "h", content: "c" }, { status: "ok", message: "P" })).toContain("Saved");
    expect(resultToText({ action: "remove", file: "p" }, { status: "ok", message: "p" })).toContain("Removed");
  });
  test("not_found", () => {
    expect(resultToText({ action: "remove", file: "p" }, { status: "not_found" })).toContain("No memory");
  });
});

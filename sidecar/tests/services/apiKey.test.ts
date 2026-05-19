import { describe, it, expect } from "bun:test";
import { createApiKeyState } from "../../src/services/apiKey";

describe("createApiKeyState", () => {
  it("returns initial value", () => {
    const s = createApiKeyState("sk-init");
    expect(s.get()).toBe("sk-init");
  });

  it("initial null when ctor arg undefined", () => {
    const s = createApiKeyState(undefined);
    expect(s.get()).toBeNull();
  });

  it("set replaces value", () => {
    const s = createApiKeyState(null);
    s.set("sk-new");
    expect(s.get()).toBe("sk-new");
  });

  it("set null clears", () => {
    const s = createApiKeyState("sk-x");
    s.set(null);
    expect(s.get()).toBeNull();
  });
});

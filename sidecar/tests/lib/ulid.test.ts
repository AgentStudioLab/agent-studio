import { describe, it, expect } from "bun:test";
import { ulid } from "../../src/lib/ulid";

describe("ulid", () => {
  it("returns 26-char string", () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("generates unique ids in tight loop", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(ulid());
    expect(set.size).toBe(1000);
  });

  it("is monotonically increasing across consecutive calls", () => {
    const a = ulid();
    const b = ulid();
    const c = ulid();
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});

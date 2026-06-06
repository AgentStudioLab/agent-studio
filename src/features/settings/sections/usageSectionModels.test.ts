import { describe, expect, it } from "bun:test";
import {
  formatCompactInteger,
  formatTokenCount,
  getUsageRange,
  usageRangeOptions,
} from "./usageSectionModels";

describe("usageSectionModels", () => {
  it("defines the supported usage ranges in display order", () => {
    expect(usageRangeOptions.map((item) => item.value)).toEqual(["7d", "30d", "all"]);
  });

  it("computes last 7 days as an inclusive-looking exclusive-end range", () => {
    const now = 1_700_000_000_000;
    const range = getUsageRange("7d", now);

    expect(range.from).toBe(now - 7 * 24 * 60 * 60 * 1000);
    expect(range.to).toBe(now + 1);
  });

  it("computes all time from epoch zero to the exclusive current instant", () => {
    const range = getUsageRange("all", 1_700_000_000_000);

    expect(range).toEqual({ from: 0, to: 1_700_000_000_001 });
  });

  it("formats token counts and integers for settings cards", () => {
    expect(formatTokenCount(1234567)).toBe(new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(1234567));
    expect(formatCompactInteger(42)).toBe("42");
  });
});

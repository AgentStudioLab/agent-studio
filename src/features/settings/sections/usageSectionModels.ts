export type UsageRangeValue = "7d" | "30d" | "all";

export const usageRangeOptions = [
  { value: "7d", labelKey: "settings.usage.range7d" },
  { value: "30d", labelKey: "settings.usage.range30d" },
  { value: "all", labelKey: "settings.usage.rangeAll" },
] as const satisfies ReadonlyArray<{
  value: UsageRangeValue;
  labelKey: string;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function getUsageRange(
  value: UsageRangeValue,
  now = Date.now(),
): { from: number; to: number } {
  // `/usage` 使用半开区间 [from, to)，这里给当前时间加 1ms，避免刚完成的本机记录被边界排除。
  const to = now + 1;
  if (value === "all") return { from: 0, to };
  const days = value === "7d" ? 7 : 30;
  return { from: now - days * DAY_MS, to };
}

export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactInteger(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

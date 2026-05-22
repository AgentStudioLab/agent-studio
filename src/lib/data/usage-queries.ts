import { useQuery } from "@tanstack/react-query";
import { getUsageSummary } from "./usage";
import type { UsageSummary } from "./types";

export const usageQueryKeys = {
  summary: (range: { from: number; to: number; threadId?: string }) =>
    ["usage", "summary", range.from, range.to, range.threadId ?? null] as const,
};

export function useUsageSummary(range: {
  from: number;
  to: number;
  threadId?: string;
}) {
  return useQuery<UsageSummary>({
    queryKey: usageQueryKeys.summary(range),
    queryFn: () => getUsageSummary(range),
    staleTime: 30_000,
  });
}

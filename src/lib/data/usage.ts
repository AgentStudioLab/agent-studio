import { authedFetch } from "../sidecar-client";
import type { UsageSummary } from "./types";

export async function getUsageSummary(range: {
  from: number;
  to: number;
  threadId?: string;
}): Promise<UsageSummary> {
  const params = new URLSearchParams({
    from: String(range.from),
    to: String(range.to),
  });
  if (range.threadId) params.set("thread_id", range.threadId);
  const res = await authedFetch(`/usage?${params.toString()}`);
  if (!res.ok) throw new Error(`getUsageSummary failed: ${res.status}`);
  const body = (await res.json()) as { summary: UsageSummary };
  return body.summary;
}

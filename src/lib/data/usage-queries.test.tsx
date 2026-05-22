import { describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useUsageSummary } from "./usage-queries";

// React Query's notifyManager batches state updates via setTimeout(cb, 0).
// In bun:test, that setTimeout fires but React doesn't flush synchronously.
// Override the scheduler to use queueMicrotask so updates flush in the same
// microtask checkpoint as the awaited fetch — making waitFor work reliably.
notifyManager.setScheduler(queueMicrotask);

mock.module("../sidecar-client", () => ({
  authedFetch: async (path: string) => {
    if (path.startsWith("/usage")) {
      return new Response(
        JSON.stringify({
          summary: {
            inputTokens: 100,
            outputTokens: 200,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalCostUsd: 0.01,
            runCount: 1,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  },
}));

describe("useUsageSummary", () => {
  it("fetches and returns summary", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useUsageSummary({ from: 0, to: Date.now() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.inputTokens).toBe(100);
    expect(result.current.data?.totalCostUsd).toBeCloseTo(0.01, 6);
  });
});

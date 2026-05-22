import { describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDefaultAllowedTools, useThreadAllowedTools } from "./thread-tools-queries";

// Task 16 found React Query v5's setTimeout scheduler doesn't play nice with bun:test;
// switching to queueMicrotask makes state updates land in the same microtask checkpoint as fetch.
notifyManager.setScheduler(queueMicrotask);

mock.module("../sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    if (path === "/settings/allowed-tools" && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(JSON.stringify({ tools: ["Bash", "Read"] }), { status: 200 });
    }
    if (path.startsWith("/conversations/") && path.endsWith("/allowed-tools")) {
      return new Response(JSON.stringify({ tools: null }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },
}));

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("thread-tools-queries", () => {
  it("useDefaultAllowedTools returns global default", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDefaultAllowedTools(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.tools).toEqual(["Bash", "Read"]));
  });

  it("useThreadAllowedTools falls back to global default when no override", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useThreadAllowedTools("t-1"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.tools).toEqual(["Bash", "Read"]));
    expect(result.current.overrideMode).toBe("global");
  });
});

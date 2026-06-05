import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useAvailableModels } from "./models";

notifyManager.setScheduler(queueMicrotask);

mock.module("@/lib/sidecar-client", () => ({
  fetchSidecar: async (path: string) => {
    if (path === "/models") {
      return new Response(
        JSON.stringify({
          data: [
            { id: "first", displayName: "First", description: "First model" },
            {
              id: "selected",
              displayName: "Selected",
              description: "Selected model",
            },
          ],
          defaultModelId: "selected",
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  },
}));

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useAvailableModels", () => {
  it("uses defaultModelId returned by the sidecar", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useAvailableModels(), {
      wrapper: wrap(qc),
    });

    await waitFor(() => expect(result.current.defaultModelId).toBe("selected"));
    expect(result.current.models.map((model) => model.id)).toEqual([
      "first",
      "selected",
    ]);
  });
});

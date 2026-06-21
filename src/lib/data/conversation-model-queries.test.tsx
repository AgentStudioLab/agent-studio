import { describe, expect, it, mock, beforeEach } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Conversation } from "./types";

notifyManager.setScheduler(queueMicrotask);

const fetchCalls: Array<{ path: string; init?: RequestInit }> = [];
let shouldFail = false;

const existingConversation: Conversation = {
  id: "thr_1",
  title: "Thread",
  agentWorkspaceId: null,
  pinned: false,
  archived: false,
  workingDir: "/tmp/work",
  scheduledTaskId: null,
  model: "gpt-5.1",
  permissionMode: null,
  createdAt: 1,
  updatedAt: 1,
};

mock.module("../sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    fetchCalls.push({ path, init });
    if (shouldFail) {
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    }
    const parsed = init?.body
      ? (JSON.parse(String(init.body)) as { model: string | null })
      : { model: null };
    return new Response(
      JSON.stringify({
        ...existingConversation,
        model: parsed.model,
        updatedAt: 2,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
}));

const { queryKeys, useUpdateConversationModelMutation } =
  require("./queries") as typeof import("./queries");

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchCalls.length = 0;
  shouldFail = false;
});

describe("useUpdateConversationModelMutation", () => {
  it("PATCHes the conversation model", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "deepseek-ai/DeepSeek-V3.2" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchCalls[0]?.path).toBe("/conversations/thr_1");
    expect(fetchCalls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      model: "deepseek-ai/DeepSeek-V3.2",
    });
  });

  it("optimistically updates the conversation detail cache and then stores the server result", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(queryKeys.detail("thr_1"), existingConversation);
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });

    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
      ).toBe("gpt-5.1-mini"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).updatedAt,
    ).toBe(2);
  });

  it("rolls back the optimistic model when PATCH fails", async () => {
    shouldFail = true;
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(queryKeys.detail("thr_1"), existingConversation);
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
    ).toBe("gpt-5.1");
  });
});

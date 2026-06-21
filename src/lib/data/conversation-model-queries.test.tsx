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
const deferredByModel = new Map<
  string,
  Array<{
    promise: Promise<Response>;
  }>
>();

function deferNextModelResponse(model: string) {
  let resolveDeferred: (response: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => {
    resolveDeferred = resolve;
  });
  const queue = deferredByModel.get(model) ?? [];
  queue.push({ promise });
  deferredByModel.set(model, queue);
  return resolveDeferred;
}

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

let detailResponse: Conversation = existingConversation;

mock.module("../sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    fetchCalls.push({ path, init });
    if (!init?.method && path === "/conversations/thr_1") {
      return new Response(JSON.stringify(detailResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const parsed = init?.body
      ? (JSON.parse(String(init.body)) as { model: string | null })
      : { model: null };
    const deferred =
      parsed.model === null ? undefined : deferredByModel.get(parsed.model);
    if (deferred) {
      const next = deferred.shift();
      if (deferred.length === 0) {
        deferredByModel.delete(parsed.model!);
      }
      if (next) {
        return next.promise;
      }
    }
    if (shouldFail) {
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    }
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
const { useConversation } = require("./queries") as typeof import("./queries");

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchCalls.length = 0;
  shouldFail = false;
  detailResponse = existingConversation;
  deferredByModel.clear();
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

  it("does not let a stale success overwrite a newer optimistic model", async () => {
    const resolveStaleSuccess = deferNextModelResponse("gpt-5.1-mini");
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

    result.current.mutate({ id: "thr_1", model: "deepseek-ai/DeepSeek-V3.2" });
    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
      ).toBe("deepseek-ai/DeepSeek-V3.2"),
    );

    resolveStaleSuccess(
      new Response(
        JSON.stringify({
          ...existingConversation,
          model: "gpt-5.1-mini",
          updatedAt: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).updatedAt,
      ).toBe(2),
    );
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
    ).toBe("deepseek-ai/DeepSeek-V3.2");
  });

  it("does not let a stale error roll back a newer optimistic model", async () => {
    const resolveStaleError = deferNextModelResponse("gpt-5.1-mini");
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

    result.current.mutate({ id: "thr_1", model: "deepseek-ai/DeepSeek-V3.2" });
    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
      ).toBe("deepseek-ai/DeepSeek-V3.2"),
    );

    resolveStaleError(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
    ).toBe("deepseek-ai/DeepSeek-V3.2");
  });

  it("does not let a stale same-model success overwrite the newer server result", async () => {
    const resolveStaleSuccess = deferNextModelResponse("gpt-5.1-mini");
    const resolveFreshSuccess = deferNextModelResponse("gpt-5.1-mini");
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

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });
    resolveFreshSuccess(
      new Response(
        JSON.stringify({
          ...existingConversation,
          title: "Fresh server result",
          model: "gpt-5.1-mini",
          updatedAt: 4,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).title,
      ).toBe("Fresh server result"),
    );

    resolveStaleSuccess(
      new Response(
        JSON.stringify({
          ...existingConversation,
          title: "Stale server result",
          model: "gpt-5.1-mini",
          updatedAt: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).title,
    ).toBe("Fresh server result");
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).updatedAt,
    ).toBe(4);
  });

  it("does not let a stale same-model error roll back the newer mutation", async () => {
    const resolveStaleError = deferNextModelResponse("gpt-5.1-mini");
    const resolveFreshSuccess = deferNextModelResponse("gpt-5.1-mini");
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

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });
    resolveFreshSuccess(
      new Response(
        JSON.stringify({
          ...existingConversation,
          title: "Fresh server result",
          model: "gpt-5.1-mini",
          updatedAt: 4,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).title,
      ).toBe("Fresh server result"),
    );

    resolveStaleError(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).title,
    ).toBe("Fresh server result");
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
    ).toBe("gpt-5.1-mini");
  });

  it("does not let stale settled invalidation refetch over a newer optimistic model", async () => {
    const resolveStaleSuccess = deferNextModelResponse("gpt-5.1-mini");
    deferNextModelResponse("deepseek-ai/DeepSeek-V3.2");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => ({
        conversation: useConversation("thr_1"),
        mutation: useUpdateConversationModelMutation(),
      }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() =>
      expect(result.current.conversation.data?.model).toBe("gpt-5.1"),
    );

    result.current.mutation.mutate({ id: "thr_1", model: "gpt-5.1-mini" });
    await waitFor(() =>
      expect(result.current.conversation.data?.model).toBe("gpt-5.1-mini"),
    );

    result.current.mutation.mutate({
      id: "thr_1",
      model: "deepseek-ai/DeepSeek-V3.2",
    });
    await waitFor(() =>
      expect(result.current.conversation.data?.model).toBe(
        "deepseek-ai/DeepSeek-V3.2",
      ),
    );

    detailResponse = {
      ...existingConversation,
      title: "Server stale detail",
      model: "gpt-5.1-mini",
      updatedAt: 3,
    };
    resolveStaleSuccess(
      new Response(
        JSON.stringify({
          ...existingConversation,
          model: "gpt-5.1-mini",
          updatedAt: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.conversation.data?.model).toBe(
      "deepseek-ai/DeepSeek-V3.2",
    );
    expect(
      fetchCalls.filter(
        (call) => call.path === "/conversations/thr_1" && !call.init?.method,
      ),
    ).toHaveLength(1);
  });

  it("does not let a delayed stale onMutate overwrite a newer optimistic model", async () => {
    deferNextModelResponse("gpt-5.1-mini");
    deferNextModelResponse("deepseek-ai/DeepSeek-V3.2");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(queryKeys.detail("thr_1"), existingConversation);
    const originalCancelQueries = qc.cancelQueries.bind(qc);
    let resolveFirstCancel: () => void = () => {};
    let cancelCalls = 0;
    qc.cancelQueries = ((filters) => {
      cancelCalls += 1;
      if (cancelCalls === 1) {
        return new Promise<void>((resolve) => {
          resolveFirstCancel = resolve;
        });
      }
      return originalCancelQueries(filters);
    }) as typeof qc.cancelQueries;
    const { result } = renderHook(() => useUpdateConversationModelMutation(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate({ id: "thr_1", model: "gpt-5.1-mini" });
    await waitFor(() => expect(cancelCalls).toBe(1));

    result.current.mutate({
      id: "thr_1",
      model: "deepseek-ai/DeepSeek-V3.2",
    });
    await waitFor(() =>
      expect(
        (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
      ).toBe("deepseek-ai/DeepSeek-V3.2"),
    );

    resolveFirstCancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (qc.getQueryData(queryKeys.detail("thr_1")) as Conversation).model,
    ).toBe("deepseek-ai/DeepSeek-V3.2");
  });
});

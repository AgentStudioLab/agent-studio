// Pins the contract that createChatRuntime forwards opts.fetchImpl to the SSE
// layer (createResumableRun). Without this, SSE falls through to the global
// fetch which hits the page origin (Vite at :1420 returning index.html) and
// auth Bearer headers are dropped — the exact regression we just fixed.

import { describe, expect, it, mock } from "bun:test";
import { createChatRuntime } from "./runtime";
import type { AGUIEventLike } from "./types";
import { applyEvent, appendInterruptedNotice } from "./reducer";
import { createInitialState } from "./types";

function makeFakeSse(frames: string[]) {
  return mock(async (url: string | URL | Request) => {
    void url;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

describe("createChatRuntime — fetchImpl forwarding", () => {
  it("uses opts.fetchImpl for the SSE long-poll", async () => {
    const seen: string[] = [];

    // Capture what URL/headers the SSE layer hits.
    const fakeFetch = (async (input, init = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const auth = new Headers(init.headers).get("Authorization") ?? "";
      seen.push(`${url} | ${auth}`);
      // Reply with one RUN_FINISHED so the resumable loop exits cleanly.
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              `id: 1\nevent: RUN_FINISHED\ndata: ${JSON.stringify({
                type: "RUN_FINISHED",
                threadId: "t",
                runId: "r",
              })}\n\n`,
            ),
          );
          c.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const rt = createChatRuntime({
      threadId: "t",
      fetchImpl: fakeFetch,
    });

    rt.attachToRun("r");

    // Give the resumable loop time to make the request + close.
    await new Promise((r) => setTimeout(r, 50));

    expect(seen.length).toBeGreaterThan(0);
    // The wiring should hit the events endpoint via the runtime's HTTP client.
    expect(seen[0]).toContain("/runs/r/events");

    rt.destroy();
  });

  it("reducer turns TEXT_MESSAGE events into a live assistant turn", async () => {
    const frames = [
      `id: 1\nevent: RUN_STARTED\ndata: ${JSON.stringify({ type: "RUN_STARTED", threadId: "t", runId: "r" })}\n\n`,
      `id: 2\nevent: TEXT_MESSAGE_START\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" })}\n\n`,
      `id: 3\nevent: TEXT_MESSAGE_CONTENT\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hello" })}\n\n`,
      `id: 4\nevent: TEXT_MESSAGE_END\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_END", messageId: "m1" })}\n\n`,
      `id: 5\nevent: RUN_FINISHED\ndata: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "t", runId: "r" })}\n\n`,
    ];
    const fakeFetch = makeFakeSse(frames);
    const rt = createChatRuntime({ threadId: "t", fetchImpl: fakeFetch });
    rt.attachToRun("r");
    await new Promise((r) => setTimeout(r, 50));

    const s = rt.getState();
    // Run finished → live is archived into historical.
    const all = [...s.historicalMessages, ...s.liveMessages];
    expect(all.length).toBe(1);
    const turn = all[0]!;
    expect(turn.role).toBe("assistant");
    if (turn.role !== "assistant") throw new Error("expected assistant");
    expect(turn.blocks).toHaveLength(1);
    const text = turn.blocks[0]!;
    if (text.kind !== "text") throw new Error("expected text");
    expect(text.content).toBe("hello");

    rt.destroy();
  });

  // Silence unused-imports lint
  it("AGUIEventLike type is structurally accessible", () => {
    const ev: AGUIEventLike = { type: "RUN_STARTED" };
    expect(ev.type).toBe("RUN_STARTED");
  });
});

describe("createChatRuntime — official provider request fields", () => {
  it("forwards official auth fields when sending a new run", async () => {
    const bodies: unknown[] = [];
    const fakeFetch = mock(async (input: string | URL | Request, init = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/runs")) {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ runId: "run_1" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      return makeFakeSse([
        `id: 1\nevent: RUN_FINISHED\ndata: ${JSON.stringify({
          type: "RUN_FINISHED",
          threadId: "t",
          runId: "run_1",
        })}\n\n`,
      ])(input);
    }) as unknown as typeof fetch;

    const rt = createChatRuntime({ threadId: "t", fetchImpl: fakeFetch });

    await rt.send("hello", {
      providerSelection: { providerId: "official", modelId: "gpt-5.1" },
      officialAuthToken: "access-token",
      officialWebsiteOrigin: "https://example.test",
    } as never);

    expect(bodies[0]).toMatchObject({
      officialAuthToken: "access-token",
      officialWebsiteOrigin: "https://example.test",
    });
    rt.destroy();
  });

  it("forwards official auth fields when regenerating a run", async () => {
    const bodies: unknown[] = [];
    const fakeFetch = mock(async (input: string | URL | Request, init = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/threads/t/regenerate")) {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ runId: "run_2" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      return makeFakeSse([
        `id: 1\nevent: RUN_FINISHED\ndata: ${JSON.stringify({
          type: "RUN_FINISHED",
          threadId: "t",
          runId: "run_2",
        })}\n\n`,
      ])(input);
    }) as unknown as typeof fetch;

    const rt = createChatRuntime({
      threadId: "t",
      fetchImpl: fakeFetch,
      initialMessages: [{ id: "user-1", role: "user", content: "hello" }],
    });

    await rt.regenerate("user-1", {
      providerSelection: { providerId: "official", modelId: "gpt-5.1" },
      officialAuthToken: "access-token",
      officialWebsiteOrigin: "https://example.test",
    } as never);

    expect(bodies[0]).toMatchObject({
      officialAuthToken: "access-token",
      officialWebsiteOrigin: "https://example.test",
    });
    rt.destroy();
  });
});

describe("createChatRuntime — replay idempotency", () => {
  it("attaching twice to the same run replays without duplicating blocks", async () => {
    // Two SSE servings of the same event stream, simulating: client attaches,
    // disconnects (or refreshes), attaches again → SSE replays from cursor 0.
    // The reducer must end up with ONE text block, ONE assistant turn,
    // accumulated content === "hello world".
    const frames = [
      `id: 1\nevent: RUN_STARTED\ndata: ${JSON.stringify({ type: "RUN_STARTED", threadId: "t", runId: "r" })}\n\n`,
      `id: 2\nevent: TEXT_MESSAGE_START\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" })}\n\n`,
      `id: 3\nevent: TEXT_MESSAGE_CONTENT\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hello " })}\n\n`,
      `id: 4\nevent: TEXT_MESSAGE_CONTENT\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "world" })}\n\n`,
      `id: 5\nevent: TEXT_MESSAGE_END\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_END", messageId: "m1" })}\n\n`,
      `id: 6\nevent: RUN_FINISHED\ndata: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "t", runId: "r" })}\n\n`,
    ];

    // First serve fully (simulates initial mount); second serve same frames
    // (simulates page refresh hitting GET /events?after=0).
    const serveFrames = (queue: string[]) =>
      mock(async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            for (const f of queue) c.enqueue(encoder.encode(f));
            c.close();
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }) as unknown as typeof fetch;

    const rt = createChatRuntime({ threadId: "t", fetchImpl: serveFrames(frames) });
    rt.attachToRun("r");
    await new Promise((r) => setTimeout(r, 50));

    const first = rt.getState();
    const firstAll = [...first.historicalMessages, ...first.liveMessages];
    expect(firstAll).toHaveLength(1);
    const firstTurn = firstAll[0]!;
    if (firstTurn.role !== "assistant") throw new Error("expected assistant");
    expect(firstTurn.blocks).toHaveLength(1);
    const firstText = firstTurn.blocks[0]!;
    if (firstText.kind !== "text") throw new Error("expected text");
    expect(firstText.content).toBe("hello world");

    rt.destroy();

    // Second runtime over the same frames — simulates a fresh page mount
    // hitting GET /events?after=0 again. Reducer must converge to the same
    // single-turn / single-text-block / accumulated-content state.
    const rt2 = createChatRuntime({ threadId: "t", fetchImpl: serveFrames(frames) });
    rt2.attachToRun("r");
    await new Promise((r) => setTimeout(r, 50));

    const second = rt2.getState();
    const secondAll = [
      ...second.historicalMessages,
      ...second.liveMessages,
    ];
    expect(secondAll).toHaveLength(1);
    const secondTurn = secondAll[0]!;
    if (secondTurn.role !== "assistant") throw new Error("expected assistant");
    expect(secondTurn.blocks).toHaveLength(1);
    const secondText = secondTurn.blocks[0]!;
    if (secondText.kind !== "text") throw new Error("expected text");
    expect(secondText.content).toBe("hello world");

    rt2.destroy();
  });

  it("attachToRun is a no-op when called twice with the same runId on the same runtime", async () => {
    let callCount = 0;
    const fakeFetch = (async () => {
      callCount++;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              `id: 1\nevent: RUN_FINISHED\ndata: ${JSON.stringify({
                type: "RUN_FINISHED",
                threadId: "t",
                runId: "r",
              })}\n\n`,
            ),
          );
          c.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const rt = createChatRuntime({ threadId: "t", fetchImpl: fakeFetch });
    rt.attachToRun("r");
    rt.attachToRun("r"); // second attach for the same runId should not reopen
    await new Promise((r) => setTimeout(r, 80));
    // Exactly one HTTP request to /events.
    expect(callCount).toBe(1);

    rt.destroy();
  });
});

describe("reducer — error code + retry", () => {
  it("RUN_ERROR with code sets errorCode", () => {
    const s = applyEvent(
      createInitialState(),
      { type: "RUN_ERROR", code: "AUTH_FAILED", message: "authentication_failed" },
      new Map(),
    );
    expect(s.errorCode).toBe("AUTH_FAILED");
    expect(s.error).toBe("authentication_failed");
  });

  // User-cancelled run (stop button or HITL deny → server abort) must NOT
  // surface "错误：xxx" — the "已被用户中止" notice is the only UI affordance.
  it("RUN_ERROR CANCELLED suppresses error banner and appends notice", () => {
    let s = applyEvent(
      createInitialState(),
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
      new Map(),
    );
    s = applyEvent(
      s,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "thinking..." },
      new Map(),
    );

    s = applyEvent(
      s,
      { type: "RUN_ERROR", code: "CANCELLED", message: "This operation was aborted" },
      new Map(),
    );

    expect(s.error).toBeNull();
    expect(s.errorCode).toBe("CANCELLED");
    const lastTurn = s.liveMessages[s.liveMessages.length - 1];
    if (!lastTurn || lastTurn.role !== "assistant") throw new Error("expected assistant turn");
    const lastBlock = lastTurn.blocks[lastTurn.blocks.length - 1];
    expect(lastBlock?.kind).toBe("notice");
    if (lastBlock?.kind === "notice") {
      expect(lastBlock.content).toBe("已被用户中止");
      expect(lastBlock.level).toBe("interrupted");
    }
  });

  // Process restart (sidecar exited while HITL was pending) → reconcile
  // emits RUN_ERROR with reason=process_restart. The reducer must tag the
  // notice block with that reason so ChatStream renders the "继续上次任务" CTA.
  it("RUN_ERROR CANCELLED with reason=process_restart tags the notice block", () => {
    let s = applyEvent(
      createInitialState(),
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
      new Map(),
    );
    s = applyEvent(
      s,
      {
        type: "RUN_ERROR",
        code: "CANCELLED",
        reason: "process_restart",
        message: "process restart",
      },
      new Map(),
    );
    const lastTurn = s.liveMessages[s.liveMessages.length - 1];
    if (!lastTurn || lastTurn.role !== "assistant") throw new Error("expected assistant turn");
    const notice = lastTurn.blocks[lastTurn.blocks.length - 1];
    if (!notice || notice.kind !== "notice") throw new Error("expected notice block");
    expect(notice.reason).toBe("process_restart");
    expect(notice.content).toContain("应用被关闭");
  });

  it("appendInterruptedNotice is idempotent (double-fire safe)", () => {
    let s = applyEvent(
      createInitialState(),
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
      new Map(),
    );
    s = { ...s, liveMessages: appendInterruptedNotice(s.liveMessages) };
    const blocksAfter1 = s.liveMessages[s.liveMessages.length - 1]!.blocks.length;
    s = { ...s, liveMessages: appendInterruptedNotice(s.liveMessages) };
    const blocksAfter2 = s.liveMessages[s.liveMessages.length - 1]!.blocks.length;
    expect(blocksAfter2).toBe(blocksAfter1);
  });


  it("CUSTOM agent.retry sets retry state", () => {
    const s = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.retry",
        value: { attempt: 2, maxRetries: 5, retryDelayMs: 1500, errorStatus: 503, error: "server_error" },
      },
      new Map(),
    );
    expect(s.retry?.attempt).toBe(2);
    expect(s.retry?.retryDelayMs).toBe(1500);
  });

  // c4f18e1 (server) reconciles awaiting_approval orphans → status=cancelled +
  // synthetic RUN_ERROR(CANCELLED). On SSE replay, the reducer first applies
  // RUN_FINISHED(outcome:"interrupt") → pendingInterrupts populated, then the
  // RUN_ERROR. Without this clear, the stale card stays clickable and the next
  // Allow click POSTs /resume against an empty deferred Map → 409.
  it("RUN_ERROR clears stale pendingInterrupts (post-restart replay)", () => {
    let s = applyEvent(
      createInitialState(),
      {
        type: "RUN_FINISHED",
        threadId: "t",
        runId: "r",
        outcome: "interrupt",
        interrupts: [
          {
            id: "tool_1",
            reason: "tool_approval",
            payload: { toolName: "Bash", input: { command: "ls" } },
          },
        ],
      } as AGUIEventLike,
      new Map(),
    );
    expect(s.pendingInterrupts.length).toBe(1);

    s = applyEvent(
      s,
      { type: "RUN_ERROR", code: "CANCELLED", message: "process restart" },
      new Map(),
    );
    expect(s.pendingInterrupts).toEqual([]);
    expect(s.errorCode).toBe("CANCELLED");
  });

  // Same shape, but the terminating event is a non-interrupt RUN_FINISHED
  // (e.g. the run actually completed between the interrupt and the replay).
  it("RUN_FINISHED non-interrupt clears stale pendingInterrupts", () => {
    let s = applyEvent(
      createInitialState(),
      {
        type: "RUN_FINISHED",
        threadId: "t",
        runId: "r",
        outcome: "interrupt",
        interrupts: [
          {
            id: "tool_1",
            reason: "tool_approval",
            payload: { toolName: "Bash" },
          },
        ],
      } as AGUIEventLike,
      new Map(),
    );
    expect(s.pendingInterrupts.length).toBe(1);

    s = applyEvent(
      s,
      { type: "RUN_FINISHED", threadId: "t", runId: "r" } as AGUIEventLike,
      new Map(),
    );
    expect(s.pendingInterrupts).toEqual([]);
  });

  it("RUN_FINISHED clears retry", () => {
    let s = applyEvent(
      createInitialState(),
      {
        type: "CUSTOM",
        name: "agent.retry",
        value: { attempt: 1, maxRetries: 5, retryDelayMs: 1000, errorStatus: 503, error: "server_error" },
      },
      new Map(),
    );
    s = applyEvent(s, { type: "RUN_FINISHED", threadId: "t", runId: "r" }, new Map());
    expect(s.retry).toBeUndefined();
  });
});

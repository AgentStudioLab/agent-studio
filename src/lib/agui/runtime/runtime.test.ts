// Pins the contract that createChatRuntime forwards opts.fetchImpl to the SSE
// layer (createResumableRun). Without this, SSE falls through to the global
// fetch which hits the page origin (Vite at :1420 returning index.html) and
// auth Bearer headers are dropped — the exact regression we just fixed.

import { describe, expect, it, mock } from "bun:test";
import { createChatRuntime } from "./runtime";
import type { AGUIEventLike } from "./types";
import { applyEvent } from "./reducer";
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

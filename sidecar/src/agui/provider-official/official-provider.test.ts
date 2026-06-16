import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createOfficialProvider } from "./official-provider";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function runContext(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    threadId: "thread-1",
    userMessage: { role: "user" as const, content: "hi" },
    abortSignal: new AbortController().signal,
    cwd: "/tmp",
    model: "gpt-5-mini",
    officialAuthToken: "access-token",
    officialWebsiteOrigin: "https://www.agentstudio.chat",
    ...overrides,
  };
}

describe("official provider", () => {
  it("converts website NDJSON into AGUI text events and usage callback", async () => {
    const fetchMock = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://www.agentstudio.chat/api/desktop/ai/chat",
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer access-token",
      );
      expect(await new Request(url, init).json()).toEqual({
        runId: "run-1",
        threadId: "thread-1",
        model: "gpt-5-mini",
        messages: [{ role: "user", content: "hi" }],
      });

      return new Response(
        [
          JSON.stringify({ type: "text_delta", text: "你" }),
          JSON.stringify({ type: "text_delta", text: "好" }),
          JSON.stringify({
            type: "usage",
            usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
          }),
          JSON.stringify({ type: "billing", remainingCredits: 9 }),
          JSON.stringify({ type: "done" }),
        ].join("\n"),
        { headers: { "Content-Type": "application/x-ndjson" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const usageCalls: unknown[] = [];
    const provider = createOfficialProvider();

    const events = await collect(
      provider.run(
        runContext({
          callbacks: {
            onRunUsage: (usage: unknown) => {
              usageCalls.push(usage);
            },
          },
        }),
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(usageCalls).toEqual([
      expect.objectContaining({
        runId: "run-1",
        threadId: "thread-1",
        inputTokens: 3,
        outputTokens: 2,
        model: "gpt-5-mini",
      }),
    ]);
  });

  it("maps insufficient credits to the desktop error code", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          type: "error",
          code: "insufficient_credits",
          message: "insufficient credits",
          remainingCredits: 0,
        }),
        { status: 402 },
      )
    ) as unknown as typeof fetch;
    const provider = createOfficialProvider();

    const events = await collect(provider.run(runContext()));

    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: "thread-1",
        runId: "run-1",
      },
      {
        type: EventType.RUN_ERROR,
        code: "INSUFFICIENT_CREDITS",
        message: "insufficient credits",
      },
    ]);
  });

  it("does not fetch when official token or website origin is missing", async () => {
    const fetchMock = mock(async () => new Response(""));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const provider = createOfficialProvider();

    const events = await collect(
      provider.run(
        runContext({
          officialAuthToken: "",
          officialWebsiteOrigin: "",
        }),
      ),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: "thread-1",
        runId: "run-1",
      },
      {
        type: EventType.RUN_ERROR,
        code: "OFFICIAL_AUTH_REQUIRED",
        message: "official_auth_required",
      },
    ]);
  });

  it("does not emit RUN_FINISHED after abort", async () => {
    const abort = new AbortController();
    abort.abort();
    const provider = createOfficialProvider();

    const events = await collect(
      provider.run(
        runContext({
          abortSignal: abort.signal,
        }),
      ),
    );

    expect(events.map((event) => event.type)).not.toContain(
      EventType.RUN_FINISHED,
    );
  });
});

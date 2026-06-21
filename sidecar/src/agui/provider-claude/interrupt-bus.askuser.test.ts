// AskUser variant of the InterruptBus contract: round-trip a structured
// answers payload through requestAskUser → resolveAskUser, and confirm
// cancelAll resolves pending ask_user deferreds with empty answers (rather
// than denying them like tool_approval).

import { describe, expect, it } from "bun:test";
import { createInterruptBus } from "./interrupt-bus";
import type { RunEventStore } from "../core/store-types";

function fakeStore(): RunEventStore {
  return {
    appendEvent: async () => {},
    finishRun: async () => {},
    // The rest aren't exercised by the bus path under test — stubbed as
    // never so the cast above stays narrow.
  } as unknown as RunEventStore;
}

function observableStore() {
  const appended: unknown[] = [];
  const finished: Array<{ runId: string; status: string }> = [];
  return {
    store: {
      appendEvent: async (_runId: string, event: unknown) => {
        appended.push(event);
        return { cursor: String(appended.length), event };
      },
      finishRun: async (runId: string, status: string) => {
        finished.push({ runId, status });
      },
    } as unknown as RunEventStore,
    appended,
    finished,
  };
}

describe("InterruptBus — ask_user flow", () => {
  it("requestAskUser writes an ask_user interrupt and flips to awaiting_user", async () => {
    const { store, appended, finished } = observableStore();
    const bus = createInterruptBus({ store });

    void bus.requestAskUser({
      runId: "r1",
      threadId: "t1",
      toolUseID: "ask_1",
      questions: [
        {
          question: "color?",
          header: "Color",
          multiSelect: false,
          options: [{ label: "Red", description: "Warm" }],
        },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(finished).toEqual([{ runId: "r1", status: "awaiting_user" }]);
    expect(appended).toHaveLength(1);
    const event = appended[0] as {
      outcome?: string;
      interrupts?: Array<{ id: string; reason: string; payload: unknown }>;
    };
    expect(event.outcome).toBe("interrupt");
    expect(event.interrupts?.[0]?.id).toBe("ask_1");
    expect(event.interrupts?.[0]?.reason).toBe("ask_user");
  });

  it("resolves requestAskUser with the answers passed to resolveAskUser", async () => {
    const bus = createInterruptBus({ store: fakeStore() });
    const promise = bus.requestAskUser({
      runId: "r1",
      threadId: "t1",
      toolUseID: "tu_1",
      questions: [
        {
          question: "color?",
          header: "Color",
          multiSelect: false,
          options: [
            { label: "Red", description: "" },
            { label: "Blue", description: "" },
          ],
        },
      ],
    });

    const ok = bus.resolveAskUser("r1", "tu_1", {
      answers: { "color?": "Red" },
    });
    expect(ok).toBe(true);
    expect(await promise).toEqual({ answers: { "color?": "Red" } });
  });

  it("resolveAskUser returns false when no deferred exists", () => {
    const bus = createInterruptBus({ store: fakeStore() });
    const ok = bus.resolveAskUser("r1", "tu_missing", { answers: {} });
    expect(ok).toBe(false);
  });

  it("cancelAll resolves pending ask_user deferreds with empty answers", async () => {
    const bus = createInterruptBus({ store: fakeStore() });
    const promise = bus.requestAskUser({
      runId: "r1",
      threadId: "t1",
      toolUseID: "tu_1",
      questions: [
        {
          question: "ok?",
          header: "Ok",
          multiSelect: false,
          options: [
            { label: "Yes", description: "" },
            { label: "No", description: "" },
          ],
        },
      ],
    });

    bus.cancelAll("r1");
    expect(await promise).toEqual({ answers: {} });
  });

  it("permission and ask_user deferreds are isolated — wrong-type resolve doesn't match", async () => {
    const bus = createInterruptBus({ store: fakeStore() });
    const askPromise = bus.requestAskUser({
      runId: "r1",
      threadId: "t1",
      toolUseID: "tu_1",
      questions: [
        {
          question: "?",
          header: "?",
          multiSelect: false,
          options: [
            { label: "A", description: "" },
            { label: "B", description: "" },
          ],
        },
      ],
    });

    // Try to resolve the ask_user interrupt via the permission path — should
    // miss the askUserDeferreds map and return false.
    const wrongOk = bus.resolve("r1", "tu_1", { behavior: "allow" });
    expect(wrongOk).toBe(false);

    // The deferred should still be pending; the correct call resolves it.
    const correctOk = bus.resolveAskUser("r1", "tu_1", {
      answers: { "?": "A" },
    });
    expect(correctOk).toBe(true);
    expect(await askPromise).toEqual({ answers: { "?": "A" } });
  });
});

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

describe("InterruptBus — ask_user flow", () => {
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

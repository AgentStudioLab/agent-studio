import { describe, expect, it } from "bun:test";
import { applyEvent } from "./reducer";
import { createInitialState } from "./types";

describe("reducer — RUN_STARTED captures runStartedAt", () => {
  it("sets runStartedAt to a number on RUN_STARTED", () => {
    const buf = new Map<string, string>();
    const before = Date.now();
    const next = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const after = Date.now();
    expect(next.runStartedAt).toBeGreaterThanOrEqual(before);
    expect(next.runStartedAt).toBeLessThanOrEqual(after);
  });

  it("RUN_FINISHED clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    expect(started.runStartedAt).not.toBeNull();
    const finished = applyEvent(
      started,
      { type: "RUN_FINISHED", threadId: "t", runId: "r" },
      buf,
    );
    expect(finished.runStartedAt).toBeNull();
  });

  it("RUN_ERROR clears runStartedAt", () => {
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const errored = applyEvent(
      started,
      { type: "RUN_ERROR", message: "boom" },
      buf,
    );
    expect(errored.runStartedAt).toBeNull();
  });

  it("RUN_FINISHED(interrupt) keeps runStartedAt alive (HITL pause, not completion)", () => {
    // Elapsed timer should keep ticking while user reviews an approval card.
    // Removing this test would let a future "cleanup" of handleRunFinished's
    // interrupt branch silently break the UX.
    const buf = new Map<string, string>();
    const started = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    const interrupted = applyEvent(
      started,
      {
        type: "RUN_FINISHED",
        threadId: "t",
        runId: "r",
        outcome: "interrupt",
        interrupts: [],
      },
      buf,
    );
    expect(interrupted.runStartedAt).not.toBeNull();
    expect(interrupted.runStartedAt).toBe(started.runStartedAt);
  });
});

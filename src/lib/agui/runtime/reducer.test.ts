import { describe, expect, it } from "bun:test";
import { applyEvent } from "./reducer";
import { createInitialState } from "./types";

describe("reducer — RUN_STARTED captures runStartedAt", () => {
  it("sets runStartedAt to a number on RUN_STARTED", () => {
    const before = Date.now() - 1;
    const buf = new Map<string, string>();
    const next = applyEvent(
      createInitialState(),
      { type: "RUN_STARTED", threadId: "t", runId: "r" },
      buf,
    );
    expect(next.runStartedAt).toBeGreaterThanOrEqual(before);
    expect(next.runStartedAt).toBeLessThanOrEqual(Date.now());
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
});

import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import type { AgentProvider, RunContext } from "../agui/core";
import { withCcrReady } from "./provider-ready";

function runContext(): RunContext {
  return {
    threadId: "thread",
    runId: "run",
    userMessage: { role: "user", content: "hi" },
    abortSignal: new AbortController().signal,
    cwd: "/tmp",
  };
}

describe("withCcrReady", () => {
  it("awaits CCR readiness before starting the SDK provider run", async () => {
    const order: string[] = [];
    const inner: AgentProvider = {
      name: "inner",
      run: async function* () {
        order.push("run");
        yield { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" };
      },
      resume: async function* () {
        yield { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" };
      },
      getPendingInterrupts: async () => [],
    };

    const provider = withCcrReady(inner, async () => {
      order.push("ready:start");
      await Bun.sleep(1);
      order.push("ready:end");
    });

    for await (const _ of provider.run(runContext())) {
      // consume stream
    }

    expect(order).toEqual(["ready:start", "ready:end", "run"]);
  });

  it("surfaces readiness failures as a run error instead of entering SDK retries", async () => {
    let runCalled = false;
    const inner: AgentProvider = {
      name: "inner",
      run: async function* () {
        runCalled = true;
        yield { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" };
      },
      resume: async function* () {
        runCalled = true;
        yield { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" };
      },
      getPendingInterrupts: async () => [],
    };

    const provider = withCcrReady(inner, async () => {
      throw new Error("ccr_not_ready");
    });

    const events = [];
    for await (const event of provider.run(runContext())) {
      events.push(event);
    }

    expect(runCalled).toBe(false);
    expect(events).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: "thread",
        runId: "run",
      },
      {
        type: EventType.RUN_ERROR,
        code: "MODEL_ERROR",
        message: "ccr_not_ready",
      },
    ]);
  });
});

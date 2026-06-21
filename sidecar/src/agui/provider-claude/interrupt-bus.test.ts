import { describe, expect, it } from "bun:test";
import { EventType } from "@ag-ui/core";
import { createInterruptBus } from "./interrupt-bus";
import type { RunEventStore } from "../core/store-types";
import type { AGUIEvent } from "../core/types";

function makeStubStore() {
  const appended: { runId: string; event: AGUIEvent }[] = [];
  const finished: { runId: string; status: string }[] = [];
  const store = {
    async createRun() {},
    async appendEvent(runId: string, event: AGUIEvent) {
      appended.push({ runId, event });
      return { cursor: String(appended.length), event };
    },
    async finishRun(runId: string, status: string) {
      finished.push({ runId, status });
    },
    async getRun() { return null; },
    streamFrom() { return (async function*() {})(); },
    async listThreadStatuses() { return []; },
    reconcileOrphans() { return 0; },
  } as unknown as RunEventStore;
  return { store, appended, finished };
}

describe("interrupt-bus", () => {
  it("requestApproval writes interrupt event + flips status + returns pending Promise", async () => {
    const { store, appended, finished } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_1",
      toolName: "Bash",
      input: { command: "ls" },
    });

    // Flush microtasks so the async requestApproval body reaches its
    // two store awaits and returns the pending promise. The store stub's
    // async functions resolve synchronously inside, so two yields suffice.
    await Promise.resolve();
    await Promise.resolve();

    expect(appended).toHaveLength(1);
    const ev = appended[0]!.event as Record<string, unknown>;
    expect(ev.type).toBe(EventType.RUN_FINISHED);
    expect(ev.runId).toBe("run_1");
    expect(ev.outcome).toBe("interrupt");
    expect((ev.interrupts as Array<{ id: string; reason: string }>)[0]?.id).toBe("tu_1");
    expect((ev.interrupts as Array<{ reason: string }>)[0]?.reason).toBe("tool_approval");

    expect(finished).toEqual([{ runId: "run_1", status: "awaiting_user" }]);

    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("resolve(allow) settles the matching deferred", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_a",
      toolName: "Bash",
      input: {},
    });

    const ok = bus.resolve("run_1", "tu_a", { behavior: "allow" });
    expect(ok).toBe(true);

    const result = await pending;
    expect(result).toEqual({ behavior: "allow" });
  });

  it("resolve(deny) settles with deny + message", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_1",
      threadId: "thread_1",
      toolUseID: "tu_b",
      toolName: "Bash",
      input: {},
    });

    bus.resolve("run_1", "tu_b", { behavior: "deny", message: "nope" });

    const result = await pending;
    expect(result).toEqual({ behavior: "deny", message: "nope" });
  });

  it("resolve returns false for unknown interruptId", () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });
    expect(bus.resolve("run_x", "tu_missing", { behavior: "allow" })).toBe(false);
  });

  it("cancelAll(runId) rejects all pending deferreds for that run as deny", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const p1 = bus.requestApproval({
      runId: "run_1", threadId: "t", toolUseID: "tu_1",
      toolName: "Bash", input: {},
    });
    const p2 = bus.requestApproval({
      runId: "run_1", threadId: "t", toolUseID: "tu_2",
      toolName: "Bash", input: {},
    });

    bus.cancelAll("run_1");

    const r1 = await p1;
    const r2 = await p2;
    expect(r1.behavior).toBe("deny");
    expect(r2.behavior).toBe("deny");
  });

  it("requestApproval surfaces store.appendEvent rejection to the caller", async () => {
    const store = {
      async createRun() {},
      async appendEvent() { throw new Error("disk full"); },
      async finishRun() {},
      async getRun() { return null; },
      streamFrom() { return (async function*() {})(); },
      async listThreadStatuses() { return []; },
      reconcileOrphans() { return 0; },
    } as unknown as RunEventStore;
    const bus = createInterruptBus({ store });

    await expect(
      bus.requestApproval({
        runId: "run_e",
        threadId: "t",
        toolUseID: "tu_e",
        toolName: "Bash",
        input: {},
      }),
    ).rejects.toThrow("disk full");
  });

  it("duplicate requestApproval for same runId:toolUseID throws", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    void bus.requestApproval({
      runId: "run_d",
      threadId: "t",
      toolUseID: "tu_d",
      toolName: "Bash",
      input: {},
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(() =>
      bus.requestApproval({
        runId: "run_d",
        threadId: "t",
        toolUseID: "tu_d",
        toolName: "Bash",
        input: {},
      }),
    ).toThrow(/duplicate/);
  });

  it("resolve is idempotent — second call returns false without re-firing", async () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });

    const pending = bus.requestApproval({
      runId: "run_i",
      threadId: "t",
      toolUseID: "tu_i",
      toolName: "Bash",
      input: {},
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(bus.resolve("run_i", "tu_i", { behavior: "allow" })).toBe(true);
    expect(bus.resolve("run_i", "tu_i", { behavior: "allow" })).toBe(false);

    const result = await pending;
    expect(result).toEqual({ behavior: "allow" });
  });

  it("cancelAll on empty bus is a no-op", () => {
    const { store } = makeStubStore();
    const bus = createInterruptBus({ store });
    expect(() => bus.cancelAll("run_none")).not.toThrow();
  });
});

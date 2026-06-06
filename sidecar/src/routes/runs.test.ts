// Guards the POST /resume idempotency contract: bus.resolve returning false
// (deferred missing — already decided, restarted, or canceled) must NOT
// surface as 409 to the client. The client's autoAllow effect and the
// reactive replay paths can race, and any of them seeing a hard error
// renders "错误: ... 409" in the chat. Treating it as a benign no-op (202 +
// alreadyResolved: true) keeps the UX clean while preserving the
// observability for callers who care.

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { EventType } from "@ag-ui/core";
import { buildRunRoutes } from "./runs";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";

function makeApp(opts: {
  resolveReturns: boolean;
  onAbort?: () => void;
}) {
  const bus: InterruptBus = {
    requestApproval: async () => ({ behavior: "allow" }) as never,
    requestAskUser: async () => ({ answers: {} }),
    resolve: () => opts.resolveReturns,
    resolveAskUser: () => opts.resolveReturns,
    cancelAll: () => {},
  };
  // Minimal stubs for unused deps in the /resume path. Cast to never to
  // avoid sprouting unrelated infrastructure in this targeted test.
  const stub = () => undefined as never;
  // The allow / ask-user resume path flips the run back to running on a
  // successful resolve, so the store needs a markRunning spy.
  const markRunning = mock(async () => {});
  const app = new Hono();
  app.route(
    "/",
    buildRunRoutes({
      threads: stub() as never,
      messages: stub() as never,
      agentFolders: stub() as never,
      agentLinks: stub() as never,
      agentMemoryStore: stub() as never,
      provider: stub() as never,
      store: { markRunning } as never,
      interruptBus: bus,
      usage: stub() as never,
    }),
  );
  return { app, markRunning };
}

const allowBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "allow" }] } }],
});

const denyBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "deny" }] } }],
});

describe("POST /runs/:runId/resume — idempotent semantics", () => {
  it("returns 202 alreadyResolved=false on first successful resolve", async () => {
    const { app } = makeApp({ resolveReturns: true });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: allowBody,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; alreadyResolved: boolean };
    expect(body).toEqual({ ok: true, alreadyResolved: false });
  });

  it("returns 202 alreadyResolved=true when deferred is gone (no 409)", async () => {
    const { app } = makeApp({ resolveReturns: false });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: allowBody,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; alreadyResolved: boolean };
    expect(body).toEqual({ ok: true, alreadyResolved: true });
  });

  it("still 202 on a stale deny — does NOT double-abort the run", async () => {
    // Without an aborter in the route's in-memory map (no POST /runs in this
    // test), abort would be a no-op anyway. The contract we're asserting:
    // even deny gets the idempotent 202 treatment so the UI doesn't choke.
    const { app } = makeApp({ resolveReturns: false });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: denyBody,
    });
    expect(res.status).toBe(202);
  });

  it("flips the run back to running on a successful allow resume", async () => {
    // Regression: after resolving an interrupt the agent keeps working, so the
    // run must leave awaiting_approval — otherwise the sidebar shows "awaiting
    // approval" (ShieldAlert) for work in progress.
    const { app, markRunning } = makeApp({ resolveReturns: true });
    await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: allowBody,
    });
    expect(markRunning).toHaveBeenCalledTimes(1);
    expect(markRunning).toHaveBeenCalledWith("r1");
  });

  it("does NOT flip to running on a stale resume (deferred gone) or a deny", async () => {
    const stale = makeApp({ resolveReturns: false });
    await stale.app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: allowBody,
    });
    expect(stale.markRunning).not.toHaveBeenCalled();

    const deny = makeApp({ resolveReturns: true });
    await deny.app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: denyBody,
    });
    expect(deny.markRunning).not.toHaveBeenCalled();
  });
});

describe("POST /runs — one-run-per-thread guard", () => {
  // Only getThreadActiveRun is reached in the reject path (the guard sits
  // before threads/messages), so the other deps can stay as never-stubs.
  function makeApp(active: { runId: string; status: string } | null) {
    const stub = () => undefined as never;
    const store = { getThreadActiveRun: async () => active } as never;
    const app = new Hono();
    app.route(
      "/",
      buildRunRoutes({
        threads: stub() as never,
        messages: stub() as never,
        agentFolders: stub() as never,
        agentLinks: stub() as never,
        agentMemoryStore: stub() as never,
        provider: stub() as never,
        store,
        interruptBus: stub() as never,
        usage: stub() as never,
      }),
    );
    return app;
  }

  const runBody = JSON.stringify({
    threadId: "t1",
    runId: "r2",
    message: { role: "user", content: "hi" },
  });

  it("returns 409 run_in_progress when the thread already has a live run", async () => {
    const app = makeApp({ runId: "r1", status: "running" });
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: runBody,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      activeRunId: string;
      status: string;
    };
    expect(body).toEqual({
      error: "run_in_progress",
      activeRunId: "r1",
      status: "running",
    });
  });
});

describe("POST /runs — provider selection", () => {
  it("passes providerSelection to the run provider resolver", async () => {
    const seenSelections: unknown[] = [];
    const provider = {
      name: "fake",
      run() {
        return (async function* () {
          yield { type: EventType.RUN_STARTED, runId: "r1", threadId: "t1" } as never;
          yield { type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1" } as never;
        })();
      },
      resume: async function* () {},
      getPendingInterrupts: async () => [],
    };
    const stub = () => undefined as never;
    const app = new Hono();
    app.route(
      "/",
      buildRunRoutes({
        threads: {
          upsert: () => ({ id: "t1" }),
          get: () => ({ id: "t1", workingDir: "/tmp", agentWorkspaceId: null }),
          touch: () => {},
        } as never,
        messages: {
          countByThread: () => 0,
          appendUser: () => ({ id: "msg_1" }),
          appendAssistant: () => {},
          upsertToolCall: () => {},
          completeToolCall: () => {},
          cancelPendingToolCallsForThread: () => {},
          setSdkUuid: () => {},
        } as never,
        agentFolders: stub() as never,
        agentLinks: stub() as never,
        agentMemoryStore: stub() as never,
        provider: provider as never,
        resolveProvider: (selection) => {
          seenSelections.push(selection);
          return provider as never;
        },
        store: {
          getThreadActiveRun: async () => null,
          createRun: async () => {},
          appendEvent: async () => ({ cursor: "1" }),
          finishRun: async () => {},
        } as never,
        interruptBus: { cancelAll: () => {} } as never,
        usage: { recordRun: () => {} } as never,
      }),
    );

    const res = await app.request("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        runId: "r1",
        message: { role: "user", content: "hi" },
        providerSelection: { providerId: "provider-openai", modelId: "gpt-5.1" },
      }),
    });

    expect(res.status).toBe(202);
    expect(seenSelections).toEqual([
      { providerId: "provider-openai", modelId: "gpt-5.1" },
    ]);
  });
});

describe("POST /runs — internal-only remote fields", () => {
  it("does not forward appendContextExtra or onTerminalResult from public body", async () => {
    const seenAppendContext: Array<string | undefined> = [];
    const provider = {
      name: "fake",
      run(ctx: { appendContext?: string }) {
        seenAppendContext.push(ctx.appendContext);
        return (async function* () {
          yield { type: EventType.RUN_STARTED, runId: "r1", threadId: "t1" } as never;
          yield { type: EventType.RUN_FINISHED, runId: "r1", threadId: "t1" } as never;
        })();
      },
      resume: async function* () {},
      getPendingInterrupts: async () => [],
    };
    const stub = () => undefined as never;
    const app = new Hono();
    app.route(
      "/",
      buildRunRoutes({
        threads: {
          upsert: () => ({ id: "t1" }),
          get: () => ({ id: "t1", workingDir: "/tmp", agentWorkspaceId: null }),
          touch: () => {},
        } as never,
        messages: {
          countByThread: () => 0,
          appendUser: () => ({ id: "msg_1" }),
          appendAssistant: () => {},
          upsertToolCall: () => {},
          completeToolCall: () => {},
          cancelPendingToolCallsForThread: () => {},
          setSdkUuid: () => {},
        } as never,
        agentFolders: stub() as never,
        agentLinks: stub() as never,
        agentMemoryStore: stub() as never,
        provider: provider as never,
        store: {
          getThreadActiveRun: async () => null,
          createRun: async () => {},
          appendEvent: async () => ({ cursor: "1" }),
          finishRun: async () => {},
        } as never,
        interruptBus: { cancelAll: () => {} } as never,
        usage: { recordRun: () => {} } as never,
      }),
    );

    const res = await app.request("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        runId: "r1",
        message: { role: "user", content: "hi" },
        appendContextExtra: "should not pass",
        onTerminalResult: "should not pass",
      }),
    });

    expect(res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seenAppendContext).toEqual([undefined]);
  });
});

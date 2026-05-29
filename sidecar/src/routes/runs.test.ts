// Guards the POST /resume idempotency contract: bus.resolve returning false
// (deferred missing — already decided, restarted, or canceled) must NOT
// surface as 409 to the client. The client's autoAllow effect and the
// reactive replay paths can race, and any of them seeing a hard error
// renders "错误: ... 409" in the chat. Treating it as a benign no-op (202 +
// alreadyResolved: true) keeps the UX clean while preserving the
// observability for callers who care.

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
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
  const app = new Hono();
  app.route(
    "/",
    buildRunRoutes({
      threads: stub() as never,
      messages: stub() as never,
      provider: stub() as never,
      store: stub() as never,
      interruptBus: bus,
      usage: stub() as never,
    }),
  );
  return app;
}

const allowBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "allow" }] } }],
});

const denyBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "deny" }] } }],
});

describe("POST /runs/:runId/resume — idempotent semantics", () => {
  it("returns 202 alreadyResolved=false on first successful resolve", async () => {
    const app = makeApp({ resolveReturns: true });
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
    const app = makeApp({ resolveReturns: false });
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
    const app = makeApp({ resolveReturns: false });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: denyBody,
    });
    expect(res.status).toBe(202);
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

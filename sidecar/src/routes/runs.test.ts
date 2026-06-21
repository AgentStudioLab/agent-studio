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
import type { RunSnapshot } from "../agui/core";

function makeApp(opts: {
  resolveReturns: boolean;
  onAbort?: () => void;
  pendingInterrupts?: RunSnapshot["pendingInterrupts"];
}) {
  const bus: InterruptBus = {
    requestApproval: async () => ({ behavior: "allow" }) as never,
    requestAskUser: async () => ({ answers: {} }),
    resolve: () => opts.resolveReturns,
    resolveAskUser: () => opts.resolveReturns,
    cancelAll: () => {},
    seedRules: () => {},
    addRule: () => {},
    getRules: () => new Set<string>(),
  };
  // Minimal stubs for unused deps in the /resume path. Cast to never to
  // avoid sprouting unrelated infrastructure in this targeted test.
  const stub = () => undefined as never;
  // The allow / ask-user resume path flips the run back to running on a
  // successful resolve, so the store needs a markRunning spy.
  const markRunning = mock(async () => {});
  const getRun = mock(async (runId: string) => ({
    runId,
    threadId: "t1",
    status: "awaiting_user" as const,
    lastCursor: "0",
    pendingInterrupts: opts.pendingInterrupts,
  }));
  // 「始终允许」沉淀规则走 bus.addRule —— spy 验证它被正确调用。
  const addRule = mock((_runId: string, _rule: string) => {});
  bus.addRule = addRule;
  const app = new Hono();
  app.route(
    "/",
    buildRunRoutes({
      threads: stub() as never,
      messages: stub() as never,
      agentWorkspaces: stub() as never,
      agentFolders: stub() as never,
      agentLinks: stub() as never,
      agentMemoryStore: stub() as never,
      provider: stub() as never,
      store: { markRunning, getRun } as never,
      interruptBus: bus,
      usage: stub() as never,
    }),
  );
  return { app, markRunning, addRule };
}

const allowBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "allow" }] } }],
});

const denyBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "deny" }] } }],
});

const askUserAnswersBody = JSON.stringify({
  resumes: [{ interruptId: "tu_1", payload: { decisions: [{ type: "ask_user_answers" }] } }],
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

  it("returns 409 when ask_user_answers targets a pending tool approval interrupt", async () => {
    const { app } = makeApp({
      resolveReturns: false,
      pendingInterrupts: [{ id: "tu_1", reason: "tool_approval", payload: {} }],
    });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: askUserAnswersBody,
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      expected: string;
      received: string;
    };
    expect(body).toEqual({
      error: "interrupt_type_mismatch",
      expected: "tool_approval",
      received: "ask_user",
    });
  });

  it("returns 409 when allow targets a pending ask-user interrupt", async () => {
    const { app } = makeApp({
      resolveReturns: false,
      pendingInterrupts: [{ id: "ask_1", reason: "ask_user", payload: {} }],
    });
    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumes: [
          { interruptId: "ask_1", payload: { decisions: [{ type: "allow" }] } },
        ],
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      expected: string;
      received: string;
    };
    expect(body).toEqual({
      error: "interrupt_type_mismatch",
      expected: "ask_user",
      received: "tool_approval",
    });
  });

  it("flips the run back to running on a successful allow resume", async () => {
    // 回归覆盖：中断被允许后 agent 会继续执行，run 必须离开等待用户状态。
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

  it("persists a rule via bus.addRule when allow carries persistRule", async () => {
    const { app, addRule } = makeApp({ resolveReturns: true });
    await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumes: [
          {
            interruptId: "tu_1",
            payload: { decisions: [{ type: "allow", persistRule: "Bash(git status:*)" }] },
          },
        ],
      }),
    });
    expect(addRule).toHaveBeenCalledTimes(1);
    expect(addRule).toHaveBeenCalledWith("r1", "Bash(git status:*)");
  });

  it("does NOT call addRule for a plain allow or a deny", async () => {
    const allow = makeApp({ resolveReturns: true });
    await allow.app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: allowBody,
    });
    expect(allow.addRule).not.toHaveBeenCalled();

    const deny = makeApp({ resolveReturns: true });
    await deny.app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumes: [
          {
            interruptId: "tu_1",
            // persistRule on a deny must be ignored.
            payload: { decisions: [{ type: "deny", persistRule: "Bash(x)" }] },
          },
        ],
      }),
    });
    expect(deny.addRule).not.toHaveBeenCalled();
  });

  it("maps ask_user_answers decisions to the SDK answers record", async () => {
    const seen: unknown[] = [];
    const bus: InterruptBus = {
      requestApproval: async () => ({ behavior: "allow" }),
      requestAskUser: async () => ({ answers: {} }),
      resolve: () => false,
      resolveAskUser: (_runId, _interruptId, result) => {
        seen.push(result);
        return true;
      },
      cancelAll: () => {},
      seedRules: () => {},
      addRule: () => {},
      getRules: () => new Set<string>(),
    };
    const markRunning = mock(async () => {});
    const stub = () => undefined as never;
    const app = new Hono();
    app.route(
      "/",
      buildRunRoutes({
        threads: stub() as never,
        messages: stub() as never,
        agentWorkspaces: stub() as never,
        agentFolders: stub() as never,
        agentLinks: stub() as never,
        agentMemoryStore: stub() as never,
        provider: stub() as never,
        store: { markRunning } as never,
        interruptBus: bus,
        usage: stub() as never,
      }),
    );

    const res = await app.request("/runs/r1/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumes: [
          {
            interruptId: "ask_1",
            payload: {
              decisions: [
                {
                  type: "ask_user_answers",
                  answers: [
                    { question: "single?", selected: ["A"] },
                    { question: "multi?", selected: ["A", "B"] },
                    { question: "custom?", custom: "free text" },
                    { question: "skip?", skipped: true },
                  ],
                },
              ],
            },
          },
        ],
      }),
    });

    expect(res.status).toBe(202);
    expect(seen).toEqual([
      {
        answers: {
          "single?": "A",
          "multi?": "A,B",
          "custom?": "free text",
          "skip?": "",
        },
      },
    ]);
    expect(markRunning).toHaveBeenCalledWith("r1");
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
        agentWorkspaces: stub() as never,
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

  it("returns 409 run_in_progress when the thread is awaiting_user", async () => {
    const app = makeApp({ runId: "r1", status: "awaiting_user" });
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: runBody,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      activeRunId: string;
    };
    expect(body.error).toBe("run_in_progress");
    expect(body.activeRunId).toBe("r1");
  });
});

describe("POST /runs — provider selection", () => {
  it("passes providerSelection to the run provider resolver", async () => {
    const seenSelections: unknown[] = [];
    const seenModels: unknown[] = [];
    const provider = {
      name: "fake",
      run(ctx: { model?: string }) {
        seenModels.push(ctx.model);
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
        agentWorkspaces: stub() as never,
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
        providerSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
      }),
    });

    expect(res.status).toBe(202);
    expect(seenSelections).toEqual([
      { providerId: "conn-openai", modelId: "gpt-5.1" },
    ]);
    expect(seenModels).toEqual([undefined]);
  });

  it("forwards official auth fields and selected model to the resolved run provider", async () => {
    const seenOfficialFields: unknown[] = [];
    const provider = {
      name: "fake",
      run(ctx: {
        model?: string;
        officialAuthToken?: string;
        officialWebsiteOrigin?: string;
      }) {
        seenOfficialFields.push({
          model: ctx.model,
          officialAuthToken: ctx.officialAuthToken,
          officialWebsiteOrigin: ctx.officialWebsiteOrigin,
        });
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
        agentWorkspaces: stub() as never,
        agentFolders: stub() as never,
        agentLinks: stub() as never,
        agentMemoryStore: stub() as never,
        provider: provider as never,
        resolveProvider: () => provider as never,
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
        providerSelection: { providerId: "official", modelId: "gpt-5-mini" },
        officialAuthToken: "access-token",
        officialWebsiteOrigin: "https://www.agentstudio.chat",
      }),
    });

    expect(res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seenOfficialFields).toEqual([
      {
        model: "gpt-5-mini",
        officialAuthToken: "access-token",
        officialWebsiteOrigin: "https://www.agentstudio.chat",
      },
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
        agentWorkspaces: stub() as never,
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

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runWorker } from "../agent/runWorker";
import type { RunEventStore, AgentProvider } from "../agui/core";
import type { ThreadService } from "../services/threads";
import type { MessageService } from "../services/messages";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";

export interface MountRunsDeps {
  threads: ThreadService;
  messages: MessageService;
  provider: AgentProvider;
  store: RunEventStore;
  interruptBus: InterruptBus;
}

/**
 * Run lifecycle + SSE event stream. Wire events are AG-UI-shaped
 * (RUN_STARTED / TEXT_MESSAGE_* / RUN_FINISHED ...); the URL surface is
 * project-native (no `/ag-ui/` prefix).
 *
 *   POST   /runs                        Start a run; returns 202 + { runId }
 *   GET    /runs/:runId/events?after=N  SSE stream; replay history + tail bus
 *   GET    /runs/:runId                 Snapshot { runId, status, lastCursor }
 *   DELETE /runs/:runId                 Cancel an in-flight run
 *
 * Active-run discovery is intentionally NOT a separate endpoint — the sidebar
 * already polls /conversations/status (lastRunId + status per thread). The
 * client derives "this thread has a running run" from that single source.
 */
export function buildRunRoutes(deps: MountRunsDeps): Hono {
  const app = new Hono();
  const aborters = new Map<string, AbortController>();

  app.post("/runs", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { threadId?: string; runId?: string; message?: { role?: string; content?: string } }
      | null;
    if (
      !body?.threadId ||
      !body?.runId ||
      body.message?.role !== "user" ||
      typeof body.message.content !== "string"
    ) {
      return c.json({ error: "invalid_body" }, 400);
    }

    deps.threads.upsert(body.threadId);
    deps.messages.appendUser(body.threadId, body.message.content);
    await deps.store.createRun(body.runId, body.threadId);

    const abort = new AbortController();
    aborters.set(body.runId, abort);

    // Fire and forget — worker drives the SDK + appends events to the store.
    // Errors land in the store as RUN_ERROR via runWorker's catch block.
    void runWorker({
      runId: body.runId,
      threadId: body.threadId,
      userMessage: { role: "user", content: body.message.content },
      store: deps.store,
      messages: deps.messages,
      threads: deps.threads,
      provider: deps.provider,
      abortSignal: abort.signal,
    }).finally(() => aborters.delete(body.runId!));

    return c.json({ runId: body.runId }, 202);
  });

  app.get("/runs/:runId/events", (c) => {
    const runId = c.req.param("runId");
    const after = c.req.query("after");

    return streamSSE(c, async (sse) => {
      const ctrl = new AbortController();
      c.req.raw.signal.addEventListener("abort", () => ctrl.abort());

      const snap = await deps.store.getRun(runId);
      if (!snap) {
        await sse.writeSSE({
          event: "RUN_ERROR",
          data: JSON.stringify({ type: "RUN_ERROR", message: "run not found" }),
        });
        return;
      }

      try {
        for await (const env of deps.store.streamFrom(runId, after, ctrl.signal)) {
          await sse.writeSSE({
            id: env.cursor,
            event: env.event.type,
            data: JSON.stringify(env.event),
          });
        }
      } catch (err) {
        console.error("[runs/events]", err);
      }
    });
  });

  app.get("/runs/:runId", async (c) => {
    const snap = await deps.store.getRun(c.req.param("runId"));
    if (!snap) return c.json({ error: "run not found" }, 404);
    return c.json(snap);
  });

  app.delete("/runs/:runId", (c) => {
    const runId = c.req.param("runId");
    const ctrl = aborters.get(runId);
    if (ctrl) {
      ctrl.abort();
      return c.json({ ok: true });
    }
    return c.json({ ok: false, reason: "not_running" }, 409);
  });

  app.post("/runs/:runId/resume", async (c) => {
    const runId = c.req.param("runId");
    const body = (await c.req.json().catch(() => null)) as
      | {
          resumes?: Array<{
            interruptId?: string;
            payload?: {
              decisions?: Array<
                | { type?: "allow" }
                | { type?: "deny"; message?: string }
              >;
            };
          }>;
        }
      | null;

    const first = body?.resumes?.[0];
    if (!first?.interruptId || !first.payload) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const decision = first.payload.decisions?.[0];
    if (!decision) return c.json({ error: "missing_decision" }, 400);

    const result =
      decision.type === "deny"
        ? {
            behavior: "deny" as const,
            message: decision.message ?? "User declined",
          }
        : { behavior: "allow" as const };

    const ok = deps.interruptBus.resolve(runId, first.interruptId, result);
    if (!ok) return c.json({ error: "interrupt_not_pending" }, 409);

    return c.json({ ok: true });
  });

  return app;
}

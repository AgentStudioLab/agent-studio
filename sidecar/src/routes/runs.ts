import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runWorker } from "../agent/runWorker";
import type { RunEventStore, AgentProvider } from "../agui/core";
import type { ThreadService } from "../services/threads";
import type { MessageService } from "../services/messages";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";
import type { UsageService } from "../services/usage";

export interface MountRunsDeps {
  threads: ThreadService;
  messages: MessageService;
  provider: AgentProvider;
  store: RunEventStore;
  interruptBus: InterruptBus;
  usage: UsageService;
  /**
   * Called once, on a thread's first user message, so the host can replace the
   * "New task" placeholder with a summarized title. Fire-and-forget — the host
   * must not block the run on it. Scheduled runs bypass this route entirely.
   */
  onFirstUserMessage?: (input: {
    threadId: string;
    prompt: string;
    model?: string;
  }) => void;
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
      | {
          threadId?: string;
          runId?: string;
          message?: { role?: string; content?: string };
          permissionMode?: "ask" | "act-without-asking";
          model?: string;
        }
      | null;
    if (
      !body?.threadId ||
      !body?.runId ||
      body.message?.role !== "user" ||
      typeof body.message.content !== "string"
    ) {
      return c.json({ error: "invalid_body" }, 400);
    }
    // Unknown / missing permissionMode → default to "ask" (the safe choice).
    const permissionMode: "ask" | "act-without-asking" =
      body.permissionMode === "act-without-asking" ? "act-without-asking" : "ask";
    // model: light validation only — SDK echoes a clear error if the id is
    // unknown. Empty string or non-string → undefined (provider falls back to
    // ANTHROPIC_MODEL env).
    const model =
      typeof body.model === "string" && body.model.length > 0
        ? body.model
        : undefined;

    // Capture first-turn BEFORE appending — an empty thread means this is the
    // message that should drive the auto-title.
    const isFirstTurn = deps.messages.countByThread(body.threadId) === 0;

    deps.threads.upsert(body.threadId);
    deps.messages.appendUser(body.threadId, body.message.content);
    await deps.store.createRun(body.runId, body.threadId);

    if (isFirstTurn) {
      deps.onFirstUserMessage?.({
        threadId: body.threadId,
        prompt: body.message.content,
        model,
      });
    }

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
      interruptBus: deps.interruptBus,
      abortSignal: abort.signal,
      usage: deps.usage,
      permissionMode,
      model,
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
                | {
                    type?: "ask_user_answers";
                    answers?: Array<{
                      question?: string;
                      selected?: string[];
                      custom?: string;
                      skipped?: boolean;
                    }>;
                  }
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

    // Branch on decision type. ask_user_answers goes through a dedicated bus
    // method because the deferred resolver type differs (AskUserAnswers vs
    // PermissionResult). Routing through .resolve() would shape-mismatch and
    // throw client-side.
    if (decision.type === "ask_user_answers") {
      const answers: Record<string, string> = {};
      for (const entry of decision.answers ?? []) {
        if (!entry || typeof entry.question !== "string") continue;
        if (entry.skipped) {
          // Empty string keeps the key in the map → agent sees "answered
          // with nothing" rather than "no question asked". Matches SDK's
          // `AskUserQuestionInput.answers` being a flat string map.
          answers[entry.question] = "";
        } else if (typeof entry.custom === "string") {
          answers[entry.question] = entry.custom;
        } else if (Array.isArray(entry.selected)) {
          // Multi-select labels join with comma per SDK output schema:
          // "answer string; multi-select answers are comma-separated".
          answers[entry.question] = entry.selected.join(",");
        } else {
          answers[entry.question] = "";
        }
      }
      const ok = deps.interruptBus.resolveAskUser(
        runId,
        first.interruptId,
        { answers },
      );
      return c.json({ ok: true, alreadyResolved: !ok }, 202);
    }

    const result =
      decision.type === "deny"
        ? {
            behavior: "deny" as const,
            message: decision.message ?? "User declined",
          }
        : { behavior: "allow" as const };

    const ok = deps.interruptBus.resolve(runId, first.interruptId, result);
    // Treat "deferred not found" as IDEMPOTENT SUCCESS, not 409. The bus's
    // in-memory map is the only source-of-truth for "is this HITL still
    // open"; once a decision lands, the entry is gone. Returning 409 would
    // surface as a scary "错误: ... 409" banner whenever:
    //   - the client re-tries / replays the same resume after sidecar restart
    //   - the autoAllow effect races (legacy interrupt id reused across runs)
    //   - cancelAll already rejected the deferred (run terminated server-side)
    // None of these are user-actionable errors — the HITL is already decided.
    // We still need to abort the run for deny, but only on the FIRST resolve
    // (otherwise we'd abort a run that has already moved past this point).
    if (decision.type === "deny" && ok) {
      aborters.get(runId)?.abort();
    }

    return c.json({ ok: true, alreadyResolved: !ok }, 202);
  });

  return app;
}

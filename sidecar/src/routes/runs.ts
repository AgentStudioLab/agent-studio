import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { EventType } from "@ag-ui/core";
import { runWorker } from "../agent/runWorker";
import type { RunEventStore, AgentProvider } from "../agui/core";
import type { ThreadService } from "../services/threads";
import type { MessageService } from "../services/messages";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
import type { AgentFolderService } from "../services/agentFolders";
import type { AgentLinkService } from "../services/agentLinks";
import type { AgentMemoryStore } from "../services/agentMemoryStore";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";
import type { UsageService } from "../services/usage";
import type { ProviderModelSelection } from "../services/providerSettings";

export interface MountRunsDeps {
  threads: ThreadService;
  messages: MessageService;
  agentWorkspaces: AgentWorkspaceService;
  agentFolders: AgentFolderService;
  agentLinks: AgentLinkService;
  agentMemoryStore: AgentMemoryStore;
  provider: AgentProvider;
  resolveProvider?: (selection?: ProviderModelSelection | null) => AgentProvider;
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

function parseProviderSelection(value: unknown): ProviderModelSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.providerId !== "string" || typeof raw.modelId !== "string") {
    return undefined;
  }
  if (raw.providerId.length === 0 || raw.modelId.length === 0) return undefined;
  return { providerId: raw.providerId, modelId: raw.modelId };
}

/** 防御式解析 string[]：非数组 → undefined；过滤掉非字符串项。 */
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((x): x is string => typeof x === "string");
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
          providerSelection?: unknown;
          officialAuthToken?: unknown;
          officialWebsiteOrigin?: unknown;
          locale?: string;
          approvalRules?: unknown;
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
    // UI locale → language directive in systemPrompt.append. Non-string → undefined.
    const locale = typeof body.locale === "string" ? body.locale : undefined;
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
    const providerSelection = parseProviderSelection(body.providerSelection);
    const officialAuthToken =
      typeof body.officialAuthToken === "string" && body.officialAuthToken.length > 0
        ? body.officialAuthToken
        : undefined;
    const officialWebsiteOrigin =
      typeof body.officialWebsiteOrigin === "string" &&
      body.officialWebsiteOrigin.length > 0
        ? body.officialWebsiteOrigin
        : undefined;
    // 「始终允许」命令规则（CC 语法）。前端传 cwd + 全局 allowlist 的并集。
    const approvalRules = parseStringArray(body.approvalRules);

    // Refuse to start a second run on a thread that already has one in flight
    // (a scheduled run, or a send from another window). Two runs resuming the
    // same SDK session concurrently corrupt the transcript. The frontend gates
    // this in the composer (busy → queue), so this 409 only fires on races /
    // multi-window — the client re-queues the message rather than erroring.
    const active = await deps.store.getThreadActiveRun(body.threadId);
    if (active) {
      return c.json(
        { error: "run_in_progress", activeRunId: active.runId, status: active.status },
        409,
      );
    }

    // Capture first-turn BEFORE appending — an empty thread means this is the
    // message that should drive the auto-title.
    const isFirstTurn = deps.messages.countByThread(body.threadId) === 0;

    deps.threads.upsert(body.threadId);
    const userMsg = deps.messages.appendUser(body.threadId, body.message.content);
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
      agentWorkspaces: deps.agentWorkspaces,
      agentFolders: deps.agentFolders,
      agentLinks: deps.agentLinks,
      agentMemoryStore: deps.agentMemoryStore,
      provider: deps.provider,
      providerSelection,
      resolveProvider: deps.resolveProvider,
      officialAuthToken,
      officialWebsiteOrigin,
      interruptBus: deps.interruptBus,
      abortSignal: abort.signal,
      usage: deps.usage,
      permissionMode,
      model,
      locale,
      approvalRules,
      userMessageId: userMsg.id,
    }).finally(() => aborters.delete(body.runId!));

    return c.json({ runId: body.runId }, 202);
  });

  // Regenerate a turn: discard the target user message + everything after it,
  // roll back its Write/Edit/NotebookEdit file changes, and re-run the same
  // prompt. Resumes the SDK session at the preceding assistant message (or a
  // fresh session when regenerating the very first turn). Shares the runWorker
  // path with POST /runs.
  app.post("/threads/:threadId/regenerate", async (c) => {
    const threadId = c.req.param("threadId");
    const body = (await c.req.json().catch(() => null)) as
      | {
          fromMessageId?: string;
          runId?: string;
          permissionMode?: "ask" | "act-without-asking";
          model?: string;
          providerSelection?: unknown;
          officialAuthToken?: unknown;
          officialWebsiteOrigin?: unknown;
          locale?: string;
          approvalRules?: unknown;
        }
      | null;
    if (!body?.fromMessageId || !body?.runId) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const target = deps.messages.getById(body.fromMessageId);
    if (!target || target.thread_id !== threadId || target.role !== "user") {
      return c.json({ error: "invalid_target" }, 400);
    }
    const thread = deps.threads.get(threadId);
    if (!thread) return c.json({ error: "thread_not_found" }, 404);

    // Same concurrency guard as POST /runs — regenerate also starts a run and
    // would collide with an in-flight one on the same SDK session. Checked
    // BEFORE createRun + the truncate/rewind steps, so a rejected regenerate
    // leaves the thread's history untouched (server-side truncate runs later,
    // inside the async block below).
    const active = await deps.store.getThreadActiveRun(threadId);
    if (active) {
      return c.json(
        { error: "run_in_progress", activeRunId: active.runId, status: active.status },
        409,
      );
    }

    const permissionMode: "ask" | "act-without-asking" =
      body.permissionMode === "act-without-asking" ? "act-without-asking" : "ask";
    const model =
      typeof body.model === "string" && body.model.length > 0
        ? body.model
        : undefined;
    const providerSelection = parseProviderSelection(body.providerSelection);
    const officialAuthToken =
      typeof body.officialAuthToken === "string" && body.officialAuthToken.length > 0
        ? body.officialAuthToken
        : undefined;
    const officialWebsiteOrigin =
      typeof body.officialWebsiteOrigin === "string" &&
      body.officialWebsiteOrigin.length > 0
        ? body.officialWebsiteOrigin
        : undefined;
    const locale = typeof body.locale === "string" ? body.locale : undefined;
    const approvalRules = parseStringArray(body.approvalRules);

    const cwd = thread.workingDir;
    const userContent = target.content;
    const checkpointUuid = target.sdk_uuid;
    // resumeSessionAt anchor = last assistant before this user turn. undefined
    // when regenerating the first turn → fresh session.
    const resumeSessionAt = deps.messages.getPrecedingAssistantSdkUuid(
      threadId,
      target.created_at,
    );

    const runId = body.runId;
    // Create the run row up front so GET /runs/:id/events can attach while the
    // rewind/truncate steps run.
    await deps.store.createRun(runId, threadId);
    const abort = new AbortController();
    aborters.set(runId, abort);

    void (async () => {
      try {
        // 1. Roll back files (Write/Edit/NotebookEdit only) to the turn's
        //    checkpoint. Best-effort — never blocks the regenerate.
        if (!checkpointUuid) {
          console.warn(
            `[regenerate] no checkpoint uuid on msg ${body.fromMessageId} — skipping file rewind (Bash-made files are never tracked)`,
          );
        } else if (deps.provider.rewindFiles) {
          try {
            const r = await deps.provider.rewindFiles({
              threadId,
              cwd,
              checkpointUuid,
              signal: abort.signal,
            });
            if (r.canRewind) {
              console.log(
                `[regenerate] files rewound to ${checkpointUuid} (changed=${r.filesChanged ?? "?"}) thread=${threadId}`,
              );
            } else {
              console.warn(
                `[regenerate] file rewind skipped (${r.error ?? "?"}) thread=${threadId}`,
              );
            }
          } catch (err) {
            console.warn("[regenerate] file rewind error:", err);
          }
        }
        // 2. Discard the target turn + all subsequent turns (tool_calls cascade).
        deps.messages.deleteFromMessage(threadId, body.fromMessageId!);
        // 3. Re-append the same prompt + run it.
        const newUser = deps.messages.appendUser(threadId, userContent);
        await runWorker({
          runId,
          threadId,
          userMessage: { role: "user", content: userContent },
          store: deps.store,
          messages: deps.messages,
          threads: deps.threads,
          agentWorkspaces: deps.agentWorkspaces,
          agentFolders: deps.agentFolders,
          agentLinks: deps.agentLinks,
          agentMemoryStore: deps.agentMemoryStore,
          provider: deps.provider,
          providerSelection,
          resolveProvider: deps.resolveProvider,
          officialAuthToken,
          officialWebsiteOrigin,
          interruptBus: deps.interruptBus,
          abortSignal: abort.signal,
          usage: deps.usage,
          permissionMode,
          model,
          locale,
          approvalRules,
          userMessageId: newUser.id,
          resumeSessionAt,
          freshSession: resumeSessionAt == null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[regenerate] orchestration error:", msg);
        await deps.store
          .appendEvent(runId, {
            type: EventType.RUN_ERROR,
            message: msg,
            code: "WORKER_ERROR",
          } as never)
          .catch(() => {});
        await deps.store.finishRun(runId, "error", msg).catch(() => {});
      }
    })().finally(() => aborters.delete(runId));

    return c.json({ runId }, 202);
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
                | { type?: "allow"; persistRule?: string }
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
      // The agent resumes work now — flip the run back to running so the
      // sidebar stops showing "awaiting approval" while it's executing again.
      // Only on a real resolve (ok); a stale/no-op resume must not revive a
      // run that already terminated.
      if (ok) await deps.store.markRunning(runId);
      return c.json({ ok: true, alreadyResolved: !ok }, 202);
    }

    // 「始终允许此前缀/此命令/整个 Bash」：allow 决策可带一条要沉淀的规则，
    // 追加进本 run 的规则集，使后续同模式工具调用立即放行（不再发卡）。在 resolve
    // 之前追加 —— SDK 要等本次 promise resolve 才会发起下一个工具调用。
    if (decision.type === "allow") {
      const persistRule = decision.persistRule;
      if (typeof persistRule === "string" && persistRule.trim()) {
        deps.interruptBus.addRule(runId, persistRule.trim());
      }
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
    } else if (ok) {
      // Allow: the agent resumes work — flip the run back to running (see the
      // ask_user branch). Deny is excluded: it aborts to a terminal status.
      await deps.store.markRunning(runId);
    }

    return c.json({ ok: true, alreadyResolved: !ok }, 202);
  });

  return app;
}

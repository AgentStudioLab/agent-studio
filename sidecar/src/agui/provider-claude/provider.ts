// Claude Agent SDK adapter for AgentProvider.
//
// Multi-turn strategy: each turn's system.init carries a session_id.
// We tag it with threadId via SDK tagSession; the next turn's runTurn
// calls listSessions to recover the sessionId for resume. The SDK's
// JSONL store is the sole source of truth — sidecar restart preserves
// multi-turn context, unlike the previous in-memory Map.
//
// Per-turn abort: each turn spawns a fresh `query()` with its own
// AbortController. Cancelling a turn does NOT lose multi-turn context,
// because session_id is captured on the next successful turn's init.

import { query as sdkQuery, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { CanUseTool, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { claudeSdkToAgui } from "./bridge";
import { getResumeSessionId, tagThreadSession } from "./session-tag";
import { rewindSessionFiles } from "./file-rewind";
import { checkWorkspaceSandbox } from "./sandbox";
import { isDestructiveToolCall } from "./destructive";
import { createAuditHooks } from "./audit-hook";
import { BashSideEffectsTracker, createBashSideEffectsHooks } from "./bash-side-effects";
import {
  SkillInvocationStore,
  createSkillInvocationsHook,
} from "./skill-invocations";
import {
  buildScheduledTaskTool,
  SCHEDULED_MCP_SERVER,
  SCHEDULED_TOOL_FQN,
  type CreateScheduledTaskFn,
} from "./scheduled-tool";
import {
  buildRememberTool,
  REMEMBER_TOOL_FQN,
  type RememberFn,
} from "./remember-tool";
import type {
  AgentProvider,
  RunContext,
  ResumeContext,
} from "../core/provider-types";
import type { AGUIEvent } from "../core/types";
import type { AGUIInterrupt } from "../core/interrupts";
import type { InterruptBus } from "./interrupt-bus";
import type { AuditService } from "../../services/audit";

export interface ClaudeProviderOptions {
  /**
   * API key required by claude-agent-sdk. Forwarded through `options.env`
   * since the SDK spawns the Claude Code CLI and inherits env from there.
   */
  apiKey: string;
  /** Forwarded to the SDK CLI env. Useful for DeepSeek-compat endpoints. */
  baseUrl?: string;
  /** Forwarded to the SDK CLI env. */
  model?: string;
  /**
   * @deprecated Use `resolveAllowedTools` instead. Kept for backwards compatibility.
   * Tools the SDK is allowed to invoke. Each call hits `canUseTool` first.
   */
  allowedTools?: string[];
  /**
   * Called per-turn with threadId; returns the effective allowedTools for that thread.
   * If provided, takes precedence over the deprecated `allowedTools` field.
   */
  resolveAllowedTools?: (threadId: string) => string[];
  /**
   * HITL bus. When provided, the provider wires `canUseTool` to
   * `bus.requestApproval` so each tool invocation requires explicit user
   * approval through the existing /runs/:id/resume route.
   */
  interruptBus?: InterruptBus;
  /** Optional audit sink. When omitted, no hooks installed. */
  audit?: AuditService;
  /**
   * Called per-turn; returns the per-user prompt addition to feed into the
   * SDK's `systemPrompt.append`. Return `null` to skip (uses bare preset).
   * Read lazily so the latest profile state is reflected on each turn
   * without rebuilding the provider.
   */
  resolveAppendPrompt?: () => string | null;
  /**
   * Called when the SDK reports session capabilities (mcp_servers + tools)
   * via system.init. Sidecar writes these into SessionMetadataStore so the
   * Context Tab can query them via GET /threads/:id/context. Resolved per
   * turn so a reconnected MCP becomes visible on the next Run.
   */
  onInitMetadata?: (
    threadId: string,
    meta: {
      mcpServers: Array<{ name: string; status: string }>;
      tools: string[];
    },
  ) => void;
  /**
   * Called per-turn to compute SDK `skills` + `plugins` options. Returns the
   * list of currently-enabled skill ids (with `agent-studio:` prefix for
   * built-in) and the absolute path of the built-in plugin directory (or
   * null when unavailable, e.g. dev mode without built-in/ committed). When
   * omitted, no skill/plugin config is passed and the SDK uses its defaults.
   */
  resolveSkillsConfig?: () => {
    enabledSkills: string[];
    pluginPath: string | null;
  };
  /**
   * App-level store of skills the agent invoked at runtime via the built-in
   * `Skill` tool, keyed by threadId. When provided, runTurn installs a
   * PreToolUse hook that writes to the store. The GET /threads/:id/context
   * route reads back from this store to populate the Context Tab's "Skills"
   * section — without this, the panel only knows the static enabledSkills
   * list, not what the agent actually loaded.
   */
  skillInvocationsStore?: SkillInvocationStore;
  /**
   * When provided, an in-process MCP tool `create_scheduled_task` is exposed to
   * the agent (driven by the `/schedule` skill). The callback persists the task
   * via the host's ScheduledTaskService. Working dir + model are injected from
   * the current run, not chosen by the agent.
   */
  onCreateScheduledTask?: CreateScheduledTaskFn;
  /**
   * When provided, an in-process MCP tool `remember` is exposed on agent-bound
   * runs (RunContext.agentWorkspaceId set). The callback persists the memory
   * via the host's AgentMemoryService (source='agent'). Mirrors
   * onCreateScheduledTask's DI shape.
   */
  onRemember?: RememberFn;
}

export function createClaudeProvider(opts: ClaudeProviderOptions): AgentProvider {
  function buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env.ANTHROPIC_API_KEY = opts.apiKey;
    if (opts.baseUrl) env.ANTHROPIC_BASE_URL = opts.baseUrl;
    if (opts.model) env.ANTHROPIC_MODEL = opts.model;
    return env;
  }

  async function runTurn(
    ctx: RunContext | ResumeContext,
    prompt: string,
  ): Promise<AsyncIterable<AGUIEvent>> {
    const ac = new AbortController();
    // Bridge external signal → SDK's controller.
    if (ctx.abortSignal.aborted) {
      ac.abort(ctx.abortSignal.reason);
    } else {
      ctx.abortSignal.addEventListener(
        "abort",
        () => ac.abort(ctx.abortSignal.reason),
        { once: true },
      );
    }

    // Regenerate extras live on RunContext only; read defensively for resume.
    const ctxRun = ctx as RunContext;
    // freshSession (regenerate of the first turn): skip resume so the SDK
    // allocates a brand-new session, which onSessionId then re-tags.
    const resumeSessionId = ctxRun.freshSession
      ? undefined
      : await getResumeSessionId(ctx.threadId, ctx.cwd);

    const allowedTools = [
      ...(opts.resolveAllowedTools
        ? opts.resolveAllowedTools(ctx.threadId)
        : opts.allowedTools ?? []),
      // The in-process MCP tools aren't in the user's built-in allow-list, so
      // the SDK would never offer them unless we add them here explicitly. The
      // remember tool is agent-scoped — only on a bound run.
      ...(opts.onCreateScheduledTask ? [SCHEDULED_TOOL_FQN] : []),
      ...(opts.onRemember && ctxRun.agentWorkspaceId ? [REMEMBER_TOOL_FQN] : []),
    ];

    // Agent-workspace sandbox roots (P2). cwd (agent home / default workspace)
    // is always readable+writable; external folders extend the read set, and
    // their writable subset extends the write set.
    const additionalReadDirs = ctxRun.additionalReadDirs ?? [];
    const additionalWriteDirs = ctxRun.additionalWriteDirs ?? [];
    const readRoots = [ctx.cwd, ...additionalReadDirs];
    const writeRoots = [ctx.cwd, ...additionalWriteDirs];

    const bus = opts.interruptBus;
    // canUseTool runs for every tool call. Two gates layered:
    //   1. Workspace sandbox (sync, policy) — paths outside ctx.cwd are
    //      auto-denied so the user isn't asked to approve filesystem reads
    //      outside the directory they explicitly bound to this conversation.
    //   2. HITL bus (async, user decision) — anything that passes the
    //      sandbox surfaces an approval card.
    const canUseTool: CanUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      sdkOpts,
    ) => {
      // AskUserQuestion is a form, not a tool approval. Sandbox doesn't apply
      // (no fs access), and act-without-asking is irrelevant — the agent
      // explicitly asked for user input, so we MUST surface the form even
      // in autopilot mode. The SDK's tool contract has `answers?: Record`
      // on `AskUserQuestionInput`; canUseTool returning `updatedInput` with
      // answers populated is the documented way to feed user answers back
      // through to the agent (the built-in tool impl just echoes the input
      // as its output).
      if (toolName === "AskUserQuestion" && bus) {
        const questions = (input as { questions?: unknown }).questions;
        if (!Array.isArray(questions)) {
          // Malformed agent call — agent supplied no questions array. Let SDK
          // handle the error path (allow + let tool crash with its own error).
          return { behavior: "allow" as const, updatedInput: input };
        }
        const answers = await bus.requestAskUser({
          runId: ctx.runId,
          threadId: ctx.threadId,
          toolUseID: sdkOpts.toolUseID,
          questions: questions as Parameters<typeof bus.requestAskUser>[0]["questions"],
        });
        return {
          behavior: "allow" as const,
          updatedInput: {
            ...input,
            answers: answers.answers,
            ...(answers.annotations ? { annotations: answers.annotations } : {}),
          },
        };
      }

      const sandboxDeny = checkWorkspaceSandbox(toolName, input, {
        read: readRoots,
        write: writeRoots,
      });
      if (sandboxDeny) {
        return { behavior: "deny" as const, message: sandboxDeny };
      }
      // SDK 0.3.144's zod runtime schema requires `updatedInput: Record` on
      // every allow result — even though sdk.d.ts marks it optional. Returning
      // `{ behavior: "allow" }` bare yields:
      //   ZodError: path: ["updatedInput"], expected: "record", received undefined
      // We echo `input` back unmodified on the allow branch as the default.
      //
      // act-without-asking short-circuits BEFORE the bus — the user has
      // explicitly opted into autopilot for this thread, so we don't even
      // ask the bus (would have surfaced a card the user told us to skip).
      // Sandbox still applies (workspace policy is not negotiable).
      if (ctx.permissionMode === "act-without-asking") {
        return { behavior: "allow" as const, updatedInput: input };
      }
      if (!bus) {
        return { behavior: "allow" as const, updatedInput: input };
      }
      // Per-task allow-list (scheduled/background runs): auto-approve a
      // pre-authorized, non-destructive tool so unattended runs don't stall on
      // every step. Runs AFTER the sandbox (an allow-listed Write still can't
      // escape cwd) and AFTER the destructive guardrail (irreversible actions
      // always fall through to the bus, even when allow-listed).
      if (
        ctx.autoApproveTools?.includes(toolName) &&
        !isDestructiveToolCall(toolName, input)
      ) {
        return { behavior: "allow" as const, updatedInput: input };
      }
      const result = await bus.requestApproval({
        runId: ctx.runId,
        threadId: ctx.threadId,
        toolUseID: sdkOpts.toolUseID,
        toolName,
        input,
        title: sdkOpts.title,
        description: sdkOpts.description,
      });
      if (result.behavior === "allow") {
        return { behavior: "allow" as const, updatedInput: input };
      }
      return result;
    };

    const bashSideEffects = new BashSideEffectsTracker();
    const bashHooks = createBashSideEffectsHooks(bashSideEffects);

    const auditHooks = opts.audit
      ? createAuditHooks(opts.audit, { threadId: ctx.threadId, runId: ctx.runId })
      : null;

    const skillInvocationsHook = opts.skillInvocationsStore
      ? createSkillInvocationsHook(opts.skillInvocationsStore, ctx.threadId)
      : null;

    // Per-run model override > provider's default (ANTHROPIC_MODEL env). When
    // neither is set, the SDK picks its own default (currently latest Sonnet).
    const effectiveModel = ctx.model ?? opts.model;

    // User profile prompt addition — composed from {callMe, work, instructions}
    // per the profile settings. Resolved fresh each turn so a Settings save
    // takes effect on the very next /runs without provider rebuild.
    const appendPrompt = opts.resolveAppendPrompt?.() ?? null;
    // Agent-bound context (its CLAUDE.md instructions + saved memories), computed
    // by runWorker and merged AFTER the per-user profile addition. Both extend
    // the claude_code preset via `append`.
    const combinedAppend =
      [appendPrompt, ctxRun.appendContext]
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .join("\n\n") || null;

    // Skill/plugin config — resolved per turn so a toggle from Customize >
    // Skills takes effect on the very next /runs without provider rebuild.
    // Always passes an explicit array (never 'all') so we don't get surprised
    // by future SDK default-discovery changes.
    const skillsConfig = opts.resolveSkillsConfig?.() ?? null;

    // In-process `agent_studio` MCP server. Built per-run with whichever tools
    // apply: `create_scheduled_task` (always, for the /schedule skill) and
    // `remember` (only on an agent-bound run). Handlers inherit this run's cwd /
    // model / bound agent — the agent never supplies those.
    const agentStudioTools = [
      ...(opts.onCreateScheduledTask
        ? [
            buildScheduledTaskTool({
              threadId: ctx.threadId,
              cwd: ctx.cwd,
              model: effectiveModel,
              onCreate: opts.onCreateScheduledTask,
            }),
          ]
        : []),
      ...(opts.onRemember && ctxRun.agentWorkspaceId
        ? [
            buildRememberTool({
              agentWorkspaceId: ctxRun.agentWorkspaceId,
              threadId: ctx.threadId,
              onRemember: opts.onRemember,
            }),
          ]
        : []),
    ];
    const agentStudioMcp =
      agentStudioTools.length > 0
        ? createSdkMcpServer({ name: SCHEDULED_MCP_SERVER, tools: agentStudioTools })
        : null;

    const sdkStream = sdkQuery({
      prompt,
      options: {
        abortController: ac,
        cwd: ctx.cwd,
        env: buildEnv(),
        allowedTools,
        // External folders mounted into the bound agent (read set). Tells the
        // model these dirs are reachable beyond cwd. Omitted when there are
        // none (non-agent thread).
        ...(additionalReadDirs.length > 0
          ? { additionalDirectories: additionalReadDirs }
          : {}),
        ...(agentStudioMcp
          ? { mcpServers: { [SCHEDULED_MCP_SERVER]: agentStudioMcp } }
          : {}),
        ...(effectiveModel ? { model: effectiveModel } : {}),
        ...(skillsConfig
          ? {
              skills: skillsConfig.enabledSkills,
              ...(skillsConfig.pluginPath
                ? { plugins: [{ type: "local" as const, path: skillsConfig.pluginPath }] }
                : {}),
            }
          : {}),
        // Per-user system prompt addition (callMe / work / instructions).
        // We always opt into the claude_code preset — bare-string systemPrompt
        // would replace SDK's tool-use guidance. `append` extends, doesn't
        // override. When the user hasn't filled anything in, drop append so
        // the preset prompt runs untouched.
        ...(combinedAppend
          ? {
              systemPrompt: {
                type: "preset" as const,
                preset: "claude_code" as const,
                append: combinedAppend,
              },
            }
          : {}),
        // File checkpointing: snapshot Write/Edit/NotebookEdit changes so a
        // later regenerate can rewindFiles() to a turn's user-message uuid.
        // `replay-user-messages` is REQUIRED to surface user-message uuids in
        // the stream (the checkpoint ids) — without it message.uuid is absent.
        // Both are always on so every turn is rewindable + every user turn gets
        // its sdk_uuid captured. Bash-produced files are NOT tracked (SDK limit).
        enableFileCheckpointing: true,
        extraArgs: { "replay-user-messages": null },
        // Emit fine-grained SDKPartialAssistantMessage (stream_event) frames so
        // the bridge can turn them into per-token TEXT_MESSAGE_CONTENT events
        // and the UI shows characters arriving in real time. Without this, the
        // SDK only yields the full SDKAssistantMessage at the end of a turn,
        // which collapses the response into a single chunk.
        includePartialMessages: true,
        // Always installed: even when there's no HITL bus, the sandbox
        // layer inside canUseTool needs to gate file paths.
        canUseTool,
        hooks: (() => {
          const preHooks: HookCallback[] = [bashHooks.pre];
          const postHooks: HookCallback[] = [bashHooks.post];
          if (auditHooks) {
            preHooks.push(auditHooks.pre);
            postHooks.push(auditHooks.post);
          }
          if (skillInvocationsHook) preHooks.push(skillInvocationsHook);
          // timeout (seconds): Bash side-effects scan walks the cwd mtime tree
          // and can take a few seconds on medium repos. 2s was empirically too
          // tight — PostToolUse would time out before finalize(), takeEffects()
          // returned null, and the CUSTOM file.side_effects event was never
          // emitted (visible symptom: pptx produced by `python3 …` doesn't
          // appear in Files Tab or inline cards). 30s gives ample headroom.
          return {
            PreToolUse: [{ hooks: preHooks, timeout: 30 }],
            PostToolUse: [{ hooks: postHooks, timeout: 30 }],
          };
        })(),
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          // Disabled so Bash is not auto-allowed; HITL bus handles approval.
          autoAllowBashIfSandboxed: false,
          allowUnsandboxedCommands: false,
          excludedCommands: [],
          filesystem: {
            // OS-enforced write boundary: agent home / default cwd + any
            // writable external folders. Read-only mounts are deliberately
            // absent — a write there is blocked at the kernel level even if the
            // UX-layer sandbox above were bypassed.
            allowWrite: writeRoots,
          },
          // network 不限——本 phase 决策"仅写限"
        },
        // Force every mutation tool through canUseTool (HITL bus) even when
        // sandbox.allowWrite / autoAllowBashIfSandboxed would otherwise
        // auto-approve them. Read-only tools (Read/Glob/Grep/WebSearch) are
        // intentionally omitted — the workspace path check in canUseTool still
        // rejects out-of-cwd reads without surfacing a noisy approval card.
        settings: {
          permissions: {
            ask: [
              "Bash(*)",
              "Write(*)",
              "Edit(*)",
              "MultiEdit(*)",
              "NotebookEdit(*)",
              "Task(*)",
              "WebFetch(*)",
            ],
          },
        },
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        // Regenerate: rewind the transcript to the message before the turn
        // being redone, then `prompt` (the same user message) re-runs. Requires
        // an active resume session — only set when both are present.
        ...(resumeSessionId && ctxRun.resumeSessionAt
          ? { resumeSessionAt: ctxRun.resumeSessionAt }
          : {}),
      },
    });

    return claudeSdkToAgui(sdkStream, {
      threadId: ctx.threadId,
      runId: ctx.runId,
      callbacks: ctx.callbacks,
      onSessionId: (sid) => {
        // First turn allocates a fresh session_id; subsequent turns echo the
        // resumed one. Either way, tag idempotently so resume lookup works.
        void tagThreadSession(sid, ctx.threadId, ctx.cwd);
      },
      onUserMessageId: ctx.callbacks?.onUserMessageId
        ? (uuid) => ctx.callbacks!.onUserMessageId!(uuid)
        : undefined,
      onInitMetadata: opts.onInitMetadata
        ? (meta) => opts.onInitMetadata!(ctx.threadId, meta)
        : undefined,
      sideEffectsTracker: bashSideEffects,
    });
  }

  return {
    name: "claude-agent-sdk",

    run(ctx: RunContext) {
      return asyncIterableFromPromise(runTurn(ctx, ctx.userMessage.content));
    },

    resume(ctx: ResumeContext) {
      const payload = ctx.resumePayload as { text?: string } | null;
      return asyncIterableFromPromise(runTurn(ctx, payload?.text ?? ""));
    },

    async getPendingInterrupts(
      _threadId: string,
      _runId: string,
    ): Promise<AGUIInterrupt[]> {
      // Interrupts are surfaced mid-stream via the InterruptBus
      // (canUseTool → bus.requestApproval writes a synthetic RUN_FINISHED
      // event to the store). This end-of-stream path is unused for the
      // claude-agent-sdk provider; the runLoop's `interrupted` outcome
      // branch only fires for providers that report interrupts on stream
      // termination (e.g., LangGraph-style runtimes).
      return [];
    },

    async notifyCancelled(_threadId: string): Promise<void> {
      // No-op for SDK provider. The next user message will land via resume
      // sessionId, and the cancelled assistant message stays in the SDK's
      // session transcript (it's recorded by the CLI before kill).
    },

    async rewindFiles(input: {
      threadId: string;
      cwd: string;
      checkpointUuid: string;
      signal?: AbortSignal;
    }): Promise<{ canRewind: boolean; error?: string }> {
      const sessionId = await getResumeSessionId(input.threadId, input.cwd);
      if (!sessionId) return { canRewind: false, error: "no_session" };
      return rewindSessionFiles({
        sessionId,
        cwd: input.cwd,
        env: buildEnv(),
        model: opts.model,
        checkpointUuid: input.checkpointUuid,
        signal: input.signal,
      });
    },
  };
}

function asyncIterableFromPromise<T>(
  p: Promise<AsyncIterable<T>>,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let inner: AsyncIterator<T> | null = null;
      return {
        async next() {
          if (!inner) inner = (await p)[Symbol.asyncIterator]();
          return inner.next();
        },
      };
    },
  };
}

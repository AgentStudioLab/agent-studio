import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventType } from "@ag-ui/core";
import {
  executeRunLoop,
  type RunEventStore,
  type AgentProvider,
  type ProviderCallbacks,
} from "../agui/core";
import type { MessageService } from "../services/messages";
import type { ThreadService } from "../services/threads";
import type { AgentFolderService } from "../services/agentFolders";
import type { AgentLink, AgentLinkService } from "../services/agentLinks";
import { MEMORY_INDEX_BUDGET, type AgentMemoryStore } from "../services/agentMemoryStore";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";
import type { UsageService } from "../services/usage";

/**
 * P2 sandbox roots from an agent's mounted folders: every folder is readable,
 * only the writable ones are writable. The provider prepends `cwd` (agent home
 * / default workspace) to both sets. Exported + pure so the read/write split is
 * unit-testable without driving a full run.
 */
export function computeAgentDirs(
  folders: { path: string; writable: boolean }[],
): { additionalReadDirs: string[]; additionalWriteDirs: string[] } {
  return {
    additionalReadDirs: folders.map((f) => f.path),
    additionalWriteDirs: folders.filter((f) => f.writable).map((f) => f.path),
  };
}

/**
 * Agent context injected into systemPrompt.append on agent-bound runs: the
 * agent's <home>/CLAUDE.md instructions (verbatim) + its memory index
 * (<home>/memory/MEMORY.md). Scenario file bodies are NOT injected — the agent
 * Reads them on demand. Near the index budget, append a consolidation nudge.
 * Pure (IO is the caller's). Returns null when both are empty.
 */
/** Reference-links section for the append, or "" when there are none. */
function buildLinksBlock(links: AgentLink[]): string {
  if (links.length === 0) return "";
  const lines = links.map((l) => `- [${l.title}](${l.url})`).join("\n");
  return `## Reference links\nUse WebFetch to read any of these when relevant:\n${lines}`;
}

export function buildAgentAppendContext(
  claudeMd: string | null,
  memoryIndex: string,
  links: AgentLink[] = [],
): string | null {
  const parts: string[] = [];
  const md = claudeMd?.trim();
  if (md) parts.push(md);
  const idx = memoryIndex.trim();
  if (idx) {
    // The index file carries its own `# Memory index` heading, so inject it
    // verbatim (no extra host heading). Nudge gate measures the injected text.
    const nudge =
      idx.length >= MEMORY_INDEX_BUDGET.warn
        ? "\n\n<!-- Memory index near capacity — consolidate: merge or remove stale scenario files via the remember tool. -->"
        : "";
    parts.push(`${idx}${nudge}`);
  }
  const linksBlock = buildLinksBlock(links);
  if (linksBlock) parts.push(linksBlock);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export interface RunWorkerInput {
  runId: string;
  threadId: string;
  userMessage: { role: "user"; content: string };
  store: RunEventStore;
  messages: MessageService;
  threads: ThreadService;
  /** Resolves the bound agent's external folders → sandbox read/write roots.
   *  Omitted (e.g. unit tests) → no agent folder context. */
  agentFolders?: AgentFolderService;
  /** Reference links → a one-line list injected into append (P3).
   *  Omitted → no link context. */
  agentLinks?: AgentLinkService;
  /** File-based memory store → MEMORY.md index injected into append.
   *  Omitted → no memory context. */
  agentMemoryStore?: AgentMemoryStore;
  provider: AgentProvider;
  interruptBus: InterruptBus;
  abortSignal: AbortSignal;
  usage: UsageService;
  /** "ask" (default) or "act-without-asking" (skip HITL approvals). */
  permissionMode?: "ask" | "act-without-asking";
  /** Per-run model id override (e.g. "claude-opus-4-7"). */
  model?: string;
  /** Per-task allow-list for scheduled/background runs (see RunContext). */
  autoApproveTools?: string[];
  /** DB id of the user message this run answers. When set, the captured SDK
   *  prompt uuid is persisted onto it (for future regenerate). */
  userMessageId?: string;
  /** Regenerate: resume the SDK session at this message uuid (see RunContext). */
  resumeSessionAt?: string;
  /** Regenerate of the first turn: skip resume, fresh session (see RunContext). */
  freshSession?: boolean;
  /** Caller's UI locale (frontend forwards i18n.language) → language directive
   *  in systemPrompt.append. Omitted for background runs (see RunContext). */
  locale?: string;
}

export async function runWorker(input: RunWorkerInput): Promise<void> {
  const {
    runId,
    threadId,
    userMessage,
    store,
    messages,
    threads,
    agentFolders,
    agentLinks,
    agentMemoryStore,
    provider,
    interruptBus,
    abortSignal,
    usage,
    permissionMode = "ask",
    model,
    autoApproveTools,
    userMessageId,
    resumeSessionAt,
    freshSession,
    locale,
  } = input;

  // Buffer the structured messages/tool_calls writes until the run reaches a
  // truly terminal state. This is the "single source of truth" guarantee for
  // in-flight turns: while a run is streaming or paused on HITL approval, the
  // only authoritative representation is the AG-UI event log in run_events.
  // /conversations/:id/messages reads from messages/tool_calls — if we flush
  // mid-run, the client gets both a persisted half-turn AND the SSE-replay
  // rebuild of the same turn, producing duplicates after cross-session resume.
  type PendingAssistant = { id: string; content: string; reasoning?: string; sdkUuid?: string };
  type PendingToolCall = { parentMessageId: string; id: string; toolName: string; args: unknown };
  type PendingToolResult = {
    id: string;
    result: unknown;
    status: "success" | "error";
    errorMsg?: string;
    sideEffects?: import("../agui/provider-claude/bash-side-effects").SideEffectFile[];
  };
  const assistantBuffer: PendingAssistant[] = [];
  const toolCallBuffer: PendingToolCall[] = [];
  const toolResultBuffer: PendingToolResult[] = [];

  function flushMessagesBuffers(): void {
    for (const m of assistantBuffer) {
      messages.appendAssistant(threadId, {
        id: m.id,
        content: m.content,
        reasoning: m.reasoning,
        sdkUuid: m.sdkUuid,
      });
    }
    for (const tc of toolCallBuffer) {
      messages.upsertToolCall(tc.parentMessageId, {
        id: tc.id,
        toolName: tc.toolName,
        args: tc.args,
      });
    }
    for (const r of toolResultBuffer) {
      messages.completeToolCall(r.id, {
        result: r.result,
        status: r.status,
        errorMsg: r.errorMsg,
        sideEffects: r.sideEffects,
      });
    }
    assistantBuffer.length = 0;
    toolCallBuffer.length = 0;
    toolResultBuffer.length = 0;
  }

  const callbacks: ProviderCallbacks = {
    onMessageEnd(msg) {
      assistantBuffer.push({
        id: msg.id,
        content: msg.content,
        reasoning: msg.reasoning,
        sdkUuid: msg.sdkUuid,
      });
    },
    onUserMessageId(uuid) {
      // The user row already exists (appended by the route before the run).
      // Persist the SDK prompt uuid immediately — it's metadata, not part of
      // the buffered single-source-of-truth turn, and a valid checkpoint even
      // if the run is later cancelled.
      if (userMessageId) messages.setSdkUuid(userMessageId, uuid);
    },
    onToolCallEnd(tc) {
      if (tc.parentMessageId) {
        toolCallBuffer.push({
          parentMessageId: tc.parentMessageId,
          id: tc.id,
          toolName: tc.toolName,
          args: tc.args,
        });
      }
    },
    onToolCallResult(tc) {
      toolResultBuffer.push({
        id: tc.id,
        result: tc.result,
        status: tc.status,
        errorMsg: tc.errorMsg,
        sideEffects: tc.sideEffects,
      });
    },
    onRunUsage(u) {
      usage.recordRun({
        runId: u.runId,
        threadId: u.threadId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheCreationTokens: u.cacheCreationTokens,
        cacheReadTokens: u.cacheReadTokens,
        totalCostUsd: u.totalCostUsd,
        permissionDenials: u.permissionDenials,
        model: u.model,
      });
    },
  };

  // Resolve the thread's persisted working directory once at run start.
  // ThreadService.get falls back to ~/.agent-studio when working_dir is NULL,
  // so cwd is always a real path the SDK can chdir to.
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(`thread ${threadId} not found`);
  }
  const cwd = thread.workingDir;

  // Agent-bound thread → resolve its external folders into sandbox roots and
  // its CLAUDE.md + memories into the systemPrompt append. Unbound thread (or
  // no service) → undefined, provider stays at [cwd] with no agent context.
  const agentWorkspaceId = thread.agentWorkspaceId ?? undefined;
  const agentDirs =
    agentWorkspaceId && agentFolders
      ? computeAgentDirs(agentFolders.listByAgent(agentWorkspaceId))
      : undefined;

  let appendContext: string | undefined;
  if (agentWorkspaceId) {
    let claudeMd: string | null = null;
    try {
      claudeMd = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    } catch {
      // No CLAUDE.md in the agent home → no instructions section.
    }
    let memoryIndex = "";
    if (agentMemoryStore) {
      // Host backstop: evict oldest entries only past the hard cap (see store).
      await agentMemoryStore.enforceIndexBudget(agentWorkspaceId);
      memoryIndex = agentMemoryStore.indexText(agentWorkspaceId);
    }
    const links = agentLinks ? agentLinks.listByAgent(agentWorkspaceId) : [];
    appendContext = buildAgentAppendContext(claudeMd, memoryIndex, links) ?? undefined;
  }

  try {
    const initialStream = provider.run({
      runId,
      threadId,
      userMessage,
      abortSignal,
      callbacks,
      cwd,
      permissionMode,
      model,
      autoApproveTools,
      resumeSessionAt,
      freshSession,
      additionalReadDirs: agentDirs?.additionalReadDirs,
      additionalWriteDirs: agentDirs?.additionalWriteDirs,
      appendContext,
      agentWorkspaceId,
      locale,
    });

    await executeRunLoop({
      runId,
      threadId,
      store,
      provider,
      initialStream,
      callbacks,
      abortSignal,
      onTerminal: async (status) => {
        // Reject any still-pending HITL approvals for this run so the SDK
        // unblocks (canUseTool resolves as deny → SDK aborts the tool +
        // emits its own terminal). Safe to call when no deferreds exist.
        interruptBus.cancelAll(runId);
        // Flush buffered assistant turns + tool_calls now — before
        // cancelPendingToolCallsForThread (which marks any still-pending
        // tool_calls as error) and before the system note, so chronological
        // order via createdAt is correct.
        flushMessagesBuffers();
        messages.cancelPendingToolCallsForThread(threadId);
        if (status === "cancelled") {
          messages.appendSystemNote(threadId, "已被用户中止");
          await provider.notifyCancelled?.(threadId);
        }
        threads.touch(threadId);
      },
    });
  } catch (err) {
    interruptBus.cancelAll(runId);
    // Outer catch fires when executeRunLoop itself throws (network during
    // store writes, unexpected exceptions). Flush whatever made it into the
    // buffer so the user sees the partial state on next /messages load —
    // losing it silently is worse than persisting a half-turn.
    flushMessagesBuffers();
    const msg = err instanceof Error ? err.message : String(err);
    await store.appendEvent(runId, {
      type: EventType.RUN_ERROR,
      message: msg,
      code: abortSignal.aborted ? "CANCELLED" : "WORKER_ERROR",
    } as never);
    await store.finishRun(runId, abortSignal.aborted ? "cancelled" : "error", msg);
    if (abortSignal.aborted) {
      try {
        messages.appendSystemNote(threadId, "已被用户中止");
      } catch {
        /* best-effort */
      }
    }
  }
}

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
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
import type { AgentFolderService } from "../services/agentFolders";
import type { AgentLink, AgentLinkService } from "../services/agentLinks";
import { MEMORY_INDEX_BUDGET, type AgentMemoryStore } from "../services/agentMemoryStore";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";
import type { UsageService } from "../services/usage";
import type { ProviderModelSelection } from "../services/providerSettings";

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

/** Redirects the agent to OUR file-based memory instead of the claude_code
 *  preset's default memory directory (which lives outside the workspace sandbox
 *  and is unrelated). Always present on agent-bound runs. */
const MEMORY_DIRECTIVE =
  "This agent's durable memory lives in `memory/` in your working directory and is " +
  "managed ONLY through the `remember` tool. It is your single source of memory — do " +
  "not look for, read, or create memory in any other location (ignore any default " +
  "memory directory outside this workspace). To recall a saved scenario, Read " +
  "`memory/<slug>.md`.";

export function buildAgentAppendContext(
  claudeMd: string | null,
  memoryIndex: string,
  links: AgentLink[] = [],
): string | null {
  const parts: string[] = [];
  const md = claudeMd?.trim();
  if (md) parts.push(md);

  // Memory section — always present on agent-bound runs so the agent uses our
  // file-based memory (the `remember` tool + the index below) and not the
  // preset's out-of-workspace default. The index carries its own
  // `# Memory index` heading, so it's injected verbatim after the directive.
  const idx = memoryIndex.trim();
  if (idx) {
    const nudge =
      idx.length >= MEMORY_INDEX_BUDGET.warn
        ? "\n\n<!-- Memory index near capacity — consolidate: merge or remove stale scenario files via the remember tool. -->"
        : "";
    parts.push(`${MEMORY_DIRECTIVE}\n\n${idx}${nudge}`);
  } else {
    parts.push(`${MEMORY_DIRECTIVE}\n\nNo memories saved yet.`);
  }

  const linksBlock = buildLinksBlock(links);
  if (linksBlock) parts.push(linksBlock);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Agent 身份信息块，注入到 systemPrompt.append 最前面。让模型知道自己是「在 Agent Studio
 * 中作为某个具名智能体运行」——这样"你在哪个 agent 下 / 哪个工作空间"之类的问题能答出
 * 可读的智能体名，而不是只能从 agw_xxx 路径反推（见用户反馈截图）。用英文书写以匹配
 * append 既有风格（CLAUDE.md preset / 记忆指令均为英文），回答语言仍由 locale 指令决定。
 */
export function buildAgentIdentityBlock(agentName: string): string {
  const name = agentName.trim() || "Untitled";
  return (
    `You are operating inside Agent Studio as the agent named "${name}". ` +
    `Your current working directory is this agent's own dedicated workspace (its home directory). ` +
    `When the user asks which agent or workspace you are running in, identify yourself as the ` +
    `"${name}" agent in Agent Studio rather than reciting the raw directory path.`
  );
}

export interface RunWorkerInput {
  runId: string;
  threadId: string;
  userMessage: { role: "user"; content: string };
  store: RunEventStore;
  messages: MessageService;
  threads: ThreadService;
  /** Resolves the bound agent's name → identity block injected into append.
   *  Omitted (e.g. unit tests) → no identity context. */
  agentWorkspaces?: AgentWorkspaceService;
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
  providerSelection?: ProviderModelSelection;
  resolveProvider?: (selection?: ProviderModelSelection | null) => AgentProvider;
  officialAuthToken?: string;
  officialWebsiteOrigin?: string;
  interruptBus: InterruptBus;
  abortSignal: AbortSignal;
  usage: UsageService;
  /** "ask" (default) or "act-without-asking" (skip HITL approvals). */
  permissionMode?: "ask" | "act-without-asking";
  /** Per-run model id override (e.g. "claude-opus-4-7"). */
  model?: string;
  /** Per-task allow-list for scheduled/background runs (see RunContext). */
  autoApproveTools?: string[];
  /** 交互式 run 的「始终允许」命令规则（CC Tool(pattern) 语法，见 RunContext）。 */
  approvalRules?: string[];
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
  /** Internal callers may add task-specific context after normal agent context. */
  appendContextExtra?: string;
  /** Internal completion callback for remote tasks. Public routes never expose it. */
  onTerminalResult?: (result: {
    status: "completed" | "error" | "cancelled" | "awaiting_user";
    assistantText: string;
    errorMsg?: string;
  }) => Promise<void>;
}

export async function runWorker(input: RunWorkerInput): Promise<void> {
  const {
    runId,
    threadId,
    userMessage,
    store,
    messages,
    threads,
    agentWorkspaces,
    agentFolders,
    agentLinks,
    agentMemoryStore,
    provider,
    providerSelection,
    resolveProvider,
    officialAuthToken,
    officialWebsiteOrigin,
    interruptBus,
    abortSignal,
    usage,
    permissionMode = "ask",
    model,
    autoApproveTools,
    approvalRules,
    userMessageId,
    resumeSessionAt,
    freshSession,
    locale,
    appendContextExtra,
    onTerminalResult,
  } = input;

  // Buffer the structured messages/tool_calls writes until the run reaches a
  // 直到真正终态才落库结构化消息/tool_calls，保证运行中的 turn 只有 run_events
  // 一个权威来源。run 仍在流式输出或等待用户时，如果提前 flush，跨会话恢复会同时
  // 读到半截持久化消息和 SSE 回放重建的同一轮，造成重复展示。
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

  function assistantTextFromBuffer(): string {
    return assistantBuffer.map((m) => m.content).filter(Boolean).join("\n\n");
  }

  async function notifyTerminalResult(
    status: "completed" | "error" | "cancelled" | "awaiting_user",
    assistantText: string,
    errorMsg?: string,
  ): Promise<void> {
    if (!onTerminalResult) return;
    try {
      await onTerminalResult({ status, assistantText, errorMsg });
    } catch (err) {
      console.warn(
        "[runWorker] onTerminalResult failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
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
    // 身份信息（含智能体名称）置于最前，其后才是用户的 CLAUDE.md 说明 / 记忆 / 链接。
    const agent = agentWorkspaces?.get(agentWorkspaceId) ?? null;
    const identity = agent ? buildAgentIdentityBlock(agent.name) : null;
    const baseContext = buildAgentAppendContext(claudeMd, memoryIndex, links);
    appendContext =
      [identity, baseContext]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join("\n\n") || undefined;
  }
  const extra = appendContextExtra?.trim();
  if (extra) {
    appendContext = appendContext ? `${appendContext}\n\n${extra}` : extra;
  }

  try {
    const runProvider = resolveProvider?.(providerSelection) ?? provider;
    const initialStream = runProvider.run({
      runId,
      threadId,
      userMessage,
      abortSignal,
      callbacks,
      cwd,
      permissionMode,
      model,
      officialAuthToken,
      officialWebsiteOrigin,
      autoApproveTools,
      approvalRules,
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
      provider: runProvider,
      initialStream,
      callbacks,
      abortSignal,
      onTerminal: async (status, errorMsg) => {
        // Reject any still-pending HITL approvals for this run so the SDK
        // unblocks (canUseTool resolves as deny → SDK aborts the tool +
        // emits its own terminal). Safe to call when no deferreds exist.
        interruptBus.cancelAll(runId);
        // Flush buffered assistant turns + tool_calls now — before
        // cancelPendingToolCallsForThread (which marks any still-pending
        // tool_calls as error) and before the system note, so chronological
        // order via createdAt is correct.
        const assistantText = assistantTextFromBuffer();
        flushMessagesBuffers();
        messages.cancelPendingToolCallsForThread(threadId);
        if (status === "cancelled") {
          messages.appendSystemNote(threadId, "已被用户中止");
        await runProvider.notifyCancelled?.(threadId);
        }
        threads.touch(threadId);
        await notifyTerminalResult(status, assistantText, errorMsg);
      },
    });
  } catch (err) {
    interruptBus.cancelAll(runId);
    // Outer catch fires when executeRunLoop itself throws (network during
    // store writes, unexpected exceptions). Flush whatever made it into the
    // buffer so the user sees the partial state on next /messages load —
    // losing it silently is worse than persisting a half-turn.
    const assistantText = assistantTextFromBuffer();
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
    await notifyTerminalResult(
      abortSignal.aborted ? "cancelled" : "error",
      assistantText,
      msg,
    );
  }
}

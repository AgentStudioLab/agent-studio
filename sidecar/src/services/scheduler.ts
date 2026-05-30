import { runWorker } from "../agent/runWorker";
import type { RunEventStore, AgentProvider } from "../agui/core";
import type { InterruptBus } from "../agui/provider-claude/interrupt-bus";
import type { ScheduledTask, ScheduledTaskService } from "./scheduledTasks";
import type { ThreadService } from "./threads";
import type { MessageService } from "./messages";
import type { AgentFolderService } from "./agentFolders";
import type { AgentMemoryService } from "./agentMemories";
import type { UsageService } from "./usage";

export interface SchedulerDeps {
  tasks: ScheduledTaskService;
  threads: ThreadService;
  messages: MessageService;
  store: RunEventStore;
  provider: AgentProvider;
  interruptBus: InterruptBus;
  usage: UsageService;
  /** Resolves an agent-bound run's external folders → sandbox roots (P2). */
  agentFolders?: AgentFolderService;
  /** Resolves an agent-bound run's saved memories → systemPrompt.append (P3). */
  agentMemories?: AgentMemoryService;
  /** Resolve an agent workspace's home dir for agent-bound tasks. Returns
   *  null → the spawned conversation falls back to the default workspace cwd. */
  resolveAgentHome?: (agentWorkspaceId: string) => string | null | undefined;
  /** When this returns false (e.g. no API key yet), the tick is skipped WITHOUT
   *  advancing — so a task due during the gap still catch-up fires once ready. */
  canRun?: () => boolean;
  /** Poll interval. Defaults to 60s (matches Cowork's per-minute desktop poll). */
  tickMs?: number;
}

const DEFAULT_TICK_MS = 60_000;

/**
 * In-process poll-tick scheduler. Every tick it asks the service which tasks
 * are due (`next_run_at <= now`) and fires each as a fresh headless run. The
 * loop is frequency-agnostic — all cadence logic lives in
 * {@link ScheduledTaskService.advance} / `computeNextRunAt`. Only runs while the
 * sidecar process is alive (i.e. the desktop app is open), same as Cowork.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private deps: SchedulerDeps) {}

  start(): void {
    this.deps.tasks.armAll(Date.now());
    void this.tick(); // catch up anything missed while the app was closed.
    this.timer = setInterval(
      () => void this.tick(),
      this.deps.tickMs ?? DEFAULT_TICK_MS,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.deps.canRun && !this.deps.canRun()) return;
    const now = Date.now();
    let due: ScheduledTask[];
    try {
      due = this.deps.tasks.dueTasks(now);
    } catch (err) {
      console.error("[scheduler] dueTasks query failed", err);
      return;
    }
    for (const task of due) {
      // Advance FIRST: roll next_run_at forward before firing so a fire() throw
      // can't spin into a tight re-fire loop on the next tick.
      try {
        this.deps.tasks.advance(task.id, now);
      } catch (err) {
        console.error("[scheduler] advance failed", task.id, err);
        continue;
      }
      try {
        await this.fire(task);
      } catch (err) {
        console.error("[scheduler] fire failed", task.id, err);
      }
    }
  }

  /**
   * Spawn a fresh conversation seeded with the task prompt and kick off a
   * headless run — mirrors POST /runs but server-initiated. Returns the spawned
   * ids so "Run now" can reuse the exact same path.
   */
  async fire(task: ScheduledTask): Promise<{ threadId: string; runId: string }> {
    // Explicit working_dir wins; otherwise fall back to a project cwd (when
    // wired) or the default workspace (workingDir null → ThreadService default).
    const cwd =
      task.workingDir ??
      (task.agentWorkspaceId
        ? this.deps.resolveAgentHome?.(task.agentWorkspaceId) ?? null
        : null);
    const thread = this.deps.threads.create({
      title: task.name,
      agentWorkspaceId: task.agentWorkspaceId,
      workingDir: cwd,
      scheduledTaskId: task.id,
      // Seed the conversation's defaults so opening it (and any follow-up
      // message) inherits the task's model + permission mode.
      model: task.model,
      permissionMode: task.permissionMode,
    });
    const threadId = thread.id;
    const runId = crypto.randomUUID();

    this.deps.messages.appendUser(threadId, task.prompt);
    await this.deps.store.createRun(runId, threadId);

    const abort = new AbortController();
    // Fire and forget — the worker drives the SDK and writes events to the
    // store. A paused HITL becomes `awaiting_approval` (surfaced in-app); the
    // user resumes via the existing /runs/:id/resume route.
    void runWorker({
      runId,
      threadId,
      userMessage: { role: "user", content: task.prompt },
      store: this.deps.store,
      messages: this.deps.messages,
      threads: this.deps.threads,
      agentFolders: this.deps.agentFolders,
      agentMemories: this.deps.agentMemories,
      provider: this.deps.provider,
      interruptBus: this.deps.interruptBus,
      abortSignal: abort.signal,
      usage: this.deps.usage,
      // "ask" → gate stays live and the allow-list auto-approves within it.
      // "act-without-asking" → full autopilot (the per-task opt-in).
      permissionMode: task.permissionMode,
      model: task.model ?? undefined,
      autoApproveTools: task.allowedTools,
    });

    return { threadId, runId };
  }
}

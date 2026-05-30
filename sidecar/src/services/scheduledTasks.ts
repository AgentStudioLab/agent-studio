import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

export type Frequency = "manual" | "hourly" | "daily" | "weekdays" | "weekly";

export type PermissionMode = "ask" | "act-without-asking";

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agentWorkspaceId: string | null;
  workingDir: string | null;
  model: string | null;
  permissionMode: PermissionMode;
  frequency: Frequency;
  timeOfDay: string | null;
  /** 0=Sun..6=Sat anchor for 'weekly'. null → anchored to createdAt's weekday. */
  weekday: number | null;
  enabled: boolean;
  allowedTools: string[];
  nextRunAt: number | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ScheduledTaskRow {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agent_workspace_id: string | null;
  working_dir: string | null;
  model: string | null;
  permission_mode: PermissionMode;
  frequency: Frequency;
  time_of_day: string | null;
  weekday: number | null;
  enabled: number;
  allowed_tools_json: string | null;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

const MAX_STAGGER_MS = 10 * 60_000; // 10 minutes, per Cowork's deterministic stagger.

/** Stable 0..10min offset derived from the task id — staggers API traffic
 *  without making the displayed "next run" jump between renders. */
export function staggerOffset(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) {
    h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  }
  return h % MAX_STAGGER_MS;
}

function parseHM(timeOfDay: string | null | undefined): { h: number; m: number } {
  if (timeOfDay) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay);
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
    }
  }
  return { h: 9, m: 0 }; // sensible default matching the modal's 09:00.
}

/** Next local wall-clock occurrence at h:m on a day matching `isDow`, strictly
 *  after `from`. Constructed via local-time Date fields so DST transitions are
 *  handled by the runtime (a "daily 09:00" stays 09:00 local across the shift),
 *  never by adding fixed millisecond deltas. */
function nextDailyLike(
  from: Date,
  h: number,
  m: number,
  isDow: (dow: number) => boolean,
): number {
  const cand = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    h,
    m,
    0,
    0,
  );
  // Walk forward at most ~8 days (covers weekly's worst case) until the
  // candidate is both in the future and on an allowed weekday.
  for (let i = 0; i < 8; i++) {
    if (cand.getTime() > from.getTime() && isDow(cand.getDay())) {
      return cand.getTime();
    }
    cand.setDate(cand.getDate() + 1);
    cand.setHours(h, m, 0, 0); // re-pin wall-clock time in case DST drifted it.
  }
  return cand.getTime();
}

/**
 * Base next-run timestamp (epoch ms), WITHOUT the per-task stagger offset.
 * The scheduler adds {@link staggerOffset} when persisting. Returns null for
 * 'manual' (never auto-fires).
 *
 * @param weeklyAnchorDow 0=Sun..6=Sat. Only used by 'weekly'; defaults to the
 *   weekday of `from` when omitted.
 */
export function computeNextRunAt(
  frequency: Frequency,
  timeOfDay: string | null | undefined,
  from: number,
  weeklyAnchorDow?: number,
): number | null {
  if (frequency === "manual") return null;
  const fromDate = new Date(from);
  const { h, m } = parseHM(timeOfDay);

  switch (frequency) {
    case "hourly": {
      // Next time the minute hand hits `m`, strictly after `from`.
      const cand = new Date(
        fromDate.getFullYear(),
        fromDate.getMonth(),
        fromDate.getDate(),
        fromDate.getHours(),
        m,
        0,
        0,
      );
      if (cand.getTime() <= from) cand.setHours(cand.getHours() + 1);
      return cand.getTime();
    }
    case "daily":
      return nextDailyLike(fromDate, h, m, () => true);
    case "weekdays":
      return nextDailyLike(fromDate, h, m, (dow) => dow >= 1 && dow <= 5);
    case "weekly": {
      const anchor = weeklyAnchorDow ?? fromDate.getDay();
      return nextDailyLike(fromDate, h, m, (dow) => dow === anchor);
    }
  }
}

function rowToTask(r: ScheduledTaskRow): ScheduledTask {
  let allowedTools: string[] = [];
  if (r.allowed_tools_json) {
    try {
      const parsed = JSON.parse(r.allowed_tools_json);
      if (Array.isArray(parsed)) allowedTools = parsed;
    } catch {
      /* corrupt JSON → treat as empty allow-list (safe default). */
    }
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    prompt: r.prompt,
    agentWorkspaceId: r.agent_workspace_id,
    workingDir: r.working_dir,
    model: r.model,
    permissionMode: r.permission_mode === "act-without-asking" ? "act-without-asking" : "ask",
    frequency: r.frequency,
    timeOfDay: r.time_of_day,
    weekday: r.weekday,
    enabled: r.enabled === 1,
    allowedTools,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateScheduledTaskInput {
  id?: string;
  name: string;
  description?: string;
  prompt: string;
  agentWorkspaceId?: string | null;
  workingDir?: string | null;
  model?: string | null;
  permissionMode?: PermissionMode;
  frequency: Frequency;
  timeOfDay?: string | null;
  weekday?: number | null;
  enabled?: boolean;
  allowedTools?: string[];
}

export type UpdateScheduledTaskInput = Partial<
  Omit<CreateScheduledTaskInput, "id">
>;

export class ScheduledTaskService {
  constructor(private db: Database) {}

  /** next_run_at for a task, anchored to its creation weekday for 'weekly'.
   *  Returns null when the task is disabled or 'manual'. */
  private nextRunFor(task: ScheduledTask, from: number): number | null {
    if (!task.enabled) return null;
    const base = computeNextRunAt(
      task.frequency,
      task.timeOfDay,
      from,
      task.weekday ?? new Date(task.createdAt).getDay(),
    );
    return base === null ? null : base + staggerOffset(task.id);
  }

  create(input: CreateScheduledTaskInput): ScheduledTask {
    const id = input.id ?? `sched_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO scheduled_tasks
           (id, name, description, prompt, agent_workspace_id, working_dir, model,
            permission_mode, frequency, time_of_day, weekday, enabled,
            allowed_tools_json, next_run_at, last_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.prompt,
        input.agentWorkspaceId ?? null,
        input.workingDir ?? null,
        input.model ?? null,
        input.permissionMode === "act-without-asking" ? "act-without-asking" : "ask",
        input.frequency,
        input.timeOfDay ?? null,
        input.weekday ?? null,
        input.enabled === false ? 0 : 1,
        input.allowedTools ? JSON.stringify(input.allowedTools) : null,
        now,
        now,
      );
    // Compute next_run_at after the row exists so createdAt drives the weekly anchor.
    const created = this.get(id)!;
    const next = this.nextRunFor(created, now);
    this.setNextRun(id, next);
    return this.get(id)!;
  }

  get(id: string): ScheduledTask | null {
    const row = this.db
      .prepare("SELECT * FROM scheduled_tasks WHERE id = ?")
      .get(id) as ScheduledTaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  list(): ScheduledTask[] {
    const rows = this.db
      .prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC")
      .all() as ScheduledTaskRow[];
    return rows.map(rowToTask);
  }

  update(id: string, patch: UpdateScheduledTaskInput): ScheduledTask | null {
    const existing = this.get(id);
    if (!existing) return null;

    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => {
      sets.push(`${col} = ?`);
      vals.push(v);
    };
    if (patch.name !== undefined) push("name", patch.name);
    if (patch.description !== undefined) push("description", patch.description);
    if (patch.prompt !== undefined) push("prompt", patch.prompt);
    if (patch.agentWorkspaceId !== undefined) push("agent_workspace_id", patch.agentWorkspaceId);
    if (patch.workingDir !== undefined) push("working_dir", patch.workingDir);
    if (patch.model !== undefined) push("model", patch.model);
    if (patch.permissionMode !== undefined) {
      push(
        "permission_mode",
        patch.permissionMode === "act-without-asking" ? "act-without-asking" : "ask",
      );
    }
    if (patch.frequency !== undefined) push("frequency", patch.frequency);
    if (patch.timeOfDay !== undefined) push("time_of_day", patch.timeOfDay);
    if (patch.weekday !== undefined) push("weekday", patch.weekday);
    if (patch.enabled !== undefined) push("enabled", patch.enabled ? 1 : 0);
    if (patch.allowedTools !== undefined) {
      push("allowed_tools_json", JSON.stringify(patch.allowedTools));
    }
    const now = Date.now();
    push("updated_at", now);
    this.db
      .prepare(`UPDATE scheduled_tasks SET ${sets.join(", ")} WHERE id = ?`)
      .run(...(vals as never[]), id);

    // Recompute next_run_at when the cadence-affecting fields changed.
    if (
      patch.frequency !== undefined ||
      patch.timeOfDay !== undefined ||
      patch.weekday !== undefined ||
      patch.enabled !== undefined
    ) {
      const updated = this.get(id)!;
      this.setNextRun(id, this.nextRunFor(updated, now));
    }
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
  }

  /** Cascade for agent deletion: unbind tasks (keep the tasks themselves). */
  unbindAgentWorkspace(agentWorkspaceId: string): void {
    this.db
      .prepare(
        "UPDATE scheduled_tasks SET agent_workspace_id = NULL, updated_at = ? WHERE agent_workspace_id = ?",
      )
      .run(Date.now(), agentWorkspaceId);
  }

  /** Tasks whose timer has elapsed — the scheduler fires these on each tick. */
  dueTasks(now: number): ScheduledTask[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?",
      )
      .all(now) as ScheduledTaskRow[];
    return rows.map(rowToTask);
  }

  /** After a fire: stamp last_run_at and roll next_run_at forward. Because
   *  computeNextRunAt always returns a time strictly after `now`, any windows
   *  missed while asleep collapse into a single catch-up fire. */
  advance(id: string, now: number): void {
    const task = this.get(id);
    if (!task) return;
    this.db
      .prepare("UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?")
      .run(now, id);
    this.setNextRun(id, this.nextRunFor({ ...task, lastRunAt: now }, now));
  }

  /** Boot safety: backfill next_run_at for enabled non-manual tasks that lost
   *  it (e.g. created before the column, or a crash between fire and advance). */
  armAll(now: number): void {
    for (const task of this.list()) {
      if (task.enabled && task.frequency !== "manual" && task.nextRunAt === null) {
        this.setNextRun(task.id, this.nextRunFor(task, now));
      }
    }
  }

  private setNextRun(id: string, next: number | null): void {
    this.db
      .prepare("UPDATE scheduled_tasks SET next_run_at = ? WHERE id = ?")
      .run(next, id);
  }
}

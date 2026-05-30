import { authedFetch } from "../sidecar-client";
import type {
  Frequency,
  SchedulePermissionMode,
  ScheduledRun,
  ScheduledTask,
} from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateScheduledTaskArgs {
  name: string;
  description?: string;
  prompt: string;
  frequency: Frequency;
  timeOfDay?: string | null;
  weekday?: number | null;
  agentWorkspaceId?: string | null;
  workingDir?: string | null;
  model?: string | null;
  permissionMode?: SchedulePermissionMode;
  enabled?: boolean;
  allowedTools?: string[];
}

export type UpdateScheduledTaskArgs = Partial<CreateScheduledTaskArgs>;

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const res = await authedFetch("/scheduled");
  return expectJson<ScheduledTask[]>(res);
}

export async function getScheduledTask(id: string): Promise<ScheduledTask> {
  const res = await authedFetch(`/scheduled/${id}`);
  return expectJson<ScheduledTask>(res);
}

export async function createScheduledTask(
  args: CreateScheduledTaskArgs,
): Promise<ScheduledTask> {
  const res = await authedFetch("/scheduled", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<ScheduledTask>(res);
}

export async function updateScheduledTask(
  id: string,
  patch: UpdateScheduledTaskArgs,
): Promise<ScheduledTask> {
  const res = await authedFetch(`/scheduled/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return expectJson<ScheduledTask>(res);
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const res = await authedFetch(`/scheduled/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

/** "Run now" — fire immediately, independent of the schedule. */
export async function runScheduledTaskNow(
  id: string,
): Promise<{ threadId: string; runId: string }> {
  const res = await authedFetch(`/scheduled/${id}/run`, { method: "POST" });
  return expectJson<{ threadId: string; runId: string }>(res);
}

export async function listScheduledRuns(id: string): Promise<ScheduledRun[]> {
  const res = await authedFetch(`/scheduled/${id}/runs`);
  return expectJson<ScheduledRun[]>(res);
}

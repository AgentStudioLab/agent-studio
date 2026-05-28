import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createScheduledTask,
  type CreateScheduledTaskArgs,
  deleteScheduledTask,
  getScheduledTask,
  listScheduledRuns,
  listScheduledTasks,
  runScheduledTaskNow,
  updateScheduledTask,
  type UpdateScheduledTaskArgs,
} from "./scheduled";

export const scheduledKeys = {
  all: ["scheduled"] as const,
  list: ["scheduled", "list"] as const,
  detail: (id: string) => ["scheduled", "detail", id] as const,
  runs: (id: string) => ["scheduled", "runs", id] as const,
};

export function useScheduledTasks() {
  return useQuery({
    queryKey: scheduledKeys.list,
    queryFn: () => listScheduledTasks(),
    staleTime: 5_000,
  });
}

export function useScheduledTask(id: string | null) {
  return useQuery({
    queryKey: scheduledKeys.detail(id ?? "__none__"),
    queryFn: () => getScheduledTask(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useScheduledRuns(id: string | null) {
  return useQuery({
    queryKey: scheduledKeys.runs(id ?? "__none__"),
    queryFn: () => listScheduledRuns(id!),
    enabled: !!id,
    // Poll so a freshly-fired "Run now" and any awaiting_approval flips show up
    // without a manual refresh.
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

function invalidateScheduled(
  qc: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  qc.invalidateQueries({ queryKey: scheduledKeys.list });
  if (id) {
    qc.invalidateQueries({ queryKey: scheduledKeys.detail(id) });
    qc.invalidateQueries({ queryKey: scheduledKeys.runs(id) });
  }
}

export function useCreateScheduledTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateScheduledTaskArgs) => createScheduledTask(args),
    onSuccess: () => invalidateScheduled(qc),
  });
}

export function useUpdateScheduledTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateScheduledTaskArgs }) =>
      updateScheduledTask(vars.id, vars.patch),
    onSuccess: (updated) => invalidateScheduled(qc, updated.id),
  });
}

export function useDeleteScheduledTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScheduledTask(id),
    onSuccess: () => invalidateScheduled(qc),
  });
}

export function useRunScheduledTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runScheduledTaskNow(id),
    onSuccess: (_data, id) => invalidateScheduled(qc, id),
  });
}

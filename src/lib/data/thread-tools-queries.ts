import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDefaultAllowedTools,
  setDefaultAllowedTools,
  getThreadAllowedToolsOverride,
  setThreadAllowedTools,
} from "./thread-tools";
import type { ThreadAllowedTools } from "./types";

export const toolsQueryKeys = {
  defaults: ["tools", "default"] as const,
  threadOverride: (id: string) => ["tools", "thread", id] as const,
};

export function useDefaultAllowedTools() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: toolsQueryKeys.defaults,
    queryFn: getDefaultAllowedTools,
    staleTime: 30_000,
  });
  const m = useMutation({
    mutationFn: setDefaultAllowedTools,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: toolsQueryKeys.defaults }); },
  });
  return { tools: q.data ?? [], isLoading: q.isLoading, setTools: m.mutate };
}

export function useThreadAllowedTools(threadId: string | null) {
  const qc = useQueryClient();
  const overrideQ = useQuery({
    queryKey: threadId ? toolsQueryKeys.threadOverride(threadId) : ["tools", "thread", "__none__"],
    queryFn: () => getThreadAllowedToolsOverride(threadId!),
    enabled: !!threadId,
    staleTime: 30_000,
  });
  const defaultsQ = useQuery({
    queryKey: toolsQueryKeys.defaults,
    queryFn: getDefaultAllowedTools,
    staleTime: 30_000,
  });
  const mutate = useMutation({
    mutationFn: (tools: string[] | null) => setThreadAllowedTools(threadId!, tools),
    onSuccess: () => {
      if (threadId) void qc.invalidateQueries({ queryKey: toolsQueryKeys.threadOverride(threadId) });
    },
  });

  const override = overrideQ.data ?? null;
  const resolved: ThreadAllowedTools = {
    tools: override ?? defaultsQ.data ?? [],
    overrideMode: override === null ? "global" : "custom",
  };
  return {
    ...resolved,
    isLoading: overrideQ.isLoading || defaultsQ.isLoading,
    setTools: mutate.mutate,
  };
}

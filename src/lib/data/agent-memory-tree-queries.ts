import { useQuery } from "@tanstack/react-query";
import { getAgentMemoryTree } from "./agent-memory-tree";

export const agentMemoryKeys = {
  tree: (agentId: string) => ["agents", "detail", agentId, "memory-tree"] as const,
};

export function useAgentMemoryTree(agentId: string | null, enabled = true) {
  return useQuery({
    queryKey: agentMemoryKeys.tree(agentId ?? "__none__"),
    queryFn: () => getAgentMemoryTree(agentId!),
    enabled: !!agentId && enabled,
    staleTime: 5_000,
  });
}

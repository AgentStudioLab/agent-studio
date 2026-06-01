import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemoryBlock } from "./types";
import {
  createAgentMemory,
  deleteAgentMemory,
  listAgentMemories,
} from "./agent-memories";

export const agentMemoryKeys = {
  list: (agentId: string) => ["agents", "detail", agentId, "memories"] as const,
};

export function useAgentMemories(agentId: string | null) {
  return useQuery({
    queryKey: agentMemoryKeys.list(agentId ?? "__none__"),
    queryFn: () => listAgentMemories(agentId!),
    enabled: !!agentId,
    staleTime: 5_000,
  });
}

export function useCreateAgentMemoryMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, block }: { content: string; block: MemoryBlock }) =>
      createAgentMemory(agentId, content, block),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentMemoryKeys.list(agentId) }),
  });
}

export function useDeleteAgentMemoryMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memId: string) => deleteAgentMemory(agentId, memId),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentMemoryKeys.list(agentId) }),
  });
}

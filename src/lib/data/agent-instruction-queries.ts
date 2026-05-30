import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAgentInstructions, putAgentInstructions } from "./agent-instructions";

export const agentInstructionKeys = {
  detail: (agentId: string) => ["agents", "detail", agentId, "instructions"] as const,
};

export function useAgentInstructions(agentId: string | null) {
  return useQuery({
    queryKey: agentInstructionKeys.detail(agentId ?? "__none__"),
    queryFn: () => getAgentInstructions(agentId!),
    enabled: !!agentId,
    staleTime: 5_000,
  });
}

export function useSaveAgentInstructionsMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => putAgentInstructions(agentId, content),
    onSuccess: (content) =>
      qc.setQueryData(agentInstructionKeys.detail(agentId), content),
  });
}

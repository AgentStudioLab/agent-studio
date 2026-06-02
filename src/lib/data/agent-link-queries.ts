import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAgentLinkArgs,
  createAgentLink,
  deleteAgentLink,
  listAgentLinks,
} from "./agent-links";

export const agentLinkKeys = {
  list: (agentId: string) => ["agents", "detail", agentId, "links"] as const,
};

export function useAgentLinks(agentId: string | null) {
  return useQuery({
    queryKey: agentLinkKeys.list(agentId ?? "__none__"),
    queryFn: () => listAgentLinks(agentId!),
    enabled: !!agentId,
    staleTime: 5_000,
  });
}

export function useCreateAgentLinkMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateAgentLinkArgs) => createAgentLink(agentId, args),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentLinkKeys.list(agentId) }),
  });
}

export function useDeleteAgentLinkMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => deleteAgentLink(agentId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentLinkKeys.list(agentId) }),
  });
}

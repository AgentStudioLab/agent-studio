import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAgentWorkspaceArgs,
  createAgentWorkspace,
  deleteAgentWorkspace,
  getAgentWorkspace,
  listAgentWorkspaces,
  type UpdateAgentWorkspaceArgs,
  updateAgentWorkspace,
} from "./agents";

export const agentKeys = {
  all: ["agents"] as const,
  list: ["agents", "list"] as const,
  detail: (id: string) => ["agents", "detail", id] as const,
};

export function useAgentWorkspaces() {
  return useQuery({
    queryKey: agentKeys.list,
    queryFn: () => listAgentWorkspaces(),
    staleTime: 5_000,
  });
}

export function useAgentWorkspace(id: string | null) {
  return useQuery({
    queryKey: agentKeys.detail(id ?? "__none__"),
    queryFn: () => getAgentWorkspace(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: agentKeys.list });
  if (id) qc.invalidateQueries({ queryKey: agentKeys.detail(id) });
}

export function useCreateAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateAgentWorkspaceArgs) => createAgentWorkspace(args),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateAgentWorkspaceArgs }) =>
      updateAgentWorkspace(vars.id, vars.patch),
    onSuccess: (a) => invalidate(qc, a.id),
  });
}

export function useDeleteAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentWorkspace(id),
    onSuccess: () => invalidate(qc),
  });
}

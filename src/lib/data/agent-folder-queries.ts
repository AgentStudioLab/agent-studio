import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAgentFolderArgs,
  createAgentFolder,
  deleteAgentFolder,
  getAgentFolderTree,
  listAgentFolders,
  setAgentFolderWritable,
} from "./agent-folders";

export const agentFolderKeys = {
  list: (agentId: string) => ["agents", "detail", agentId, "folders"] as const,
  tree: (agentId: string, folderId: string) =>
    ["agents", "detail", agentId, "folders", folderId, "tree"] as const,
};

export function useAgentFolders(agentId: string | null) {
  return useQuery({
    queryKey: agentFolderKeys.list(agentId ?? "__none__"),
    queryFn: () => listAgentFolders(agentId!),
    enabled: !!agentId,
    staleTime: 5_000,
  });
}

/** Folder file tree — fetched lazily (only when its block is expanded). */
export function useAgentFolderTree(
  agentId: string,
  folderId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: agentFolderKeys.tree(agentId, folderId),
    queryFn: () => getAgentFolderTree(agentId, folderId),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateAgentFolderMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateAgentFolderArgs) => createAgentFolder(agentId, args),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: agentFolderKeys.list(agentId) }),
  });
}

export function useSetAgentFolderWritableMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { folderId: string; writable: boolean }) =>
      setAgentFolderWritable(agentId, vars.folderId, vars.writable),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: agentFolderKeys.list(agentId) }),
  });
}

export function useDeleteAgentFolderMutation(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => deleteAgentFolder(agentId, folderId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: agentFolderKeys.list(agentId) }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveConversation,
  type ArchivedFilter,
  createConversation,
  type CreateConversationArgs,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  listPinned,
  listRecents,
  moveConversationToAgent,
  renameConversation,
  togglePin,
  updateConversationModel,
} from "./conversations";

export const queryKeys = {
  recents: ["conversations", "recents"] as const,
  pinned: ["conversations", "pinned"] as const,
  list: (filter: ArchivedFilter) => ["conversations", "list", filter] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (conversationId: string) =>
    ["conversations", conversationId, "messages"] as const,
};

let conversationModelMutationSeq = 0;
const latestConversationModelMutation = new Map<string, number>();

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.detail(id ?? "__none__"),
    queryFn: () => getConversation(id!),
    enabled: !!id,
    staleTime: 5_000,
    // Poll so the server-side auto-title (first-turn summary) shows up in the
    // open thread's header without a manual refetch.
    refetchInterval: 5_000,
  });
}

export function useRecentConversations(limit = 20, agentWorkspaceId?: string) {
  return useQuery({
    queryKey: [...queryKeys.recents, limit, agentWorkspaceId ?? null],
    queryFn: () => listRecents(limit, agentWorkspaceId),
    staleTime: 5_000,
    // Poll so the sidebar reflects server-side title changes (auto-title) and
    // newly-created conversations promptly.
    refetchInterval: 5_000,
  });
}

export function usePinnedConversations() {
  return useQuery({
    queryKey: queryKeys.pinned,
    queryFn: () => listPinned(),
    staleTime: 5_000,
  });
}

export function useConversationsList(filter: ArchivedFilter) {
  return useQuery({
    queryKey: queryKeys.list(filter),
    queryFn: () => listConversations(filter),
    staleTime: 5_000,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? "__none__"),
    queryFn: () => getMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
}

/** Invalidate every conversation listing (recents, pinned, all Tasks-page tabs). */
function invalidateConversationLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.recents });
  qc.invalidateQueries({ queryKey: queryKeys.pinned });
  qc.invalidateQueries({ queryKey: ["conversations", "list"] });
}

export function useTogglePinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) =>
      togglePin(vars.id, vars.pinned),
    onSuccess: () => invalidateConversationLists(qc),
  });
}

export function useArchiveConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; archived: boolean }) =>
      archiveConversation(vars.id, vars.archived),
    onSuccess: () => invalidateConversationLists(qc),
  });
}

export function useCreateConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateConversationArgs = {}) => createConversation(args),
    onSuccess: () => invalidateConversationLists(qc),
  });
}

export function useRenameConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      renameConversation(vars.id, vars.title),
    onSuccess: (updated) => {
      invalidateConversationLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.detail(updated.id) });
    },
  });
}

export function useDeleteConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => invalidateConversationLists(qc),
  });
}

export function useUpdateConversationModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; model: string | null }) =>
      updateConversationModel(vars.id, vars.model),
    onMutate: async (vars) => {
      const key = queryKeys.detail(vars.id);
      const mutationId = ++conversationModelMutationSeq;
      latestConversationModelMutation.set(vars.id, mutationId);
      await qc.cancelQueries({ queryKey: key });
      const previous =
        qc.getQueryData<Awaited<ReturnType<typeof getConversation>>>(key);
      qc.setQueryData(
        key,
        (current: Awaited<ReturnType<typeof getConversation>> | undefined) =>
          current ? { ...current, model: vars.model } : current,
      );
      return { previous, mutationId };
    },
    onError: (_err, vars, context) => {
      if (
        context?.previous &&
        latestConversationModelMutation.get(vars.id) === context.mutationId
      ) {
        qc.setQueryData(queryKeys.detail(vars.id), context.previous);
      }
    },
    onSuccess: (updated, vars, context) => {
      if (
        context &&
        latestConversationModelMutation.get(vars.id) === context.mutationId
      ) {
        qc.setQueryData(queryKeys.detail(updated.id), updated);
      }
    },
    onSettled: (_data, _error, vars, context) => {
      if (
        context &&
        latestConversationModelMutation.get(vars.id) === context.mutationId
      ) {
        latestConversationModelMutation.delete(vars.id);
      }
      qc.invalidateQueries({ queryKey: queryKeys.detail(vars.id) });
    },
  });
}

export function useMoveConversationToAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; agentWorkspaceId: string | null }) =>
      moveConversationToAgent(vars.id, vars.agentWorkspaceId),
    onSuccess: (updated) => {
      invalidateConversationLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.detail(updated.id) });
    },
  });
}

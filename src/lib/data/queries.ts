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
  renameConversation,
  togglePin,
} from "./conversations";

export const queryKeys = {
  recents: ["conversations", "recents"] as const,
  pinned: ["conversations", "pinned"] as const,
  list: (filter: ArchivedFilter) => ["conversations", "list", filter] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (conversationId: string) =>
    ["conversations", conversationId, "messages"] as const,
};

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.detail(id ?? "__none__"),
    queryFn: () => getConversation(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useRecentConversations(limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.recents, limit],
    queryFn: () => listRecents(limit),
    staleTime: 5_000,
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

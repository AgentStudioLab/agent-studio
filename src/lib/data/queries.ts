import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConversation,
  type CreateConversationArgs,
  deleteConversation,
  getMessages,
  listPinned,
  listRecents,
  renameConversation,
  togglePin,
} from "./conversations";

/**
 * Central query-key factory. Use these everywhere instead of hand-written
 * arrays so invalidations stay aligned with reads.
 */
export const queryKeys = {
  recents: ["conversations", "recents"] as const,
  pinned: ["conversations", "pinned"] as const,
  messages: (conversationId: string) =>
    ["conversations", conversationId, "messages"] as const,
};

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

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? "__none__"),
    queryFn: () => getMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
}

export function useTogglePinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) =>
      togglePin(vars.id, vars.pinned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recents });
      qc.invalidateQueries({ queryKey: queryKeys.pinned });
    },
  });
}

export function useCreateConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateConversationArgs) => createConversation(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recents });
    },
  });
}

export function useRenameConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      renameConversation(vars.id, vars.title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recents });
      qc.invalidateQueries({ queryKey: queryKeys.pinned });
    },
  });
}

export function useDeleteConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recents });
      qc.invalidateQueries({ queryKey: queryKeys.pinned });
    },
  });
}

/**
 * Helper for the SSE streaming finally block — call after a turn completes to
 * refresh the persisted messages + sidebar.
 */
export function useInvalidateAfterTurn() {
  const qc = useQueryClient();
  return (conversationId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    qc.invalidateQueries({ queryKey: queryKeys.recents });
  };
}

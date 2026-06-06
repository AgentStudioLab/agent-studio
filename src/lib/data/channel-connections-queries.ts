import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disableChannelConnection,
  enableChannelConnection,
  getWeixinLoginStatus,
  listChannelConnections,
  sendFakeChannelIncoming,
  startWeixinLogin,
  updateChannelConnection,
} from "./channel-connections";

export const channelConnectionKeys = {
  all: ["channel-connections"] as const,
  weixinLogin: (id: string | null) => ["channel-connections", "weixin-login", id] as const,
};

export function useChannelConnections() {
  return useQuery({
    queryKey: channelConnectionKeys.all,
    queryFn: listChannelConnections,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useChannelConnectionActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: channelConnectionKeys.all });
  return {
    update: useMutation({
      mutationFn: (vars: Parameters<typeof updateChannelConnection>) =>
        updateChannelConnection(vars[0], vars[1]),
      onSuccess: invalidate,
    }),
    enable: useMutation({
      mutationFn: enableChannelConnection,
      onSuccess: invalidate,
    }),
    disable: useMutation({
      mutationFn: disableChannelConnection,
      onSuccess: invalidate,
    }),
    fakeIncoming: useMutation({
      mutationFn: (vars: Parameters<typeof sendFakeChannelIncoming>) =>
        sendFakeChannelIncoming(vars[0], vars[1]),
      onSuccess: invalidate,
    }),
  };
}

export function useWeixinLogin() {
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: startWeixinLogin,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: channelConnectionKeys.all });
    },
  });
  const loginId = start.data?.loginId ?? null;
  const status = useQuery({
    queryKey: channelConnectionKeys.weixinLogin(loginId),
    queryFn: () => getWeixinLoginStatus(loginId!),
    enabled: !!loginId,
    refetchInterval: (query) =>
      query.state.data?.status === "confirmed" || query.state.data?.status === "error"
        ? false
        : 2_000,
  });
  return { start, status: status.data ?? null };
}

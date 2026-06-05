import { fetchSidecar } from "../sidecar-client";

export type ChannelType = "fake" | "weixin" | "dingtalk" | "lark" | "qq" | "wecom" | "telegram" | "discord";
export type ChannelStatus = "stopped" | "waiting_qr" | "scanned" | "running" | "error";

export interface ChannelConnection {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  status: ChannelStatus;
  config: {
    permissionStrategy: "auto_execute";
    defaultAgentId?: string;
    defaultWorkspace?: string;
    [key: string]: unknown;
  };
  errorMsg?: string | null;
}

export type WeixinLoginStatus =
  | { status: "waiting"; qrUrl?: string; qrData?: string }
  | { status: "scanned"; qrUrl?: string; qrData?: string }
  | { status: "confirmed"; connectionId: string }
  | { status: "error"; error: string };

async function parseJson<T>(res: Response, code: string): Promise<T> {
  if (!res.ok) throw new Error(`${code}_${res.status}`);
  return (await res.json()) as T;
}

export async function listChannelConnections(): Promise<ChannelConnection[]> {
  const res = await fetchSidecar("/channels/connections");
  const json = await parseJson<{ connections: ChannelConnection[] }>(res, "channels_list");
  return json.connections;
}

export async function updateChannelConnection(
  id: string,
  patch: { name?: string; enabled?: boolean; config?: Partial<ChannelConnection["config"]> },
): Promise<ChannelConnection> {
  const res = await fetchSidecar(`/channels/connections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = await parseJson<{ connection: ChannelConnection }>(res, "channels_update");
  return json.connection;
}

export async function enableChannelConnection(id: string): Promise<ChannelConnection> {
  const res = await fetchSidecar(`/channels/connections/${id}/enable`, { method: "POST" });
  const json = await parseJson<{ connection: ChannelConnection }>(res, "channels_enable");
  return json.connection;
}

export async function disableChannelConnection(id: string): Promise<ChannelConnection> {
  const res = await fetchSidecar(`/channels/connections/${id}/disable`, { method: "POST" });
  const json = await parseJson<{ connection: ChannelConnection }>(res, "channels_disable");
  return json.connection;
}

export async function startWeixinLogin(): Promise<{ loginId: string }> {
  const res = await fetchSidecar("/channels/weixin/login/start", { method: "POST" });
  return parseJson<{ loginId: string }>(res, "weixin_login_start");
}

export async function getWeixinLoginStatus(loginId: string): Promise<WeixinLoginStatus> {
  const res = await fetchSidecar(`/channels/weixin/login/${loginId}/status`);
  const json = await parseJson<{ status: WeixinLoginStatus }>(res, "weixin_login_status");
  return json.status;
}

export async function sendFakeChannelIncoming(
  id: string,
  body: {
    chatId: string;
    senderId: string;
    text?: string;
    attachments?: Array<{ type: "file" | "image"; path: string; name: string }>;
  },
): Promise<void> {
  const res = await fetchSidecar(`/channels/fake/${id}/incoming`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await parseJson<unknown>(res, "channels_fake_incoming");
}

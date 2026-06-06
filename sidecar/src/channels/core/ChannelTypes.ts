export type ChannelType =
  | "fake"
  | "weixin"
  | "dingtalk"
  | "lark"
  | "qq"
  | "wecom"
  | "telegram"
  | "discord";

export type ChannelConnectionStatus =
  | "stopped"
  | "waiting_qr"
  | "scanned"
  | "running"
  | "error";

export type ChannelPermissionStrategy = "auto_execute";

export type RemoteTaskStatus =
  | "awaiting_file"
  | "awaiting_instruction"
  | "running"
  | "completed"
  | "failed";

export type RemoteTaskReplyState = "pending" | "sent" | "failed" | "manual_check";

export interface ChannelConnectionConfig {
  permissionStrategy: ChannelPermissionStrategy;
  defaultAgentId?: string;
  defaultWorkspace?: string;
  [key: string]: unknown;
}

export interface ChannelConnection {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  status: ChannelConnectionStatus;
  config: ChannelConnectionConfig;
  lastConnectedAt: number | null;
  errorMsg: string | null;
  createdAt: number;
  updatedAt: number;
  credentials?: Record<string, unknown>;
}

export interface ChannelSession {
  id: string;
  connectionId: string;
  channelType: ChannelType;
  chatId: string;
  senderId: string;
  displayName: string | null;
  conversationId: string;
  activeTaskId: string | null;
  createdAt: number;
  updatedAt: number;
}

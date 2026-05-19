/**
 * Thread = conversation. The new AG-UI-style backend treats it as opaque
 * metadata (title/pin/projectId/timestamps); message content + tool calls
 * are surfaced through the agui runtime, not these REST types.
 */
export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

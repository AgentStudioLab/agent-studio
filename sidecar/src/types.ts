export type ContentBlock = { type: "text"; text: string };

export type ConversationMode = "ask" | "agent";
export type ConversationStatus = "active" | "done" | "failed" | "aborted";
export type FinishReason = "end_turn" | "aborted" | "error" | null;
export type MessageRole = "user" | "assistant";

export interface Conversation {
  id: string;
  title: string;
  agentWorkspaceId: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  blocks: ContentBlock[];
  createdAt: number;
  finishReason: FinishReason;
  errorText: string | null;
}

export interface CreateConversationInput {
  prompt: string;
  agentWorkspaceId?: string | null;
  mode: ConversationMode;
}

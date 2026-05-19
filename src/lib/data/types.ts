export type ContentBlock = { type: "text"; text: string };

export type ConversationMode = "ask" | "agent";
export type ConversationStatus = "active" | "done" | "failed" | "aborted";
export type FinishReason = "end_turn" | "aborted" | "error" | null;

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  createdAt: number;
  finishReason: FinishReason;
  errorText: string | null;
}

export type SseEvent =
  | { event: "message-start"; data: { messageId: string; role: "assistant" } }
  | { event: "text-delta"; data: { messageId: string; blockIndex: number; text: string } }
  | { event: "message-stop"; data: { messageId: string; finishReason: "end_turn" } }
  | { event: "error"; data: { code: string; message: string } }
  | { event: "aborted"; data: { messageId: string } };

import { fetchSidecar } from "../sidecar-client";
import { fetchSseStream } from "./sse";
import type { Conversation, ConversationMode, Message, SseEvent } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as { error?: string };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateConversationArgs {
  prompt: string;
  projectId?: string | null;
  mode: ConversationMode;
}

export async function createConversation(args: CreateConversationArgs): Promise<Conversation> {
  const res = await fetchSidecar("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<Conversation>(res);
}

export async function listRecents(limit = 20): Promise<Conversation[]> {
  const res = await fetchSidecar(`/conversations?limit=${limit}`);
  return expectJson<Conversation[]>(res);
}

export async function listPinned(): Promise<Conversation[]> {
  const res = await fetchSidecar(`/conversations?limit=100&pinned=true`);
  return expectJson<Conversation[]>(res);
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`);
  return expectJson<Conversation>(res);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetchSidecar(`/conversations/${conversationId}/messages`);
  return expectJson<Message[]>(res);
}

export async function togglePin(id: string, pinned: boolean): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  return expectJson<Conversation>(res);
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const res = await fetchSidecar(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return expectJson<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetchSidecar(`/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

/** 返回 SSE 事件迭代器。调用方持有 AbortController 控制取消。 */
export function sendMessage(
  conversationId: string,
  text: string,
  signal: AbortSignal,
): AsyncIterable<SseEvent> {
  return fetchSseStream(`/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
}

/** 服务端 abort（与客户端 AbortController 配对调用）。 */
export async function abortStream(conversationId: string): Promise<void> {
  const res = await fetchSidecar(`/conversations/${conversationId}/abort`, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`abort_failed_${res.status}`);
  }
}

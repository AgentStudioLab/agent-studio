import { authedFetch } from "../sidecar-client";
import type { Conversation } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateConversationArgs {
  title?: string;
  agentWorkspaceId?: string | null;
  workingDir?: string | null;
  model?: string | null;
}

export async function updateWorkingDir(
  id: string,
  workingDir: string | null,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workingDir }),
  });
  return expectJson<Conversation>(res);
}

export async function updateConversationModel(
  id: string,
  model: string | null,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  return expectJson<Conversation>(res);
}

export async function createConversation(
  args: CreateConversationArgs = {},
): Promise<Conversation> {
  const res = await authedFetch("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<Conversation>(res);
}

export async function listRecents(
  limit = 20,
  agentWorkspaceId?: string,
): Promise<Conversation[]> {
  const q = agentWorkspaceId
    ? `?limit=${limit}&agentWorkspaceId=${encodeURIComponent(agentWorkspaceId)}`
    : `?limit=${limit}`;
  const res = await authedFetch(`/conversations${q}`);
  return expectJson<Conversation[]>(res);
}

export type ArchivedFilter = "active" | "archived" | "all";

/** Full task list for the Tasks page. `archived` selects the tab. */
export async function listConversations(
  filter: ArchivedFilter = "active",
  limit = 100,
): Promise<Conversation[]> {
  const res = await authedFetch(
    `/conversations?limit=${limit}&archived=${filter}`,
  );
  return expectJson<Conversation[]>(res);
}

export async function listPinned(): Promise<Conversation[]> {
  const res = await authedFetch(`/conversations?limit=100&pinned=true`);
  return expectJson<Conversation[]>(res);
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`);
  return expectJson<Conversation>(res);
}

/**
 * Turn-grouped history. Each entry is either a user turn (single content) or
 * an assistant turn with ordered `blocks` (text/reasoning/tool_call/notice).
 * Shape matches the agui runtime's `buildViewMessages` input.
 */
export async function getMessages(conversationId: string): Promise<unknown[]> {
  const res = await authedFetch(`/conversations/${conversationId}/messages`);
  return expectJson<unknown[]>(res);
}

export async function togglePin(
  id: string,
  pinned: boolean,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  return expectJson<Conversation>(res);
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return expectJson<Conversation>(res);
}

export async function archiveConversation(
  id: string,
  archived: boolean,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  return expectJson<Conversation>(res);
}

/** Move a conversation into an agent space (or out, with null). Backend
 *  re-resolves working_dir to the agent's home. */
export async function moveConversationToAgent(
  id: string,
  agentWorkspaceId: string | null,
): Promise<Conversation> {
  const res = await authedFetch(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentWorkspaceId }),
  });
  return expectJson<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await authedFetch(`/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

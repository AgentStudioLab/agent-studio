import { authedFetch } from "../sidecar-client";
import type { AgentLink } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateAgentLinkArgs {
  url: string;
  title?: string;
}

export async function listAgentLinks(agentId: string): Promise<AgentLink[]> {
  const res = await authedFetch(`/agents/${agentId}/links`);
  return expectJson<AgentLink[]>(res);
}

export async function createAgentLink(
  agentId: string,
  args: CreateAgentLinkArgs,
): Promise<AgentLink> {
  const res = await authedFetch(`/agents/${agentId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<AgentLink>(res);
}

export async function deleteAgentLink(agentId: string, linkId: string): Promise<void> {
  const res = await authedFetch(`/agents/${agentId}/links/${linkId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

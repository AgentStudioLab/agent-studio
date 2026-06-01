import { authedFetch } from "../sidecar-client";
import type { AgentWorkspace } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateAgentWorkspaceArgs {
  name: string;
  avatar?: string | null;
}
export type UpdateAgentWorkspaceArgs = Partial<CreateAgentWorkspaceArgs> & {
  archived?: boolean;
  pinned?: boolean;
};

export async function listAgentWorkspaces(): Promise<AgentWorkspace[]> {
  const res = await authedFetch("/agents");
  return expectJson<AgentWorkspace[]>(res);
}

export async function getAgentWorkspace(id: string): Promise<AgentWorkspace> {
  const res = await authedFetch(`/agents/${id}`);
  return expectJson<AgentWorkspace>(res);
}

export async function createAgentWorkspace(
  args: CreateAgentWorkspaceArgs,
): Promise<AgentWorkspace> {
  const res = await authedFetch("/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<AgentWorkspace>(res);
}

export async function updateAgentWorkspace(
  id: string,
  patch: UpdateAgentWorkspaceArgs,
): Promise<AgentWorkspace> {
  const res = await authedFetch(`/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return expectJson<AgentWorkspace>(res);
}

export async function deleteAgentWorkspace(id: string): Promise<void> {
  const res = await authedFetch(`/agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

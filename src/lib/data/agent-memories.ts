import { authedFetch } from "../sidecar-client";
import type { AgentMemory, MemoryBlock } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listAgentMemories(agentId: string): Promise<AgentMemory[]> {
  const res = await authedFetch(`/agents/${agentId}/memories`);
  return expectJson<AgentMemory[]>(res);
}

export async function createAgentMemory(
  agentId: string,
  content: string,
  block: MemoryBlock,
): Promise<AgentMemory> {
  const res = await authedFetch(`/agents/${agentId}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, block }),
  });
  return expectJson<AgentMemory>(res);
}

export async function deleteAgentMemory(
  agentId: string,
  memId: string,
): Promise<void> {
  const res = await authedFetch(`/agents/${agentId}/memories/${memId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

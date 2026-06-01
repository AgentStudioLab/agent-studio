import { authedFetch } from "../sidecar-client";

export interface MemoryTreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: MemoryTreeNode[];
}

export async function getAgentMemoryTree(agentId: string): Promise<MemoryTreeNode[]> {
  const res = await authedFetch(`/agents/${agentId}/memory/tree`);
  if (!res.ok) throw new Error(`GET memory tree failed: ${res.status}`);
  return (await res.json()) as MemoryTreeNode[];
}

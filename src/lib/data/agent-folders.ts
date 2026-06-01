import { authedFetch } from "../sidecar-client";
import type { AgentFolder } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateAgentFolderArgs {
  path: string;
  folderName?: string;
  writable?: boolean;
}

export interface FolderTreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: FolderTreeNode[];
}

export interface FolderTree {
  folderId: string;
  tree: FolderTreeNode[];
  truncated: boolean;
}

export async function getAgentFolderTree(
  agentId: string,
  folderId: string,
): Promise<FolderTree> {
  const res = await authedFetch(`/agents/${agentId}/folders/${folderId}/tree`);
  return expectJson<FolderTree>(res);
}

export async function listAgentFolders(agentId: string): Promise<AgentFolder[]> {
  const res = await authedFetch(`/agents/${agentId}/folders`);
  return expectJson<AgentFolder[]>(res);
}

export async function createAgentFolder(
  agentId: string,
  args: CreateAgentFolderArgs,
): Promise<AgentFolder> {
  const res = await authedFetch(`/agents/${agentId}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<AgentFolder>(res);
}

export async function setAgentFolderWritable(
  agentId: string,
  folderId: string,
  writable: boolean,
): Promise<AgentFolder> {
  const res = await authedFetch(`/agents/${agentId}/folders/${folderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ writable }),
  });
  return expectJson<AgentFolder>(res);
}

export async function deleteAgentFolder(
  agentId: string,
  folderId: string,
): Promise<void> {
  const res = await authedFetch(`/agents/${agentId}/folders/${folderId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}

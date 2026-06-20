import { authedFetch } from "../sidecar-client";
import type { AgentCoverImage, AgentFunctionCategory, AgentWorkspace } from "./types";

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
  category?: AgentFunctionCategory | null;
  coverImage?: AgentCoverImage | null;
  instructions?: string | null;
}
export type UpdateAgentWorkspaceArgs = Partial<
  Omit<CreateAgentWorkspaceArgs, "instructions">
> & {
  archived?: boolean;
  pinned?: boolean;
  /** null=继承全部；数组=显式子集（含空数组=显式不挂）；省略=不改。 */
  mountedSkills?: string[] | null;
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

/** 把某个 agent（内置或普通）的定义克隆成一个新的、可编辑的用户 agent。
 *  只复制定义（指令 + 挂载技能），不复制记忆/对话/文件空间。 */
export async function cloneAgentWorkspace(id: string): Promise<AgentWorkspace> {
  const res = await authedFetch(`/agents/${id}/clone`, { method: "POST" });
  return expectJson<AgentWorkspace>(res);
}

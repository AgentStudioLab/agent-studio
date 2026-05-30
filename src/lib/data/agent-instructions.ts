import { authedFetch } from "../sidecar-client";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

/** The agent's instructions = its `<home>/CLAUDE.md` file. */
export async function getAgentInstructions(agentId: string): Promise<string> {
  const res = await authedFetch(`/agents/${agentId}/instructions`);
  return (await expectJson<{ content: string }>(res)).content;
}

export async function putAgentInstructions(
  agentId: string,
  content: string,
): Promise<string> {
  const res = await authedFetch(`/agents/${agentId}/instructions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return (await expectJson<{ content: string }>(res)).content;
}

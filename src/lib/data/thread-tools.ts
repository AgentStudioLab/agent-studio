import { authedFetch } from "../sidecar-client";

export async function getDefaultAllowedTools(): Promise<string[]> {
  const res = await authedFetch("/settings/allowed-tools");
  if (!res.ok) throw new Error(`getDefaultAllowedTools failed: ${res.status}`);
  return ((await res.json()) as { tools: string[] }).tools;
}

export async function setDefaultAllowedTools(tools: string[]): Promise<void> {
  const res = await authedFetch("/settings/allowed-tools", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) throw new Error(`setDefaultAllowedTools failed: ${res.status}`);
}

export async function getThreadAllowedToolsOverride(threadId: string): Promise<string[] | null> {
  const res = await authedFetch(`/conversations/${threadId}/allowed-tools`);
  if (!res.ok) throw new Error(`getThreadAllowedTools failed: ${res.status}`);
  return ((await res.json()) as { tools: string[] | null }).tools;
}

export async function setThreadAllowedTools(threadId: string, tools: string[] | null): Promise<void> {
  const res = await authedFetch(`/conversations/${threadId}/allowed-tools`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools }),
  });
  if (!res.ok) throw new Error(`setThreadAllowedTools failed: ${res.status}`);
}

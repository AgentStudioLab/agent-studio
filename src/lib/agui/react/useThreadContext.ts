import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface ContextSkill {
  id: string;
  name: string;
  description: string;
  color?: string;
}

export interface ContextMcpServer {
  name: string;
  description: string;
  connected: boolean;
}

export interface ThreadContext {
  skills: ContextSkill[];
  mcpServers: ContextMcpServer[];
}

const EMPTY_CONTEXT: ThreadContext = { skills: [], mcpServers: [] };

/**
 * Fetch the SDK runtime capabilities (skills + mcp servers) for a thread.
 * Backed by GET /threads/:id/context on the sidecar; that route reads the
 * in-memory SessionMetadataStore populated by bridge.ts on system.init.
 *
 * Returns EMPTY_CONTEXT when threadId is missing or when the route
 * answers 200 with empty arrays (thread not started, sidecar restarted
 * since last Run, etc).
 */
export function useThreadContext(threadId: string | null | undefined): {
  context: ThreadContext;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery<ThreadContext>({
    enabled: Boolean(threadId),
    queryKey: ["thread-context", threadId],
    queryFn: async () => {
      const res = await fetchSidecar(`/threads/${threadId}/context`);
      if (!res.ok) throw new Error(`thread-context ${res.status}`);
      return (await res.json()) as ThreadContext;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    context: query.data ?? EMPTY_CONTEXT,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

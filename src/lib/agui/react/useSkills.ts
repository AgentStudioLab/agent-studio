import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface SkillView {
  id: string;
  name: string;
  description: string;
  source: "personal" | "builtin";
  sourcePath: string;
  enabled: boolean;
}

interface SkillsResponse {
  skills: SkillView[];
}

const EMPTY: SkillView[] = [];

/**
 * Customize > Skills data hook. GET /skills on mount, PATCH on toggle with
 * optimistic update. Backed by sidecar `skillRegistry` (Personal scans
 * ~/.agent-studio/skills + ~/.claude/skills; Built-in from project-shipped
 * built-in/ plugin).
 *
 * Lifecycle: skills are discovered once when the sidecar boots — there is
 * no hot-reload. Adding/removing a skill folder requires a sidecar restart.
 * staleTime: Infinity matches that contract; React Query never refetches in
 * the background. A successful PATCH invalidates the cache so the toggle
 * state pulled back from server matches what we optimistically set.
 */
export function useSkills(): {
  skills: SkillView[];
  isLoading: boolean;
  error: Error | null;
  setEnabled: (id: string, enabled: boolean) => void;
  isMutating: boolean;
} {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<SkillsResponse>({
    queryKey: ["skills"],
    queryFn: async () => {
      const r = await fetchSidecar("/skills");
      if (!r.ok) throw new Error(`GET /skills ${r.status}`);
      return r.json();
    },
    staleTime: Infinity,
  });

  const mutation = useMutation<
    void,
    Error,
    { id: string; enabled: boolean },
    { prev?: SkillsResponse }
  >({
    mutationFn: async ({ id, enabled }) => {
      const r = await fetchSidecar(`/skills/${encodeURIComponent(id)}/enabled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`PATCH /skills failed: ${r.status}`);
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: ["skills"] });
      const prev = qc.getQueryData<SkillsResponse>(["skills"]);
      if (prev) {
        qc.setQueryData<SkillsResponse>(["skills"], {
          skills: prev.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["skills"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  return {
    skills: data?.skills ?? EMPTY,
    isLoading,
    error: (error as Error | null) ?? null,
    setEnabled: (id, enabled) => mutation.mutate({ id, enabled }),
    isMutating: mutation.isPending,
  };
}

import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface SkillTreeNode {
  /** Relative path from the skill directory, POSIX-style separators. */
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: SkillTreeNode[];
}

export interface SkillTree {
  skillId: string;
  /** Basename of the skill directory — useful as the tree's top-level label. */
  root: string;
  tree: SkillTreeNode[];
  truncated: boolean;
}

export interface SkillFileContent {
  content: string;
  encoding: "utf8" | "base64";
  size: number;
}

/**
 * Fetch the recursive file listing of a personal skill. Built-in skills 403
 * on the backend, so callers should only enable this when source==="personal".
 */
export function useSkillTree(skillId: string | null | undefined) {
  return useQuery<SkillTree>({
    enabled: Boolean(skillId),
    queryKey: ["skill-tree", skillId],
    queryFn: async () => {
      const res = await fetchSidecar(
        `/skills/${encodeURIComponent(skillId!)}/tree`,
      );
      if (!res.ok) throw new Error(`skill-tree ${res.status}`);
      return (await res.json()) as SkillTree;
    },
    // The tree only changes when the user edits files outside the app, which
    // is rare. Refetch when the user re-opens the panel; otherwise serve from
    // cache to keep clicks instant.
    staleTime: 30_000,
  });
}

/**
 * Fetch a single file's content from a personal skill. Path is relative to
 * the skill directory; the backend enforces the boundary.
 */
export function useSkillFileContent(
  skillId: string | null | undefined,
  relPath: string | null | undefined,
) {
  return useQuery<SkillFileContent>({
    enabled: Boolean(skillId && relPath),
    queryKey: ["skill-file", skillId, relPath],
    queryFn: async () => {
      const res = await fetchSidecar(
        `/skills/${encodeURIComponent(skillId!)}/files?path=${encodeURIComponent(relPath!)}`,
      );
      if (!res.ok) throw new Error(`skill-file ${res.status}`);
      return (await res.json()) as SkillFileContent;
    },
    staleTime: 30_000,
  });
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";
import {
  deriveTouchedFiles,
  type TouchedFile,
} from "../runtime/derivations";
import type { ChatState } from "../runtime/types";

/**
 * Derive the files the agent has touched in this thread (cross-Run),
 * filtered to paths inside `workingDir`. Pure useMemo wrapper.
 *
 * Caller responsibility: pass the SAME `state` object that TaskView's
 * `useChat` returned. We do NOT call `useChat` internally — that would
 * create an independent runtime with empty messages.
 *
 * Returns `{ files: [] }` when state is null (no thread active) or when
 * the agent hasn't touched any files in the working directory yet.
 *
 * 磁盘存在性过滤：事件推导出的列表不感知磁盘状态 —— 用户在 Finder 删掉
 * 文件后列表仍会显示、点进去才报「文件不存在」。这里在推导之后用
 * POST /files/exists 批量校验一次，已删除的文件直接从列表消失。
 *   - 校验结果返回前先显示完整推导列表（不闪空）；
 *   - 请求失败（如 Storybook / sidecar 未起）也回退到完整列表；
 *   - staleTime 短 + 窗口聚焦重校验：在 Finder 删完切回应用即生效。
 */
export function useThreadFiles(
  state: ChatState | null,
  workingDir: string | null | undefined,
): { files: TouchedFile[] } {
  const derived = useMemo(
    () => (state ? deriveTouchedFiles(state, workingDir ?? null) : []),
    [state, workingDir],
  );

  const paths = useMemo(() => derived.map((f) => f.absolutePath), [derived]);
  // queryKey 用拼接串：路径集合变化（新文件落盘 / run 产出）即触发重校验
  const pathsKey = paths.join("\n");

  const existsQuery = useQuery<Set<string>>({
    enabled: Boolean(workingDir) && paths.length > 0,
    queryKey: ["files-exists", workingDir, pathsKey],
    queryFn: async () => {
      const res = await fetchSidecar("/files/exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: workingDir, paths }),
      });
      if (!res.ok) throw new Error(`files/exists status ${res.status}`);
      const body = (await res.json()) as { existing: string[] };
      return new Set(body.existing);
    },
    staleTime: 3_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const files = useMemo(() => {
    // 校验未完成（首拉中）或失败 → 不过滤，保持原列表
    if (!existsQuery.data) return derived;
    return derived.filter((f) => existsQuery.data.has(f.absolutePath));
  }, [derived, existsQuery.data]);

  return { files };
}

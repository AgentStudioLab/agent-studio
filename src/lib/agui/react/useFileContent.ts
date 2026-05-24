import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface FileContentBody {
  content: string;
  encoding: "utf8" | "base64";
  size: number;
}

export type FileContentError =
  | { kind: "missing_param" }
  | { kind: "outside_workspace" }
  | { kind: "not_found" }
  | { kind: "too_large"; size: number }
  | { kind: "read_failed"; detail: string };

/**
 * Fetch a file's contents from sidecar `GET /files/content`. Sandboxed to
 * the given `workingDir` — passing a path outside cwd returns
 * { kind: "outside_workspace" }.
 *
 * Result is cached by (absolutePath, workingDir) and never auto-refetches.
 * Caller can `queryClient.invalidateQueries(["file-content", path])` to
 * force a re-read (the PreviewPane refresh button).
 */
export function useFileContent(
  absolutePath: string | null,
  workingDir: string | null,
): {
  data: FileContentBody | null;
  error: FileContentError | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const enabled = Boolean(absolutePath && workingDir);
  const query = useQuery<FileContentBody, FileContentError>({
    enabled,
    queryKey: ["file-content", absolutePath, workingDir],
    queryFn: async () => {
      const url = `/files/content?path=${encodeURIComponent(absolutePath!)}&cwd=${encodeURIComponent(workingDir!)}`;
      const res = await fetchSidecar(url);
      if (res.ok) {
        return (await res.json()) as FileContentBody;
      }
      // Map server errors to typed FileContentError.
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const errorMsg = typeof body.error === "string" ? body.error : "";
      if (res.status === 400) throw { kind: "missing_param" } as FileContentError;
      if (res.status === 403) throw { kind: "outside_workspace" } as FileContentError;
      if (res.status === 404) throw { kind: "not_found" } as FileContentError;
      if (res.status === 413) {
        const size = typeof body.size === "number" ? body.size : 0;
        throw { kind: "too_large", size } as FileContentError;
      }
      throw { kind: "read_failed", detail: errorMsg || `status ${res.status}` } as FileContentError;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    data: query.data ?? null,
    error: (query.error as FileContentError | null) ?? null,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

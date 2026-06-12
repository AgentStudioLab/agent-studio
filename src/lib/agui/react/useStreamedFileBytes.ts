import { useEffect, useState } from "react";
import { fetchSidecar } from "@/lib/sidecar-client";
import type { FileContentError } from "@/lib/agui/react/useFileContent";

/**
 * 流式拉取文件原始字节 — rich 文档预览（pdf/docx/xlsx）专用。
 *
 * 与 useFileContent 的差异：
 *   - 走 GET /files/raw（原始字节、100 MiB 上限），不经 base64；
 *   - 用 ReadableStream 按块读取，依 Content-Length 报告下载进度；
 *   - 不进 React Query 缓存 —— 大 ArrayBuffer 常驻缓存会白占内存，
 *     重新打开同一文件重拉即可（本地回环传输，代价可忽略）。
 *
 * 错误形状复用 useFileContent 的 FileContentError，PreviewBody 的
 * 错误文案映射两边通用。
 */

export interface StreamedBytesState {
  /** 下载完成后的完整文件字节；加载中 / 出错时为 null。 */
  bytes: ArrayBuffer | null;
  error: FileContentError | null;
  isLoading: boolean;
  /** 0–100 的整数下载百分比；无 Content-Length 时保持 null（不确定态）。 */
  progress: number | null;
}

export function useStreamedFileBytes(
  absolutePath: string | null,
  workingDir: string | null,
  /** 自增即触发重新下载（PreviewPane 刷新按钮）。 */
  reloadNonce = 0,
): StreamedBytesState {
  const [state, setState] = useState<StreamedBytesState>({
    bytes: null,
    error: null,
    isLoading: false,
    progress: null,
  });

  useEffect(() => {
    if (!absolutePath || !workingDir) {
      setState({ bytes: null, error: null, isLoading: false, progress: null });
      return;
    }

    const controller = new AbortController();
    setState({ bytes: null, error: null, isLoading: true, progress: null });

    void (async () => {
      try {
        const url = `/files/raw?path=${encodeURIComponent(absolutePath)}&cwd=${encodeURIComponent(workingDir)}`;
        const res = await fetchSidecar(url, { signal: controller.signal });

        if (!res.ok) {
          // 与 useFileContent 相同的状态码 → FileContentError 映射
          const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          let error: FileContentError;
          if (res.status === 400) error = { kind: "missing_param" };
          else if (res.status === 403) error = { kind: "outside_workspace" };
          else if (res.status === 404) error = { kind: "not_found" };
          else if (res.status === 413) {
            error = {
              kind: "too_large",
              size: typeof body.size === "number" ? body.size : 0,
            };
          } else {
            const detail = typeof body.error === "string" ? body.error : `status ${res.status}`;
            error = { kind: "read_failed", detail };
          }
          if (!controller.signal.aborted) {
            setState({ bytes: null, error, isLoading: false, progress: null });
          }
          return;
        }

        if (!res.body) {
          if (!controller.signal.aborted) {
            setState({
              bytes: null,
              error: { kind: "read_failed", detail: "no stream body" },
              isLoading: false,
              progress: null,
            });
          }
          return;
        }

        // 分片读取：按 Content-Length 报进度。进度只在整数百分比变化时
        // setState（节流），否则 100 MiB 文件的几千个 chunk 会触发几千次渲染。
        const total = Number(res.headers.get("Content-Length")) || 0;
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        let lastPct = -1;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) {
            const pct = Math.min(100, Math.floor((received / total) * 100));
            if (pct !== lastPct) {
              lastPct = pct;
              if (!controller.signal.aborted) {
                setState((prev) => ({ ...prev, progress: pct }));
              }
            }
          }
        }

        // 拼装为单一 ArrayBuffer（js-preview 的 preview() 入参格式）
        const merged = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (!controller.signal.aborted) {
          setState({ bytes: merged.buffer, error: null, isLoading: false, progress: 100 });
        }
      } catch (err) {
        // unmount / 路径切换导致的 abort 不是错误
        if (controller.signal.aborted) return;
        setState({
          bytes: null,
          error: { kind: "read_failed", detail: String(err) },
          isLoading: false,
          progress: null,
        });
      }
    })();

    return () => controller.abort();
  }, [absolutePath, workingDir, reloadNonce]);

  return state;
}

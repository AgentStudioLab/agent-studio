// OfficeDocRenderer — pdf / docx / xlsx 的流式预览渲染器。
//
// 数据通道与其它渲染器不同：不读 PreviewBody 传入的 data（rich 文档在
// PreviewPane 层已禁用 useFileContent，避免对大文件先发一次注定 413 的
// base64 请求），而是自己走 /files/raw 流式拉取原始字节（types.ts 约定
// 允许渲染器自取更丰富的端点），再交给 @js-preview/* 懒加载渲染。
//
// 状态机：
//   下载中  → 进度条 + 百分比（有 Content-Length 时）
//   解析中  → 「加载中…」（库 import + 解析渲染）
//   流错误  → 错误文案 + 「用系统应用打开」CTA
//   渲染失败 → renderFailed 文案 + 同款 CTA
//   就绪    → js-preview 渲染进容器，容器自管滚动

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStreamedFileBytes } from "@/lib/agui/react/useStreamedFileBytes";
import type { MockFile } from "@/lib/mock/types";
import type { RichDocKind } from "../richDoc";
import { useJsPreview } from "../useJsPreview";
import "./office-doc.css";

// docx 纸张适配：A4 纸宽 794px + .docx-wrapper 左右 padding 16px×2。
// 面板比这窄时按比例缩小整页（zoom 重算布局，滚动条尺寸正确，
// 与 PreviewPane 对普通内容的 zoom 策略同思路），不放大超过 1。
const DOCX_PAGE_WIDTH = 794 + 32;
const DOCX_MIN_ZOOM = 0.4;

interface OfficeDocRendererProps {
  file: MockFile;
  workingDir: string | null;
  kind: RichDocKind;
  /** PreviewPane 刷新按钮自增的 nonce，触发重新下载 + 重渲染。 */
  reloadNonce: number;
  onOpenExternal: () => void;
}

/** 错误 / 兜底提示 + 「用系统应用打开」按钮，样式对齐 BinaryFallbackRenderer。 */
function FallbackNotice({
  message,
  onOpenExternal,
  ctaLabel,
}: {
  message: string;
  onOpenExternal: () => void;
  ctaLabel: string;
}) {
  return (
    <div className="px-4 py-8 text-center" style={{ color: "hsl(var(--text-400))" }}>
      <div className="text-[13px] italic">{message}</div>
      <button
        type="button"
        onClick={onOpenExternal}
        className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12px]"
        style={{
          color: "hsl(var(--text-100))",
          border: "1px solid hsl(var(--border-300) / 0.18)",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

export function OfficeDocRenderer({
  file,
  workingDir,
  kind,
  reloadNonce,
  onOpenExternal,
}: OfficeDocRendererProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // docx 的 fit-to-width 缩放系数。量根节点（未施加 zoom，宽度是真实面板
  // 像素）避免「量被缩放的元素」造成反馈循环。
  const [fitZoom, setFitZoom] = useState(1);

  const { bytes, error, isLoading, progress } = useStreamedFileBytes(
    file.path,
    workingDir,
    reloadNonce,
  );
  const { status, errorDetail } = useJsPreview(kind, bytes, containerRef);

  useEffect(() => {
    if (kind !== "docx") return;
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const w = root.clientWidth;
      if (w > 0) setFitZoom(Math.min(1, Math.max(DOCX_MIN_ZOOM, w / DOCX_PAGE_WIDTH)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [kind]);

  // 流式下载错误 → 文案映射（与 PreviewBody 一致，仅 too_large 换成
  // raw 端点的 100 MiB 上限文案）
  let streamErrorMsg: string | null = null;
  if (error) {
    switch (error.kind) {
      case "not_found":
        streamErrorMsg = t("task.preview.errorNotFound");
        break;
      case "outside_workspace":
        streamErrorMsg = t("task.preview.errorOutsideWorkspace");
        break;
      case "too_large":
        streamErrorMsg = t("task.preview.errorTooLargeRich");
        break;
      case "missing_param":
      case "read_failed":
        streamErrorMsg = t("task.preview.errorReadFailed", {
          detail: error.kind === "read_failed" ? error.detail : "missing param",
        });
        break;
    }
  }
  // workingDir 缺失（如 Storybook / 异常态）按兜底处理，不发请求
  if (!workingDir) streamErrorMsg = t("task.preview.binaryNotice");

  const showOverlay = streamErrorMsg !== null || status === "failed" || status !== "ready";

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      {/* 覆盖层：下载进度 / 解析中 / 错误。容器始终挂载（js-preview 需要
          稳定的 DOM 节点做 init），未就绪时用 0 高度隐藏而非卸载。 */}
      {streamErrorMsg !== null ? (
        <FallbackNotice
          message={streamErrorMsg}
          onOpenExternal={onOpenExternal}
          ctaLabel={t("task.preview.openExternal")}
        />
      ) : status === "failed" ? (
        <FallbackNotice
          message={`${t("task.preview.renderFailed")}${errorDetail ? ` (${errorDetail})` : ""}`}
          onOpenExternal={onOpenExternal}
          ctaLabel={t("task.preview.openExternal")}
        />
      ) : showOverlay ? (
        <div className="px-6 py-10 text-center">
          <div
            className="text-[13px] italic"
            style={{ color: "hsl(var(--text-400))" }}
          >
            {isLoading && progress !== null
              ? t("task.preview.streamingProgress", { percent: progress })
              : t("task.preview.loading")}
          </div>
          {/* 进度条：有确定进度时显示。轨道 bg-300，填充 brand-100，
              全部走语义 token。 */}
          {isLoading && progress !== null && (
            <div
              className="mx-auto mt-3 h-1 w-48 overflow-hidden rounded-full"
              style={{ background: "hsl(var(--bg-300))" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-150"
                style={{
                  width: `${progress}%`,
                  background: "hsl(var(--brand-100))",
                }}
              />
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="office-doc min-h-0 flex-1 overflow-auto"
        style={
          showOverlay
            ? { height: 0, flex: "0 0 0px", overflow: "hidden" }
            : kind === "docx" && fitZoom < 1
              ? { zoom: fitZoom }
              : undefined
        }
      />
    </div>
  );
}

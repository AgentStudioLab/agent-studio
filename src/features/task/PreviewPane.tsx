import { useEffect, useState } from "react";
import { Check, Copy, RotateCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import { useFileContent } from "@/lib/agui/react/useFileContent";
import type { MockFile } from "@/lib/mock/types";
import { PreviewBody } from "@/features/task/preview/PreviewBody";
import { richDocKind } from "@/features/task/preview/richDoc";
import { OpenerMenu } from "@/features/task/preview/OpenerMenu";
import {
  MarkdownViewToggle,
  type MarkdownViewMode,
} from "@/features/task/preview/MarkdownViewToggle";

interface PreviewPaneProps {
  file: MockFile;
  workingDir: string | null;
  onClose: () => void;
}

const MIN_W = 360;
const MAX_W = 720;
const DEFAULT_W = 520;

/**
 * Width the preview content is designed for. Anything narrower zooms the
 * whole preview DOWN proportionally (so tables don't column-squeeze and
 * paragraphs don't reflow); anything wider zooms it UP. Picked so the
 * default pane width (520) gives ~1.0× content. Uses CSS `zoom` instead of
 * `transform: scale` because zoom recomputes layout — scrollbar sizing
 * stays correct and the parent's flex-1 height accounts for the scaled
 * content. Clamped to a sane range so extreme widths don't produce
 * unreadable or comically-large text.
 */
const DESIGN_CONTENT_WIDTH = 480;
const PANE_BODY_PADDING = 24; // p-3 = 12px each side
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.5;

/**
 * Right-side file preview pane. Owns:
 *   - width drag handle
 *   - header (filename + type label + Open-with menu + refresh + close)
 *   - zoom container that scales the body proportionally with pane width
 *
 * Rendering is delegated to PreviewBody, which dispatches to type-specific
 * renderers under `preview/renderers/`. Adding a new file type (pptx, xlsx,
 * etc) is a one-renderer + one-PreviewBody-switch-arm change — no edits
 * here.
 */
export function PreviewPane({ file, workingDir, onClose }: PreviewPaneProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [dragging, setDragging] = useState<boolean>(false);
  // Preview-vs-source toggle lives in the shell so the header can host the
  // control. Shared by markdown + html (identical semantics).
  const [viewMode, setViewMode] = useState<MarkdownViewMode>("preview");
  const [copied, setCopied] = useState(false);
  // rich 文档（pdf/docx/xlsx）的刷新 nonce：自增触发 OfficeDocRenderer
  // 重新走 /files/raw 下载 + 重渲染（它们不经 useFileContent 的 refetch）。
  const [reloadNonce, setReloadNonce] = useState(0);

  // rich 文档禁用 useFileContent（传 path=null）：它们走 /files/raw 流式
  // 自取。不禁用会对大文件先发一次注定 413（>2MiB）的 base64 请求。
  const docKind = richDocKind(file);
  const { data, error, isLoading, isFetching, refetch } = useFileContent(
    docKind ? null : file.path,
    workingDir,
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth - e.clientX - 32;
      const clamped = Math.max(MIN_W, Math.min(MAX_W, w));
      setWidth(clamped);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const handleOpenExternal = () => {
    void shellOpen(file.path).catch((err: unknown) => {
      console.error("[PreviewPane] failed to open externally", err);
    });
  };

  // Body layout strategy:
  //   - HTML preview: full-height container, the self-scaling iframe handles
  //     its own size; the outer container scrolls the scaled-tall page.
  //   - Code-block views (source toggle, or a code file): the code block fills
  //     the pane height and scrolls INSIDE itself — code shouldn't zoom with
  //     the pane (monospace) nor scroll at the outer container. `source` is
  //     only reachable for markdown/html (the only types that show the toggle).
  //   - Everything else: width-proportional zoom wrapper.
  const isHtmlPreview = file.type === "html" && viewMode === "preview";
  const isCodeView = viewMode === "source" || file.type === "code";
  // rich 文档：OfficeDocRenderer 自管内部滚动与布局，给 full-bleed 槽位
  // （不套 zoom —— 库渲染的分页/表格按真实尺寸展示，缩放交给库自身）。
  const isRichDoc = docKind !== null;

  const canCopy = data?.encoding === "utf8";
  const handleCopy = () => {
    if (!data || data.encoding !== "utf8") return;
    void navigator.clipboard
      .writeText(data.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err: unknown) => {
        console.error("[PreviewPane] copy failed", err);
      });
  };

  const body = (
    <PreviewBody
      file={file}
      data={data}
      error={error}
      isLoading={isLoading}
      onOpenExternal={handleOpenExternal}
      viewMode={viewMode}
      workingDir={workingDir}
      reloadNonce={reloadNonce}
    />
  );

  // 刷新：rich 文档自增 nonce 重新流式下载；其余走 useFileContent.refetch。
  const handleRefresh = () => {
    if (isRichDoc) setReloadNonce((n) => n + 1);
    else refetch();
  };

  return (
    <aside
      className="animate-slide-in-pane relative flex shrink-0 flex-col"
      style={{
        width,
        background: "hsl(var(--bg-100))",
        borderLeft: "1px solid hsl(var(--border-300) / 0.12)",
      }}
    >
      {/* Resize handle (left edge, 6px hot zone + 2px hairline) */}
      <div
        className={cn("resize-handle", dragging && "resize-handle-active")}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("task.preview.resizeHandle")}
      />

      {/* Header */}
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center gap-3 px-4"
        style={{ borderBottom: "1px solid hsl(var(--border-300) / 0.1)" }}
      >
        {(file.type === "markdown" || file.type === "html") && (
          <MarkdownViewToggle value={viewMode} onChange={setViewMode} />
        )}
        {/* Filename: block-level + flex-1 + min-w-0 so `truncate` actually
            applies under narrow widths. An inline <span> ignores
            text-overflow: ellipsis and silently pushes its siblings (Copy /
            OpenerMenu) off-screen instead. The type label was dropped — the
            file extension in the name already conveys it. */}
        <div
          className="min-w-0 flex-1 truncate font-medium text-[13.5px]"
          style={{ color: "hsl(var(--text-100))" }}
          title={file.name}
        >
          {file.name}
        </div>
        {canCopy && (
          <button
            type="button"
            aria-label={copied ? t("task.preview.copied") : t("task.preview.copyContent")}
            title={copied ? t("task.preview.copied") : t("task.preview.copyContent")}
            onClick={handleCopy}
            className="rounded-md p-1.5 transition hover:bg-state-hover hover:text-foreground"
            style={{ color: "hsl(var(--text-300))" }}
          >
            {copied ? (
              <Check className="size-[13px]" />
            ) : (
              <Copy className="size-[13px]" />
            )}
          </button>
        )}
        <OpenerMenu file={file} />
        <button
          type="button"
          aria-label={t("task.preview.refresh")}
          onClick={handleRefresh}
          disabled={isFetching}
          className="rounded-md p-1.5 transition hover:bg-state-hover hover:text-foreground disabled:opacity-50"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <RotateCw className={cn("size-[13px]", isFetching && "animate-spin")} />
        </button>
        <button
          type="button"
          aria-label={t("task.preview.close")}
          onClick={onClose}
          className="rounded-md p-1.5 transition hover:bg-state-hover hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <X className="size-[14px]" />
        </button>
      </header>

      {/* Body — see isHtmlPreview / isCodeView above for the three strategies.
          The zoom wrapper uses `zoom` (not `transform: scale`) so it affects
          layout — scrollbar bounds + flex height adapt — around a constant
          480px design width. */}
      {isRichDoc ? (
        <div className="min-h-0 flex-1">{body}</div>
      ) : isHtmlPreview ? (
        <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      ) : isCodeView ? (
        <div className="min-h-0 flex-1">{body}</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div
            className="space-y-3"
            style={{
              zoom: Math.min(
                MAX_ZOOM,
                Math.max(
                  MIN_ZOOM,
                  Math.max(0, width - PANE_BODY_PADDING) / DESIGN_CONTENT_WIDTH,
                ),
              ),
            }}
          >
            {body}
          </div>
        </div>
      )}
    </aside>
  );
}

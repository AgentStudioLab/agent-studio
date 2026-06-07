import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download, Maximize2 } from "lucide-react";
import type { CustomRendererProps } from "streamdown";
import type { BundledLanguage } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STREAMDOWN_MERMAID_PLUGIN } from "./streamdownPlugins";

type ViewMode = "diagram" | "source";

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Canvas export failed"));
    }, type);
  });
}

async function rasterizeSvgToPngBlob(
  renderedSvg: SVGSVGElement,
  fallbackSvg: string
) {
  // Mermaid 生成的 SVG 内可能含有 foreignObject HTML label，例如 <br>。
  // 页面内渲染没问题，但下载后的 .svg 会按 XML 打开；即便最终导出 PNG，
  // 中间 SVG 也需要先用 DOM 序列化规范化，避免图片加载阶段解析失败。
  const svgSource = renderedSvg
    ? new renderedSvg.ownerDocument.defaultView!.XMLSerializer().serializeToString(
        renderedSvg
      )
    : fallbackSvg;
  const svgBlob = new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const svgWindow = renderedSvg.ownerDocument.defaultView ?? window;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new svgWindow.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Mermaid image load failed"));
      nextImage.src = svgUrl;
    });

    const sourceWidth =
      renderedSvg.viewBox.baseVal.width ||
      renderedSvg.getBoundingClientRect().width ||
      image.naturalWidth ||
      image.width ||
      1;
    const sourceHeight =
      renderedSvg.viewBox.baseVal.height ||
      renderedSvg.getBoundingClientRect().height ||
      image.naturalHeight ||
      image.height ||
      1;
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(sourceWidth * scale);
    canvas.height = Math.ceil(sourceHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }

    context.fillStyle =
      window.getComputedStyle(document.body).backgroundColor || "Canvas";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvasToBlob(canvas, "image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function MarkdownMermaidBlock({
  code,
  isIncomplete,
}: CustomRendererProps) {
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const diagramRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ViewMode>("diagram");
  const [svg, setSvg] = useState<string | null>(null);
  const [pngDownloadUrl, setPngDownloadUrl] = useState<string | null>(null);
  const pngDownloadUrlRef = useRef<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setSvg(null);
    setViewerOpen(false);
    setRenderFailed(false);

    // 流式代码围栏闭合前先跳过 Mermaid，避免半截源码触发解析错误。
    if (mode === "source" || isIncomplete || code.trim() === "") {
      return () => {
        cancelled = true;
      };
    }

    STREAMDOWN_MERMAID_PLUGIN
      .getMermaid()
      .render(renderId, code)
      .then(({ svg: nextSvg }) => {
        if (!cancelled) {
          setSvg(nextSvg);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRenderFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, isIncomplete, mode, renderId]);

  useEffect(() => {
    let cancelled = false;

    setPngDownloadUrl(null);
    if (pngDownloadUrlRef.current) {
      URL.revokeObjectURL(pngDownloadUrlRef.current);
      pngDownloadUrlRef.current = null;
    }

    if (mode !== "diagram" || !svg || isIncomplete) {
      return () => {
        cancelled = true;
      };
    }

    const renderedSvg = diagramRef.current?.querySelector("svg");
    if (!renderedSvg) {
      return () => {
        cancelled = true;
      };
    }

    void rasterizeSvgToPngBlob(renderedSvg, svg)
      .then((pngBlob) => {
        const nextUrl = URL.createObjectURL(pngBlob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        pngDownloadUrlRef.current = nextUrl;
        setPngDownloadUrl(nextUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("[MarkdownMermaidBlock] prepare PNG download failed", error);
        }
      });

    return () => {
      cancelled = true;
      if (pngDownloadUrlRef.current) {
        URL.revokeObjectURL(pngDownloadUrlRef.current);
        pngDownloadUrlRef.current = null;
      }
    };
  }, [mode, svg, isIncomplete]);

  const handleDownload = () => {
    if (!pngDownloadUrl) return;
    triggerDownload(pngDownloadUrl, "mermaid-diagram.png");
  };

  const handleCopySource = () => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(code).catch((error: unknown) => {
      console.error("[MarkdownMermaidBlock] copy source failed", error);
    });
  };

  const showDiagramActions = mode === "diagram" && Boolean(svg);
  const showSourceActions = mode === "source";

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono">Mermaid</span>
        <div className="flex items-center gap-2">
          {showDiagramActions ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="下载图表"
                title={pngDownloadUrl ? "下载图表" : "正在准备下载"}
                disabled={!pngDownloadUrl}
                onClick={handleDownload}
                className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="size-4" />
              </button>
              <button
                type="button"
                aria-label="放大查看图表"
                title="放大查看图表"
                onClick={() => setViewerOpen(true)}
                className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background hover:text-foreground"
              >
                <Maximize2 className="size-4" />
              </button>
            </div>
          ) : null}
          {showSourceActions ? (
            <button
              type="button"
              aria-label="复制源码"
              title="复制源码"
              onClick={handleCopySource}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background hover:text-foreground"
            >
              <Copy className="size-4" />
            </button>
          ) : null}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={mode === "diagram"}
              onClick={() => setMode("diagram")}
              className="rounded-md px-2 py-1 transition-colors aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              图表
            </button>
            <button
              type="button"
              aria-pressed={mode === "source"}
              onClick={() => setMode("source")}
              className="rounded-md px-2 py-1 transition-colors aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              源码
            </button>
          </div>
        </div>
      </div>
      {mode === "source" ? (
        <CodeBlock
          code={code}
          language={"mermaid" as unknown as BundledLanguage}
          className="rounded-none border-0"
        />
      ) : (
        <div className="overflow-auto p-4">
          {isIncomplete ? (
            <p className="m-0 text-sm text-muted-foreground">
              Mermaid 正在生成，源码可先查看。
            </p>
          ) : renderFailed ? (
            <p className="m-0 text-sm text-muted-foreground">
              Mermaid 图表渲染失败。
            </p>
          ) : svg ? (
            <div
              ref={diagramRef}
              className="[&_svg]:h-auto [&_svg]:max-w-full"
              // SVG 由共享的 strict Mermaid 插件渲染，HTML 注入范围只保留在图表容器内。
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Mermaid 图表渲染中。</p>
          )}
        </div>
      )}
      <Dialog open={viewerOpen && Boolean(svg)} onOpenChange={setViewerOpen}>
        <DialogContent className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 p-0 sm:max-w-[calc(100vw-4rem)]">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Mermaid 图表</DialogTitle>
          </DialogHeader>
          <div
            data-testid="mermaid-diagram-viewer"
            className="min-h-0 overflow-auto p-6 [&_svg]:h-auto [&_svg]:max-w-none"
            // 大图层复用同一份 Mermaid SVG，避免重新渲染时生成不同 id 或闪烁。
            dangerouslySetInnerHTML={{ __html: svg ?? "" }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

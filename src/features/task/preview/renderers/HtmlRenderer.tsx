// HTML file renderer — two display modes (mirrors MarkdownRenderer):
//   - "preview" (default): the file rendered live inside a sandboxed iframe,
//     scaled down proportionally (等比缩放) to fit the pane width so a
//     fixed-width design (e.g. 960px slides) shows fully instead of being
//     clipped. We feed the already-fetched content via `srcDoc` (no server).
//     `sandbox="allow-scripts"` WITHOUT allow-same-origin gives the frame an
//     opaque origin: scripts/animations run but can't reach the host app.
//     `color-scheme: light` paints it on a normal white web-page canvas
//     regardless of the app's light/dark mode.
//     Limitation: self-contained HTML only — relative/external assets
//     (<img src="chart.png">, external CSS) won't resolve under srcDoc.
//   - "source": raw HTML via the shared CodeBlock.
//
// Mode is owned by PreviewPane (header toggle) and threaded through PreviewBody.

import { useEffect, useMemo, useRef, useState } from "react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import type { MarkdownViewMode } from "../MarkdownViewToggle";
import type { PreviewRendererProps } from "./types";

interface HtmlRendererProps extends PreviewRendererProps {
  mode: MarkdownViewMode;
}

// Injected at the end of the preview document. Reports the content's natural
// width (widest rendered element) + full height back to the host via
// postMessage — the only channel out of the sandboxed opaque-origin frame
// (the host can't read its DOM cross-origin). The host uses these to compute
// the fit-to-width scale and reserve the correct scroll height.
const SIZE_REPORTER = `
<script>
(function () {
  function naturalWidth() {
    var max = document.documentElement.scrollWidth || 0;
    var els = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < els.length; i++) {
      var w = els[i].getBoundingClientRect().width;
      if (w > max) max = w;
    }
    return Math.ceil(max);
  }
  function post() {
    parent.postMessage(
      { __htmlPreview: 1, w: naturalWidth(), h: Math.ceil(document.documentElement.scrollHeight) },
      "*"
    );
  }
  window.addEventListener("load", post);
  window.addEventListener("resize", post);
  document.addEventListener("DOMContentLoaded", post);
  if (window.ResizeObserver) {
    try { new ResizeObserver(post).observe(document.documentElement); } catch (e) {}
  }
  setTimeout(post, 0);
  setTimeout(post, 200);
  setTimeout(post, 600);
})();
</` + `script>`;

export function HtmlRenderer({ file, data, mode }: HtmlRendererProps) {
  if (mode === "source") {
    // Fill the pane height; scroll INSIDE the code block. CodeBlock is a flex
    // column and its inner content area (the only child div) flex-fills the
    // block height + scrolls (so both scrollbars sit at the block's visible
    // edges). contentVisibility:visible disables its content-visibility
    // collapse, which would otherwise misreport height.
    return (
      <div className="h-full">
        <CodeBlock
          code={data.content}
          language="html"
          className="flex h-full flex-col rounded-none border-0 [&>div]:min-h-0 [&>div]:flex-1"
          style={{ contentVisibility: "visible" }}
        />
      </div>
    );
  }
  return <HtmlPreview content={data.content} title={file.name} />;
}

function HtmlPreview({ content, title }: { content: string; title: string }) {
  const srcDoc = useMemo(() => content + SIZE_REPORTER, [content]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [avail, setAvail] = useState(0);
  const [natW, setNatW] = useState<number | null>(null);
  const [natH, setNatH] = useState<number | null>(null);

  // Drop stale measurements when the document changes (refetch / file switch).
  useEffect(() => {
    setNatW(null);
    setNatH(null);
  }, [srcDoc]);

  // Track the available width (pane content width).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setAvail(el.clientWidth);
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Receive size reports from this iframe only. The >1px guard stops a
  // resize→report→resize feedback loop on sub-pixel jitter.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { __htmlPreview?: number; w?: number; h?: number };
      if (!d || d.__htmlPreview !== 1) return;
      if (typeof d.w === "number")
        setNatW((p) => (p != null && Math.abs(p - d.w!) <= 1 ? p : d.w!));
      if (typeof d.h === "number")
        setNatH((p) => (p != null && Math.abs(p - d.h!) <= 1 ? p : d.h!));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Lay the iframe out at its natural width (never narrower than the pane), then
  // scale the whole thing down to fit. Fixed-width content (960px slides) gets
  // natW > avail → scale < 1; responsive content gets natW ≈ avail → scale 1.
  const layoutW = Math.max(avail, natW ?? 0) || avail || 1;
  const scale = avail > 0 ? Math.min(1, avail / layoutW) : 1;
  const scaledH = natH != null ? Math.ceil(natH * scale) : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height: scaledH ?? "100%",
        overflow: "hidden",
      }}
    >
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: layoutW,
          height: natH ?? "100%",
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          colorScheme: "light",
        }}
      />
    </div>
  );
}

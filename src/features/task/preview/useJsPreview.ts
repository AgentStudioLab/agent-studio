// useJsPreview — @js-preview/* 库的 React 挂载生命周期 hook。
//
// 职责：
//   - 按 kind 动态 import 对应库（含 CSS），三个库各自成为懒加载 chunk，
//     不进主包（pdf.js / exceljs / docx-preview 体积都很大）；
//   - bytes 就绪后 init(container) → preview(bytes)；
//   - kind / bytes 变化或卸载时 destroy() 并清空容器；
//   - 全程 race-guard：异步段每一步都检查 cancelled，StrictMode 双跑
//     与快速切换文件都不会泄漏实例或写入已卸载组件的 state。

import { useEffect, useState, type RefObject } from "react";
import type { RichDocKind } from "./richDoc";

/** 三个 @js-preview 包共同的实例形状（各自 d.ts 的公共子集）。 */
interface JsPreviewInstance {
  preview: (src: string | ArrayBuffer | Blob) => Promise<unknown>;
  destroy: () => void;
}

interface JsPreviewLib {
  init: (container: HTMLElement) => JsPreviewInstance;
}

// 动态 loader：docx / excel 需要附带各自的样式表；pdf 无 CSS、
// 且其 pdf.js worker 已内联为 data URI（离线可用，无 CDN 依赖）。
const LOADERS: Record<RichDocKind, () => Promise<JsPreviewLib>> = {
  pdf: async () => (await import("@js-preview/pdf")).default,
  docx: async () => {
    await import("@js-preview/docx/lib/index.css");
    return (await import("@js-preview/docx")).default;
  },
  xlsx: async () => {
    await import("@js-preview/excel/lib/index.css");
    return (await import("@js-preview/excel")).default;
  },
};

export type JsPreviewStatus =
  | "idle" // bytes 未就绪
  | "rendering" // 库加载 / 解析渲染中
  | "ready"
  | "failed";

export function useJsPreview(
  kind: RichDocKind,
  bytes: ArrayBuffer | null,
  containerRef: RefObject<HTMLDivElement | null>,
): { status: JsPreviewStatus; errorDetail: string | null } {
  const [status, setStatus] = useState<JsPreviewStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!bytes || !container) {
      setStatus("idle");
      setErrorDetail(null);
      return;
    }

    let cancelled = false;
    let instance: JsPreviewInstance | null = null;
    setStatus("rendering");
    setErrorDetail(null);

    void (async () => {
      try {
        const lib = await LOADERS[kind]();
        if (cancelled) return;
        // 清掉上一个实例可能残留的 DOM（destroy 后个别库不清空容器）
        container.innerHTML = "";
        instance = lib.init(container);
        // 拷贝一份再交给库：pdf.js 会把 ArrayBuffer transfer 给 worker
        // 导致原 buffer detach。StrictMode 双跑 / 刷新重渲染会复用同一
        // bytes 引用，不拷贝第二次 preview 必挂。
        await instance.preview(bytes.slice(0));
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(`[useJsPreview] ${kind} render failed`, err);
        setStatus("failed");
        setErrorDetail(String(err));
      }
    })();

    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {
        // destroy 内部偶发抛错（库未完成初始化时），不影响卸载
      }
      container.innerHTML = "";
    };
  }, [kind, bytes, containerRef]);

  return { status, errorDetail };
}

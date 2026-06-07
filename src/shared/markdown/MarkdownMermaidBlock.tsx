import { useEffect, useId, useState } from "react";
import type { CustomRendererProps } from "streamdown";
import type { BundledLanguage } from "shiki";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { STREAMDOWN_MERMAID_PLUGIN } from "./streamdownPlugins";

type ViewMode = "diagram" | "source";

export function MarkdownMermaidBlock({
  code,
  isIncomplete,
}: CustomRendererProps) {
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [mode, setMode] = useState<ViewMode>("diagram");
  const [svg, setSvg] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setSvg(null);
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

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono">Mermaid</span>
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
      {mode === "source" ? (
        <CodeBlock
          code={code}
          language={"mermaid" as unknown as BundledLanguage}
          className="rounded-none border-0"
        >
          <CodeBlockHeader>
            <CodeBlockTitle>
              <CodeBlockFilename>mermaid</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
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
              className="[&_svg]:h-auto [&_svg]:max-w-full"
              // SVG 由共享的 strict Mermaid 插件渲染，HTML 注入范围只保留在图表容器内。
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Mermaid 图表渲染中。</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import type React from "react";
import { ChevronDown, RotateCw, X } from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import type { MockFile } from "@/lib/mock/types";

interface PreviewPaneProps {
  file: MockFile;
  onClose: () => void;
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 480;

// Mock opener mapping by file type (MockFile has no `opener` field of its own)
const OPENER_BY_TYPE: Record<MockFile["type"], string | null> = {
  markdown: "typora",
  spreadsheet: "wpsoffice",
  presentation: "wpsoffice",
  code: "vscode",
  image: null,
  generic: null,
};

export function PreviewPane({ file, onClose }: PreviewPaneProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setResizing(true);
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: PointerEvent) => {
        // Handle sits on LEFT edge of pane: dragging left increases width
        const delta = startX - ev.clientX;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta)
        );
        setWidth(next);
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width]
  );

  const opener = OPENER_BY_TYPE[file.type];

  return (
    <div
      ref={paneRef}
      className="animate-slide-in-pane relative flex h-full shrink-0 flex-col overflow-hidden bg-background"
      style={{ width, borderLeft: "1px solid hsl(var(--border-300) / 0.12)" }}
    >
      {/* Left-edge resize hot zone (6px) with 2px white handle on hover/active */}
      <div
        onPointerDown={onResizeStart}
        className={cn(
          "group absolute top-0 left-0 z-10 h-full w-[6px] cursor-col-resize",
          resizing && "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "absolute top-0 left-1/2 h-full w-[2px] -translate-x-1/2 bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100",
            resizing && "opacity-100"
          )}
        />
      </div>

      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground text-sm">
            {file.name}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {file.path}
          </div>
        </div>
        {opener && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
          >
            {opener}
            <ChevronDown className="size-3" />
          </button>
        )}
        <button
          type="button"
          aria-label="Refresh"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCw className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <PreviewContent file={file} />
      </div>
    </div>
  );
}

function PreviewContent({ file }: { file: MockFile }) {
  switch (file.type) {
    case "markdown":
      return <MarkdownPreview content={file.content ?? ""} />;
    case "spreadsheet":
      return <SpreadsheetPreview content={file.content ?? ""} />;
    case "presentation":
      return <PresentationPreview />;
    case "code":
      return (
        <div className="p-4">
          <CodeBlock code={file.content ?? ""} language="typescript" />
        </div>
      );
    default:
      return (
        <div className="flex h-full items-center justify-center p-8 text-muted-foreground text-sm">
          No preview available for this file type.
        </div>
      );
  }
}

function MarkdownPreview({ content }: { content: string }) {
  // Minimal renderer: split on newlines, treat # / ## as headings, blank line as gap.
  const lines = content.split(/\r?\n/);
  return (
    <article className="px-6 py-4 text-sm">
      {lines.map((line, i) => {
        const key = `md-${i}`;
        if (line.startsWith("## ")) {
          return (
            <h2
              key={key}
              className="mt-4 font-semibold font-serif text-foreground text-lg"
            >
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h1
              key={key}
              className="mt-2 font-semibold font-serif text-2xl text-foreground"
            >
              {line.slice(2)}
            </h1>
          );
        }
        if (!line.trim()) return <div key={key} className="h-3" />;
        return (
          <p key={key} className="text-foreground">
            {line}
          </p>
        );
      })}
    </article>
  );
}

function SpreadsheetPreview({ content }: { content: string }) {
  const rows = content
    .split(/\r?\n/)
    .filter((r) => r.trim().length > 0)
    .map((row) => row.split(","));
  const [header, ...body] = rows;
  return (
    <div className="overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header?.map((h, i) => (
              <th
                key={`h-${i}`}
                className="border-border border-b px-3 py-2 text-left font-medium text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={`r-${i}`} className="hover:bg-muted/50">
              {row.map((cell, j) => (
                <td
                  key={`r-${i}-c-${j}`}
                  className="border-border border-b px-3 py-2 text-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MOCK_SLIDES = [
  { title: "扫描概览", subtitle: "5 个不活跃项目" },
  { title: "Top 3", subtitle: "old-project-1 / old-project-2 / archive-x" },
  { title: "建议", subtitle: "归档 4 个 · 删除 1 个" },
];

function PresentationPreview() {
  // Mock 3 dark slides — bg-300 in dark mode is near-black, giving a pptx-card feel.
  return (
    <div className="flex flex-col gap-4 p-6">
      {MOCK_SLIDES.map((s, i) => (
        <div
          key={`slide-${i}`}
          className="rounded-md p-8 text-[hsl(var(--always-white))]"
          style={{ background: "hsl(var(--bg-300))" }}
        >
          <div className="font-semibold font-serif text-xl">{s.title}</div>
          <div className="mt-2 text-sm opacity-80">{s.subtitle}</div>
        </div>
      ))}
    </div>
  );
}

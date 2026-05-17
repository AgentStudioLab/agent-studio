import { useEffect, useState } from "react";
import { ChevronDown, RotateCw, X } from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import type { MockFile } from "@/lib/mock/types";

interface PreviewPaneProps {
  file: MockFile;
  onClose: () => void;
}

const MIN_W = 360;
const MAX_W = 720;
const DEFAULT_W = 520;

// Mock opener mapping by file type (MockFile has no `opener` field of its own).
const OPENER_BY_TYPE: Record<MockFile["type"], string | null> = {
  markdown: "VS Code",
  spreadsheet: "wpsoffice",
  presentation: "wpsoffice",
  code: "VS Code",
  image: null,
  generic: null,
};

const FILE_LABEL_BY_TYPE: Record<MockFile["type"], string> = {
  markdown: "Markdown",
  spreadsheet: "XLSX",
  presentation: "PPTX",
  code: "Code",
  image: "Image",
  generic: "File",
};

// Opener badge (small colored square w/ a letter) — markdown opener is blue,
// office openers are brand-orange. Uses semantic tokens.
function openerBadgeStyle(type: MockFile["type"]): {
  background: string;
  letter: string;
} {
  if (type === "markdown" || type === "code") {
    return { background: "hsl(var(--accent-100))", letter: "C" };
  }
  return { background: "hsl(var(--brand-100))", letter: "W" };
}

export function PreviewPane({ file, onClose }: PreviewPaneProps) {
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [dragging, setDragging] = useState<boolean>(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth - e.clientX - 32;
      const clamped = Math.max(MIN_W, Math.min(MAX_W, w));
      setWidth(clamped);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
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

  const opener = OPENER_BY_TYPE[file.type];
  const fileLabel = FILE_LABEL_BY_TYPE[file.type];
  const badge = openerBadgeStyle(file.type);

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
        aria-label="Resize preview pane"
      />

      {/* Header */}
      <header
        className="flex h-12 shrink-0 items-center gap-3 px-4"
        style={{ borderBottom: "1px solid hsl(var(--border-300) / 0.1)" }}
      >
        <div className="min-w-0 flex-1">
          <span
            className="truncate font-medium text-[13.5px]"
            style={{ color: "hsl(var(--text-100))" }}
          >
            {file.name}
          </span>
          <span
            className="mx-2 text-[12px]"
            style={{ color: "hsl(var(--text-400))" }}
          >
            ·
          </span>
          <span
            className="text-[12px]"
            style={{ color: "hsl(var(--text-300))" }}
          >
            {fileLabel}
          </span>
        </div>
        {opener && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition hover:bg-muted hover:text-foreground"
            style={{
              color: "hsl(var(--text-200))",
              border: "1px solid hsl(var(--border-300) / 0.15)",
            }}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8.5px] font-bold"
              style={{
                background: badge.background,
                color: "hsl(var(--oncolor-100))",
              }}
            >
              {badge.letter}
            </span>
            {opener}
            <ChevronDown className="size-3" />
          </button>
        )}
        <button
          type="button"
          aria-label="Refresh"
          className="rounded-md p-1.5 transition hover:bg-muted hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <RotateCw className="size-[13px]" />
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1.5 transition hover:bg-muted hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <X className="size-[14px]" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <PreviewContent file={file} />
      </div>
    </aside>
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
        <div className="p-1">
          <CodeBlock code={file.content ?? ""} language="typescript" />
        </div>
      );
    default:
      return (
        <div
          className="px-4 py-8 text-center text-[13px] italic"
          style={{ color: "hsl(var(--text-400))" }}
        >
          [Preview for .{file.type} not implemented in this mock]
        </div>
      );
  }
}

function MarkdownPreview({ content }: { content: string }) {
  // Minimal renderer: split on newlines, treat # / ## as headings, blank line as gap.
  const lines = content.split(/\r?\n/);
  return (
    <article className="px-3 py-2 text-sm">
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
    <div className="overflow-auto">
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
  return (
    <div className="flex flex-col gap-4">
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

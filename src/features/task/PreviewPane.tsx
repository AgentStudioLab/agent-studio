import { useEffect, useState } from "react";
import { ChevronDown, RotateCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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

// Mock opener mapping by file type (MockFile has no `opener` field of its own).
const OPENER_BY_TYPE: Record<MockFile["type"], string | null> = {
  markdown: "VS Code",
  spreadsheet: "wpsoffice",
  presentation: "wpsoffice",
  code: "VS Code",
  image: null,
  generic: null,
};

const FILE_LABEL_KEY_BY_TYPE: Record<MockFile["type"], string> = {
  markdown: "task.preview.fileLabel.markdown",
  spreadsheet: "task.preview.fileLabel.spreadsheet",
  presentation: "task.preview.fileLabel.presentation",
  code: "task.preview.fileLabel.code",
  image: "task.preview.fileLabel.image",
  generic: "task.preview.fileLabel.generic",
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
  const { t } = useTranslation();
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

  const opener = OPENER_BY_TYPE[file.type];
  const fileLabel = t(FILE_LABEL_KEY_BY_TYPE[file.type]);
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
        aria-label={t("task.preview.resizeHandle")}
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
          aria-label={t("task.preview.refresh")}
          className="rounded-md p-1.5 transition hover:bg-muted hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <RotateCw className="size-[13px]" />
        </button>
        <button
          type="button"
          aria-label={t("task.preview.close")}
          onClick={onClose}
          className="rounded-md p-1.5 transition hover:bg-muted hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <X className="size-[14px]" />
        </button>
      </header>

      {/* Body — zoom the content proportionally with the pane width so tables /
          slides / docs scale rather than reflow. `zoom` chosen over
          `transform: scale` because it affects layout (scrollbar bounds + flex
          height adapt). The wrapper keeps a constant 480px design width; the
          inner scales relative to that. */}
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
          <PreviewContent file={file} />
        </div>
      </div>
    </aside>
  );
}

function PreviewContent({ file }: { file: MockFile }) {
  const { t } = useTranslation();
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
          {t("task.preview.notImplemented", { type: file.type })}
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

const MOCK_SLIDE_KEYS = ["overview", "top3", "suggestion"] as const;

function PresentationPreview() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {MOCK_SLIDE_KEYS.map((key) => (
        <div
          key={key}
          className="rounded-md p-8 text-[hsl(var(--always-white))]"
          style={{ background: "hsl(var(--bg-300))" }}
        >
          <div className="font-semibold font-serif text-xl">
            {t(`task.preview.slides.${key}.title`)}
          </div>
          <div className="mt-2 text-sm opacity-80">
            {t(`task.preview.slides.${key}.subtitle`)}
          </div>
        </div>
      ))}
    </div>
  );
}

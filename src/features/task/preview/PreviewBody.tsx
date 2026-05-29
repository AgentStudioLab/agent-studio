// PreviewBody — dispatcher between renderers.
//
// Responsibilities:
//   - render loading / error states uniformly
//   - on success, pick a renderer based on (file.type, data.encoding) and
//     hand off the full PreviewRendererProps shape
//
// Adding a new file type means adding one renderer file + one switch arm
// here. The renderers themselves are pure presentation; everything in
// useFileContent (size cap, sandboxing, refetch) is handled by PreviewPane.

import { useTranslation } from "react-i18next";
import type { FileContentBody, FileContentError } from "@/lib/agui/react/useFileContent";
import type { MockFile } from "@/lib/mock/types";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { HtmlRenderer } from "./renderers/HtmlRenderer";
import { CodeRenderer } from "./renderers/CodeRenderer";
import { SpreadsheetRenderer } from "./renderers/SpreadsheetRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";
import { GenericTextRenderer } from "./renderers/GenericTextRenderer";
import { BinaryFallbackRenderer } from "./renderers/BinaryFallbackRenderer";
import type { MarkdownViewMode } from "./MarkdownViewToggle";

interface PreviewBodyProps {
  file: MockFile;
  data: FileContentBody | null;
  error: FileContentError | null;
  isLoading: boolean;
  onOpenExternal: () => void;
  /**
   * Preview-vs-source toggle, shared by the renderers that support it
   * (markdown + html — identical semantics). Other renderers ignore it.
   */
  viewMode: MarkdownViewMode;
}

export function PreviewBody({
  file,
  data,
  error,
  isLoading,
  onOpenExternal,
  viewMode,
}: PreviewBodyProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        className="px-4 py-8 text-center text-[13px] italic"
        style={{ color: "hsl(var(--text-400))" }}
      >
        {t("task.preview.loading")}
      </div>
    );
  }

  if (error) {
    let msg: string;
    switch (error.kind) {
      case "not_found":
        msg = t("task.preview.errorNotFound");
        break;
      case "outside_workspace":
        msg = t("task.preview.errorOutsideWorkspace");
        break;
      case "too_large":
        msg = t("task.preview.errorTooLarge");
        break;
      case "missing_param":
      case "read_failed":
        msg = t("task.preview.errorReadFailed", {
          detail: error.kind === "read_failed" ? error.detail : "missing param",
        });
        break;
    }
    return (
      <div
        className="px-4 py-8 text-center text-[13px]"
        style={{ color: "hsl(var(--danger-100))" }}
      >
        {msg}
      </div>
    );
  }

  if (!data) return null;

  const props = { file, data, onOpenExternal };

  // Binary → base64. Images get an inline renderer; everything else
  // (presentation, generic binary, future pptx/xlsx) hits the fallback
  // CTA for now. When dedicated pptx/xlsx renderers land they'll branch
  // here.
  if (data.encoding === "base64") {
    if (file.type === "image") return <ImageRenderer {...props} />;
    return <BinaryFallbackRenderer {...props} />;
  }

  // utf8 — text renderers keyed by file.type.
  switch (file.type) {
    case "markdown":
      return <MarkdownRenderer {...props} mode={viewMode} />;
    case "html":
      return <HtmlRenderer {...props} mode={viewMode} />;
    case "spreadsheet":
      return <SpreadsheetRenderer {...props} />;
    case "code":
      return <CodeRenderer {...props} />;
    default:
      return <GenericTextRenderer {...props} />;
  }
}

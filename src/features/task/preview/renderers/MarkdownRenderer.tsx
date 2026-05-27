// Markdown file renderer — two display modes:
//   - "preview" (default): rendered via the shared MarkdownView (Streamdown
//     + cjk/code/math/mermaid plugins, GitHub-themed code fences).
//   - "source": raw markdown shown via the project's CodeBlock with the
//     "markdown" language. Useful when the user wants to copy / inspect the
//     raw source rather than the rendered output.
//
// Mode is owned by PreviewPane (so the toggle button in the header drives
// it) and threaded through PreviewBody. Other renderers ignore the prop.

import { CodeBlock } from "@/components/ai-elements/code-block";
import { MarkdownView } from "@/shared/markdown/MarkdownView";
import type { MarkdownViewMode } from "../MarkdownViewToggle";
import type { PreviewRendererProps } from "./types";

interface MarkdownRendererProps extends PreviewRendererProps {
  mode: MarkdownViewMode;
}

export function MarkdownRenderer({ data, mode }: MarkdownRendererProps) {
  if (mode === "source") {
    return (
      <div className="p-1">
        <CodeBlock code={data.content} language="markdown" />
      </div>
    );
  }
  return (
    <MarkdownView
      content={data.content}
      className="prose-stream px-3 py-2 text-[14px] leading-[1.75]"
    />
  );
}

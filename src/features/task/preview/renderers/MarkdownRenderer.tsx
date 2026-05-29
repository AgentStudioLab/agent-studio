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
    // Fill the pane height; scroll INSIDE the code block (its inner content
    // area flex-fills the block height + scrolls). See HtmlRenderer for the
    // rationale behind the flex + [&>div] + contentVisibility combo.
    return (
      <div className="h-full">
        <CodeBlock
          code={data.content}
          language="markdown"
          className="flex h-full flex-col rounded-none border-0 [&>div]:min-h-0 [&>div]:flex-1"
          style={{ contentVisibility: "visible" }}
        />
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

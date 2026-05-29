// Code-file renderer — shiki-highlighted code block.
// Language inferred from file extension via the shared helper.

import { CodeBlock } from "@/components/ai-elements/code-block";
import { languageFromPath } from "@/lib/code-lang";
import type { PreviewRendererProps } from "./types";

export function CodeRenderer({ file, data }: PreviewRendererProps) {
  // Fill the pane height; scroll INSIDE the code block (its inner content area
  // flex-fills the block height + scrolls). See HtmlRenderer for the rationale
  // behind the flex + [&>div] + contentVisibility combo.
  return (
    <div className="h-full">
      <CodeBlock
        code={data.content}
        language={languageFromPath(file.path)}
        className="flex h-full flex-col rounded-none border-0 [&>div]:min-h-0 [&>div]:flex-1"
        style={{ contentVisibility: "visible" }}
      />
    </div>
  );
}

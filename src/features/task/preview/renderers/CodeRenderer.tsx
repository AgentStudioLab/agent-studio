// Code-file renderer — shiki-highlighted code block.
// Language inferred from file extension via the shared helper.

import { CodeBlock } from "@/components/ai-elements/code-block";
import { languageFromPath } from "@/lib/code-lang";
import type { PreviewRendererProps } from "./types";

export function CodeRenderer({ file, data }: PreviewRendererProps) {
  return (
    <div className="p-1">
      <CodeBlock code={data.content} language={languageFromPath(file.path)} />
    </div>
  );
}

// MarkdownView — static markdown renderer for file previews and similar
// non-streaming surfaces.
//
// Differs from ChatStream's inline Streamdown usage in that:
//   - it does NOT enable streaming mode / parseIncompleteMarkdown — the
//     content is a complete file
//   - it loads the cjk/code/math/mermaid plugins (mirroring the chat
//     MessageResponse) so CJK punctuation, fenced math, and mermaid diagrams
//     all render correctly in the side preview
//   - it uses the shared MarkdownCodeBlock override so fenced code matches
//     the rest of the project's visual treatment
//
// The component itself is intentionally light — typography styling
// (prose-stream / leading / color) is applied by the wrapping container so
// each callsite can theme the body to its own surface.

import { Streamdown } from "streamdown";
import { STREAMDOWN_COMPONENTS } from "./MarkdownCodeBlock";
import { STREAMDOWN_PLUGINS } from "./streamdownPlugins";
import { splitFrontmatter } from "./frontmatter";
import { FrontmatterPanel } from "./FrontmatterPanel";

export interface MarkdownViewProps {
  content: string;
  className?: string;
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  // Leading YAML frontmatter renders as its own metadata panel (Streamdown
  // would otherwise mis-render the block as a giant heading); the body streams
  // through Streamdown as usual.
  const { frontmatter, body } = splitFrontmatter(content);
  return (
    <div className={className}>
      {frontmatter !== null && <FrontmatterPanel raw={frontmatter} />}
      <Streamdown plugins={STREAMDOWN_PLUGINS} components={STREAMDOWN_COMPONENTS}>
        {body}
      </Streamdown>
    </div>
  );
}

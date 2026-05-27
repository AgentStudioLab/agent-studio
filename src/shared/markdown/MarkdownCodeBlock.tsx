// Code-fence renderer override for Streamdown.
//
// Streamdown's default `<pre><code>` HTML is replaced with the project's
// `<CodeBlock>` primitive (shiki + GitHub themes + copy button + filename
// header) so code visuals match across chat, file preview, and any other
// surface that renders markdown.
//
// Shared between ChatStream (streaming assistant output) and PreviewPane's
// MarkdownView (static file preview). Both pass this as `components={{ pre }}`
// to Streamdown.

import { isValidElement, type ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";

export function MarkdownCodeBlock({
  children,
}: {
  children?: ReactNode;
}): ReactNode {
  let className = "";
  let code = "";
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    className = children.props.className ?? "";
    code = String(children.props.children ?? "").replace(/\n$/, "");
  } else if (typeof children === "string") {
    code = children;
  }
  const lang = (/language-([\w-]+)/.exec(className)?.[1] ?? "text") as
    | BundledLanguage
    | "text";
  return (
    <CodeBlock
      code={code}
      language={lang as BundledLanguage}
      className="my-3"
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{lang}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

export const STREAMDOWN_COMPONENTS = {
  pre: MarkdownCodeBlock,
};

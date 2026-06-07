import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import { cloneElement, isValidElement, type ReactNode } from "react";
import type { PluginConfig } from "streamdown";
import {
  MarkdownCodeBlock,
  STREAMDOWN_COMPONENTS,
} from "./MarkdownCodeBlock";
import { MarkdownMermaidBlock } from "./MarkdownMermaidBlock";

function MarkdownPreBlock({ children }: { children?: ReactNode }): ReactNode {
  if (
    isValidElement<{ className?: string; children?: ReactNode }>(children) &&
    /\blanguage-mermaid\b/.test(children.props.className ?? "")
  ) {
    // Mermaid 代码块交回 Streamdown 的 block-code renderer，才能命中 plugins.renderers。
    return cloneElement(children, { "data-block": "true" } as Partial<
      typeof children.props
    >);
  }

  return <MarkdownCodeBlock>{children}</MarkdownCodeBlock>;
}

export const STREAMDOWN_MARKDOWN_COMPONENTS = {
  ...STREAMDOWN_COMPONENTS,
  pre: MarkdownPreBlock,
};

export const STREAMDOWN_MERMAID_PLUGIN = createMermaidPlugin({
  config: {
    securityLevel: "strict",
    startOnLoad: false,
    suppressErrorRendering: true,
  },
});

export const STREAMDOWN_PLUGINS: PluginConfig = {
  cjk,
  code,
  math,
  mermaid: STREAMDOWN_MERMAID_PLUGIN,
  renderers: [
    {
      component: MarkdownMermaidBlock,
      language: "mermaid",
    },
  ],
};

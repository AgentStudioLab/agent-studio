// Map a file path's extension to a shiki BundledLanguage so callers can
// render the file's contents with proper syntax highlighting.
//
// Used by:
//   - PreviewPane → CodeRenderer (file preview pane)
//   - ToolApprovalCard → renderWrite / renderEdit (HITL approval card
//     showing the contents the agent is about to write or edit)
//
// Unknown extensions fall back to "typescript" because most code surfaced
// in this project is TS/TSX; the cost of mis-highlighting plain text as TS
// is mostly cosmetic, whereas falling back to "text" loses highlighting on
// anything we don't enumerate (e.g. .mjs / .cjs / .mts).

import type { BundledLanguage } from "shiki";

const EXTENSION_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  rb: "ruby",
  php: "php",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
  vue: "vue",
  svelte: "svelte",
};

export function languageFromPath(path: string): BundledLanguage {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "typescript";
  const ext = lower.slice(dot + 1);
  return EXTENSION_TO_LANG[ext] ?? "typescript";
}

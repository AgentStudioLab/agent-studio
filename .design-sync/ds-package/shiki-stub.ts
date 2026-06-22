// shiki 的全语言语法（@shikijs/langs ~8MB）在 iife 里无法 code-split，会被全量
// 内联，单算就超 5MB 上限。CodeBlock 自带 createRawTokens 回退路径，因此这里让
// createHighlighter 返回一个「纯文本」高亮器：代码原样按行成单 token、颜色 inherit，
// 即降级为无语法着色的代码（不崩溃、文字仍可读）。详见 .design-sync/NOTES.md。
export async function createHighlighter() {
  return {
    getLoadedLanguages: () => ["text"],
    codeToTokens: (code: string) => ({
      bg: "transparent",
      fg: "inherit",
      tokens: String(code)
        .split("\n")
        .map((line) => (line === "" ? [] : [{ content: line, color: "inherit" }])),
    }),
    codeToHtml: (code: string) => `<pre>${String(code)}</pre>`,
  };
}

export function getSingletonHighlighter() {
  return createHighlighter();
}

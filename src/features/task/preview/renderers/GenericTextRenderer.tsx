// Plain-text fallback for utf8 files we don't have a dedicated renderer for.
// Keeps whitespace + uses a monospaced face so log lines / config files stay
// readable.

import type { PreviewRendererProps } from "./types";

export function GenericTextRenderer({ data }: PreviewRendererProps) {
  return (
    <pre
      className="overflow-auto whitespace-pre-wrap p-3 text-[12.5px] font-mono"
      style={{ color: "hsl(var(--text-100))" }}
    >
      {data.content}
    </pre>
  );
}

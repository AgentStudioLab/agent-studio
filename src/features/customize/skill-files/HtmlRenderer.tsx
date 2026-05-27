import { useEffect, useMemo, useState } from "react";
import {
  WebPreview,
  WebPreviewBody,
} from "@/components/ai-elements/web-preview";
import { CodeBlock } from "@/components/ai-elements/code-block";
import type { FilePreviewMode } from "./SkillFilePreviewHeader";

interface HtmlRendererProps {
  /** Raw HTML source. */
  content: string;
  mode: FilePreviewMode;
}

/**
 * Two modes for personal-skill HTML files:
 *
 * - `preview`: feed the HTML into ai-elements' `<WebPreviewBody>` (sandboxed
 *   iframe) via a blob: URL. Blob URLs render reliably for arbitrary-size
 *   payloads and dispose cleanly when this component unmounts. We avoid
 *   `srcDoc` because WebPreviewBody only exposes `src`.
 * - `source`: syntax-highlighted HTML via the shared CodeBlock — same look
 *   as every other source view in the app.
 *
 * Iframe sandbox flags are inherited from WebPreviewBody:
 *   allow-scripts allow-same-origin allow-forms allow-popups allow-presentation
 * Acceptable here because the HTML originates from the user's own skill dir
 * on disk — same trust boundary as opening the file in their editor.
 */
export function HtmlRenderer({ content, mode }: HtmlRendererProps) {
  const blobUrl = useBlobUrl(content, mode);

  if (mode === "source") {
    return (
      <div className="p-1">
        <CodeBlock code={content} language="html" />
      </div>
    );
  }
  if (!blobUrl) {
    // Hook hasn't produced a URL yet (first render before useEffect). Render
    // an empty preview shell so layout doesn't jump when the iframe lands.
    return <WebPreview className="h-full border-0 bg-transparent" />;
  }
  return (
    <WebPreview defaultUrl={blobUrl} className="h-full border-0 bg-transparent">
      <WebPreviewBody src={blobUrl} className="border-0 bg-white" />
    </WebPreview>
  );
}

/**
 * Materialize the HTML content as a blob: URL so the iframe can load it.
 * Only allocates when `mode === "preview"` (source view doesn't need it),
 * and revokes the previous URL whenever the content changes — important on
 * fast file switching where stale URLs would otherwise leak.
 */
function useBlobUrl(content: string, mode: FilePreviewMode): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const blob = useMemo(
    () => (mode === "preview" ? new Blob([content], { type: "text/html" }) : null),
    [content, mode],
  );
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [blob]);
  return url;
}

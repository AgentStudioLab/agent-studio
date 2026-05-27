// Shared contract for every preview renderer.
//
// PreviewBody is the dispatcher — it routes a (file, data) pair to a
// renderer based on `file.type` plus `data.encoding`. All renderers accept
// the same prop shape so adding xlsx / pptx renderers later is just one
// new file + one switch arm.
//
// Renderer rules:
//   - assume `data` is non-null (PreviewBody short-circuits loading/error)
//   - never refetch the file — read from `data.content` (utf8) or treat
//     it as base64 (binary). Renderers that need richer parsed data
//     (xlsx → rows, pptx → slide images) should fetch their own endpoint
//     from sidecar, NOT from `data.content`.
//   - call `onOpenExternal` when the user clicks "open in external app".
//     The Open-with action lives in the header (OpenerMenu); a renderer
//     only calls it from inside its own body for fallbacks like the
//     binary "we can't preview this here" CTA.

import type { FileContentBody } from "@/lib/agui/react/useFileContent";
import type { MockFile } from "@/lib/mock/types";

export interface PreviewRendererProps {
  file: MockFile;
  data: FileContentBody;
  onOpenExternal: () => void;
}

// Image renderer — render base64 content as a data: URI.
//
// MIME is inferred from extension (covers the file types Files Tab whitelists
// today; SVG keeps the `image/svg+xml` mime so embedded styles render).

import type { PreviewRendererProps } from "./types";

function imageDataUri(path: string, base64: string): string {
  const lower = path.toLowerCase();
  let mime = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
  else if (lower.endsWith(".gif")) mime = "image/gif";
  else if (lower.endsWith(".svg")) mime = "image/svg+xml";
  else if (lower.endsWith(".webp")) mime = "image/webp";
  return `data:${mime};base64,${base64}`;
}

export function ImageRenderer({ file, data }: PreviewRendererProps) {
  return (
    <div className="flex justify-center p-4">
      <img
        src={imageDataUri(file.path, data.content)}
        alt={file.name}
        className="max-w-full rounded-md"
      />
    </div>
  );
}

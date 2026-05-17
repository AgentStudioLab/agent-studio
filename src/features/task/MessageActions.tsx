import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";

/**
 * Copy / ThumbUp / ThumbDown action row below an assistant turn.
 * Prototype Showcase 1 lines 897-903.
 */
export function MessageActions() {
  return (
    <div className="-ml-1.5 flex items-center gap-1 pt-2">
      <button
        type="button"
        aria-label="Copy"
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        aria-label="Thumbs up"
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        aria-label="Thumbs down"
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}

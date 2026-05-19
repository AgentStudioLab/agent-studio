import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Copy / ThumbUp / ThumbDown action row below an assistant turn.
 * Prototype Showcase 1 lines 897-903.
 */
export function MessageActions() {
  const { t } = useTranslation();
  return (
    <div className="-ml-1.5 flex items-center gap-1 pt-2">
      <button
        type="button"
        aria-label={t("task.messageActions.copy")}
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        aria-label={t("task.messageActions.thumbsUp")}
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        aria-label={t("task.messageActions.thumbsDown")}
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}

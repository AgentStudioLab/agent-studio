import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Copy action row below an assistant turn. Thumbs up / down were removed
 * (the UX wasn't wired to anything actionable — feedback loop wasn't built).
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
    </div>
  );
}

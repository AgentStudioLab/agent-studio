// Footer row for AskUserCard: left side shows status (N selected for
// multi-select), right side has Skip + Next/Send buttons.
//
// On the LAST page, the Next button becomes the brand-orange Send button —
// a stronger visual affordance for the terminal action. Single-select pages
// auto-advance, so the Next button on those pages mostly serves as a
// keyboard target (Enter focus) — but we still render it for affordance.

import { ArrowRight, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AskUserFooterProps {
  selectedCount: number;
  showSelectedCount: boolean;
  isLastPage: boolean;
  canAdvance: boolean;
  onSkip: () => void;
  onAdvance: () => void;
}

export function AskUserFooter({
  selectedCount,
  showSelectedCount,
  isLastPage,
  canAdvance,
  onSkip,
  onAdvance,
}: AskUserFooterProps) {
  const { t } = useTranslation();
  return (
    <footer
      className="flex items-center gap-2 px-4 pb-3 pt-2"
      style={{ borderTop: "1px solid hsl(var(--border-300) / 0.08)" }}
    >
      <div
        className="min-w-0 flex-1 text-[12px]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        {showSelectedCount &&
          t("task.askUser.selectedCount", { count: selectedCount })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="rounded-md border px-3 py-1 text-[12px] transition hover:bg-muted"
        style={{
          color: "hsl(var(--text-200))",
          borderColor: "hsl(var(--border-300) / 0.2)",
        }}
      >
        {t("task.askUser.skip")}
      </button>
      <button
        type="button"
        onClick={onAdvance}
        disabled={!canAdvance}
        aria-label={isLastPage ? t("task.askUser.send") : t("task.askUser.next")}
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-3 text-[12px] font-medium transition disabled:opacity-40",
          isLastPage
            ? "text-[hsl(var(--oncolor-100))]"
            : "border",
        )}
        style={
          isLastPage
            ? { background: "hsl(var(--brand-100))" }
            : {
                color: "hsl(var(--text-100))",
                borderColor: "hsl(var(--border-300) / 0.2)",
              }
        }
      >
        {isLastPage ? (
          <>
            {t("task.askUser.send")}
            <Send size={12} />
          </>
        ) : (
          <ArrowRight size={14} />
        )}
      </button>
    </footer>
  );
}

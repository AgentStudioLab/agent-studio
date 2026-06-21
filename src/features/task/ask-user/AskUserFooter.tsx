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
  submitted: boolean;
  onSkip: () => void;
  onAdvance: () => void;
}

export function AskUserFooter({
  selectedCount,
  showSelectedCount,
  isLastPage,
  canAdvance,
  submitted,
  onSkip,
  onAdvance,
}: AskUserFooterProps) {
  const { t } = useTranslation();
  return (
    <footer className="flex items-center gap-2 border-t border-border px-4 pb-3 pt-2">
      <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">
        {showSelectedCount &&
          t("task.askUser.selectedCount", { count: selectedCount })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={submitted}
        className="rounded-md border border-border px-3 py-1 text-[12px] text-foreground transition hover:bg-muted disabled:opacity-40"
      >
        {t("task.askUser.skip")}
      </button>
      <button
        type="button"
        onClick={onAdvance}
        disabled={submitted || !canAdvance}
        aria-label={isLastPage ? t("task.askUser.send") : t("task.askUser.next")}
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-3 text-[12px] font-medium transition disabled:opacity-40",
          isLastPage
            ? "bg-primary text-primary-foreground"
            : "border border-border text-foreground hover:bg-muted",
        )}
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

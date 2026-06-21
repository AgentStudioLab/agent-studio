// Header row: question header chip + "N of M" pagination + X close.
//
// The X is a "submit current state" close — closing the card flushes whatever
// the user has answered so far, marking the rest as skipped. This mirrors
// the spec decision "send partial answers + null for unanswered".

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AskUserHeaderProps {
  header: string;
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  submitted: boolean;
}

export function AskUserHeader({
  header,
  page,
  total,
  onPrev,
  onNext,
  onClose,
  submitted,
}: AskUserHeaderProps) {
  const { t } = useTranslation();
  const canPrev = !submitted && page > 0;
  const canNext = !submitted && page < total - 1;

  return (
    <header className="flex items-center gap-3 px-4 pt-3">
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
        {header}
      </span>
      <div className="flex items-center gap-0.5 text-[12px] text-muted-foreground">
        <button
          type="button"
          aria-label={t("task.askUser.prevPage")}
          onClick={onPrev}
          disabled={!canPrev}
          className={cn(
            "rounded p-0.5 transition",
            canPrev ? "hover:text-foreground" : "opacity-40",
          )}
        >
          <ChevronLeft size={13} />
        </button>
        <span className="px-1">
          {t("task.askUser.pageOf", { page: page + 1, total })}
        </span>
        <button
          type="button"
          aria-label={t("task.askUser.nextPage")}
          onClick={onNext}
          disabled={!canNext}
          className={cn(
            "rounded p-0.5 transition",
            canNext ? "hover:text-foreground" : "opacity-40",
          )}
        >
          <ChevronRight size={13} />
        </button>
      </div>
      <button
        type="button"
        aria-label={t("task.askUser.close")}
        onClick={onClose}
        disabled={submitted}
        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <X size={14} />
      </button>
    </header>
  );
}
